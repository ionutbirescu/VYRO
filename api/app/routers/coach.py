from datetime import UTC, datetime, timedelta
from uuid import UUID

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth import CurrentUser
from app.coach import agent, rescue
from app.config import get_settings
from app.db import DbSession
from app.enums import InterventionKind
from app.models import CoachConversation, CoachIntervention, Event, User
from app.schemas.coach import CoachConversation as ConversationOut
from app.schemas.coach import (
    CoachDecision,
    CoachMessageIn,
    LighterTask,
    PendingAction,
    RescueOffer,
)
from app.services import vertex

router = APIRouter(
    tags=["coach"],
    responses={
        status.HTTP_429_TOO_MANY_REQUESTS: {"description": "Daily coach message limit reached"},
        status.HTTP_503_SERVICE_UNAVAILABLE: {"description": "AI is not configured"},
    },
)

COACH_FAILED = "The coach couldn't reply just now. Try again in a moment."


def _out(db: Session, user: User, conversation: CoachConversation, error: str | None = None):
    question = agent.pending_summary(db, user, conversation)
    return ConversationOut(
        id=conversation.id,
        messages=agent.messages(conversation),
        pending_action=PendingAction(question=question) if question else None,
        error=error,
        updated_at=conversation.updated_at,
    )


def _require_ai() -> None:
    if not vertex.enabled():
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "The coach needs AI configured")


def _check_daily_limit(db: Session, user: User, now: datetime) -> None:
    sent = db.scalar(
        select(func.count())
        .select_from(Event)
        .where(
            Event.user_id == user.id,
            Event.name == "coach_message_sent",
            Event.created_at > now - timedelta(days=1),
        )
    )
    if (sent or 0) >= get_settings().ai_coach_daily_messages:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS, "You've sent a lot today. Try again tomorrow."
        )


def _get(db: Session, user: User, conversation_id: UUID) -> CoachConversation:
    conversation = db.get(CoachConversation, conversation_id)
    if conversation is None or conversation.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Conversation not found")
    return conversation


def _continue(db: Session, user: User, conversation: CoachConversation, step) -> ConversationOut:
    try:
        step()
    except vertex.AiError:
        db.rollback()
        return _out(db, user, conversation, COACH_FAILED)
    return _out(db, user, conversation)


def rescue_offer(intervention: CoachIntervention) -> RescueOffer:
    action = intervention.action
    return RescueOffer(
        id=intervention.id,
        kind=intervention.kind,
        status=intervention.status,
        message=intervention.message,
        accept_label=rescue.ACCEPT_LABELS[intervention.kind],
        challenge_id=intervention.challenge_id,
        lighter_task=(
            LighterTask(
                title=action["title"],
                instructions=action["instructions"],
                proof_hint=action["proof_hint"],
            )
            if intervention.kind is InterventionKind.TASK_SWAP
            else None
        ),
        chosen_by="agent" if intervention.source == "agent" else "rules",
        created_at=intervention.created_at,
    )


def _intervention(db: Session, user: User, intervention_id: UUID) -> CoachIntervention:
    intervention = db.get(CoachIntervention, intervention_id)
    if intervention is None or intervention.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Suggestion not found")
    return intervention


@router.get("/coach/rescue")
def get_streak_rescue(user: CurrentUser, db: DbSession) -> RescueOffer | None:
    """Today's streak rescue suggestion, or null when nothing needs rescuing.

    Call it when the app opens. The first call of the day where a challenge is at risk lets the
    coach choose one suggestion (a few seconds with AI); later calls return the same one. Works
    without AI too, with rule-based suggestions.
    """
    intervention = rescue.todays_intervention(db, user, datetime.now(UTC))
    return rescue_offer(intervention) if intervention else None


@router.post(
    "/coach/rescue/{intervention_id}/accept",
    responses={status.HTTP_409_CONFLICT: {"description": "Already answered, or out of date"}},
)
def accept_streak_rescue(intervention_id: UUID, user: CurrentUser, db: DbSession) -> RescueOffer:
    """Do what the suggestion offered: swap in the lighter task, or join the challenge."""
    intervention = _intervention(db, user, intervention_id)
    rescue.accept(db, user, intervention, datetime.now(UTC))
    return rescue_offer(intervention)


@router.post(
    "/coach/rescue/{intervention_id}/dismiss",
    responses={status.HTTP_409_CONFLICT: {"description": "Already answered, or out of date"}},
)
def dismiss_streak_rescue(intervention_id: UUID, user: CurrentUser, db: DbSession) -> RescueOffer:
    """Not today. No other suggestion comes until tomorrow."""
    intervention = _intervention(db, user, intervention_id)
    rescue.dismiss(db, user, intervention, datetime.now(UTC))
    return rescue_offer(intervention)


@router.get("/coach/conversations/latest")
def get_latest_conversation(user: CurrentUser, db: DbSession) -> ConversationOut | None:
    """The user's most recent conversation, or null if they haven't talked to the coach."""
    conversation = db.scalar(
        select(CoachConversation)
        .where(CoachConversation.user_id == user.id)
        .order_by(CoachConversation.updated_at.desc())
        .limit(1)
    )
    return _out(db, user, conversation) if conversation else None


@router.post("/coach/conversations", status_code=status.HTTP_201_CREATED)
def start_conversation(body: CoachMessageIn, user: CurrentUser, db: DbSession) -> ConversationOut:
    """Start a new conversation with a first message. The reply can take several seconds."""
    _require_ai()
    now = datetime.now(UTC)
    _check_daily_limit(db, user, now)
    conversation = CoachConversation(user_id=user.id, contents=[])
    db.add(conversation)
    db.commit()
    return _continue(
        db, user, conversation, lambda: agent.add_message(db, user, conversation, body.text, now)
    )


@router.post("/coach/conversations/{conversation_id}/messages")
def send_message(
    conversation_id: UUID, body: CoachMessageIn, user: CurrentUser, db: DbSession
) -> ConversationOut:
    """Send a message. If an action is waiting for approval, this declines it."""
    _require_ai()
    now = datetime.now(UTC)
    _check_daily_limit(db, user, now)
    conversation = _get(db, user, conversation_id)
    return _continue(
        db, user, conversation, lambda: agent.add_message(db, user, conversation, body.text, now)
    )


@router.post("/coach/conversations/{conversation_id}/decision")
def decide_action(
    conversation_id: UUID, body: CoachDecision, user: CurrentUser, db: DbSession
) -> ConversationOut:
    """Approve or decline the action the coach is waiting on."""
    _require_ai()
    conversation = _get(db, user, conversation_id)
    if not conversation.pending:
        raise HTTPException(status.HTTP_409_CONFLICT, "Nothing is waiting for approval")
    now = datetime.now(UTC)
    return _continue(
        db,
        user,
        conversation,
        lambda: agent.resolve_pending(db, user, conversation, body.approve, now),
    )


@router.post("/coach/conversations/{conversation_id}/retry")
def retry_reply(conversation_id: UUID, user: CurrentUser, db: DbSession) -> ConversationOut:
    """Ask the coach again after it failed to reply."""
    _require_ai()
    conversation = _get(db, user, conversation_id)
    if (
        conversation.pending
        or not conversation.contents
        or conversation.contents[-1]["role"] != "user"
    ):
        raise HTTPException(status.HTTP_409_CONFLICT, "The coach has already replied")
    now = datetime.now(UTC)
    return _continue(db, user, conversation, lambda: agent.run(db, user, conversation, now))
