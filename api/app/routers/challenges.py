from datetime import UTC, datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Body, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.auth import CurrentUser
from app.db import DbSession
from app.enums import Category, ChallengeSource, ParticipationStatus
from app.models import AiGeneration, Challenge, ChallengeTask, Participation, User
from app.pagination import page
from app.schemas.challenges import (
    ChallengeCreate,
    ChallengeDetail,
    ChallengeDraft,
    ChallengePage,
    JoinRequest,
    ParticipationPage,
    ParticipationWithChallenge,
    Task,
)
from app.schemas.challenges import Participation as ParticipationOut
from app.schemas.common import Difficulty, DurationDaysQuery, Limit
from app.services import achievements, events, progress
from app.services.challenges import get_visible, participation_out, summaries, visible_to

router = APIRouter(tags=["challenges"])


def _escape_like(text: str) -> str:
    return text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


@router.get("/challenges")
def list_challenges(
    user: CurrentUser,
    db: DbSession,
    category: Category | None = None,
    difficulty: Difficulty | None = None,
    duration_days: DurationDaysQuery | None = None,
    q: Annotated[str | None, Query(max_length=64, description="Search in titles")] = None,
    cursor: str | None = None,
    limit: Limit = 20,
) -> ChallengePage:
    """Browse challenges the current user can see (public, or friends-only from friends)."""
    stmt = select(Challenge).where(visible_to(user.id))
    if category:
        stmt = stmt.where(Challenge.category == category)
    if difficulty:
        stmt = stmt.where(Challenge.difficulty == difficulty)
    if duration_days:
        stmt = stmt.where(Challenge.duration_days == duration_days)
    if q and q.strip():
        stmt = stmt.where(Challenge.title.ilike(f"%{_escape_like(q.strip())}%", escape="\\"))
    challenges, next_cursor = page(db, stmt, Challenge.created_at, Challenge.id, cursor, limit)
    return ChallengePage(items=summaries(db, challenges), next_cursor=next_cursor)


def _publish_generation(db: Session, user: User, body: ChallengeCreate, now: datetime) -> None:
    """Mark the AI draft as published and record whether the user edited it first."""
    generation = db.get(AiGeneration, body.generation_id)
    if generation is None or generation.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "AI draft not found")
    if generation.output is None or generation.published_at is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "This AI draft can't be published")
    published = ChallengeDraft.model_validate(
        body.model_dump(include=set(ChallengeDraft.model_fields))
    )
    generation.published_at = now
    generation.edited_before_publish = published.model_dump(mode="json") != generation.output


def _detail(db: Session, user: User, challenge: Challenge) -> ChallengeDetail:
    latest = db.scalar(
        select(Participation)
        .where(Participation.user_id == user.id, Participation.challenge_id == challenge.id)
        .order_by(
            (Participation.status == ParticipationStatus.ACTIVE).desc(),
            Participation.joined_at.desc(),
            Participation.id.desc(),
        )
        .limit(1)
    )
    return ChallengeDetail(
        **summaries(db, [challenge])[0].model_dump(),
        tasks=[Task.model_validate(task) for task in challenge.tasks],
        my_participation=participation_out(latest) if latest else None,
    )


@router.post("/challenges", status_code=status.HTTP_201_CREATED)
def create_challenge(body: ChallengeCreate, user: CurrentUser, db: DbSession) -> ChallengeDetail:
    """Publish a challenge. XP values are assigned by the server from the difficulty."""
    now = datetime.now(UTC)
    if body.generation_id:
        _publish_generation(db, user, body, now)
    challenge = Challenge(
        title=body.title,
        description=body.description,
        category=body.category,
        difficulty=body.difficulty,
        duration_days=body.duration_days,
        completion_xp=progress.completion_xp(body.difficulty, body.duration_days),
        source=ChallengeSource.AI if body.generation_id else ChallengeSource.USER,
        visibility=body.visibility,
        creator_id=user.id,
        generation_id=body.generation_id,
        tasks=[
            ChallengeTask(
                day_number=task.day_number,
                title=task.title,
                instructions=task.instructions,
                proof_hint=task.proof_hint,
                xp=progress.task_xp(body.difficulty),
            )
            for task in sorted(body.tasks, key=lambda task: task.day_number)
        ],
    )
    db.add(challenge)
    db.flush()
    events.log(
        db,
        user,
        "challenge_created",
        challenge_id=challenge.id,
        source=challenge.source,
        category=challenge.category,
        difficulty=challenge.difficulty,
        duration_days=challenge.duration_days,
        visibility=challenge.visibility,
        generation_id=challenge.generation_id,
    )
    achievements.unlock_new(db, user, now)
    db.commit()
    return _detail(db, user, challenge)


@router.get("/challenges/{challenge_id}")
def get_challenge(challenge_id: UUID, user: CurrentUser, db: DbSession) -> ChallengeDetail:
    return _detail(db, user, get_visible(db, user, challenge_id))


def _active_participation(db: Session, user: User, challenge_id: UUID) -> Participation | None:
    return db.scalar(
        select(Participation).where(
            Participation.user_id == user.id,
            Participation.challenge_id == challenge_id,
            Participation.status == ParticipationStatus.ACTIVE,
        )
    )


@router.post(
    "/challenges/{challenge_id}/join",
    status_code=status.HTTP_201_CREATED,
    responses={status.HTTP_409_CONFLICT: {"description": "Already active in this challenge"}},
)
def join_challenge(
    challenge_id: UUID,
    user: CurrentUser,
    db: DbSession,
    body: Annotated[JoinRequest | None, Body()] = None,
) -> ParticipationOut:
    challenge = get_visible(db, user, challenge_id)
    progress.lock(db, user)
    if _active_participation(db, user, challenge_id):
        raise HTTPException(status.HTTP_409_CONFLICT, "You are already in this challenge")
    participation = Participation(
        user_id=user.id,
        challenge_id=challenge.id,
        challenge=challenge,
        recommendation_id=body.recommendation_id if body else None,
    )
    db.add(participation)
    db.flush()
    events.log(
        db,
        user,
        "challenge_joined",
        challenge_id=challenge.id,
        participation_id=participation.id,
        recommendation_id=participation.recommendation_id,
        category=challenge.category,
        difficulty=challenge.difficulty,
        duration_days=challenge.duration_days,
    )
    db.commit()
    return participation_out(participation)


@router.post("/challenges/{challenge_id}/leave")
def leave_challenge(challenge_id: UUID, user: CurrentUser, db: DbSession) -> ParticipationOut:
    """Abandon the current user's active participation."""
    progress.lock(db, user)
    participation = _active_participation(db, user, challenge_id)
    if participation is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "You are not in this challenge")
    participation.status = ParticipationStatus.ABANDONED
    participation.ended_at = datetime.now(UTC)
    events.log(
        db,
        user,
        "challenge_left",
        challenge_id=challenge_id,
        participation_id=participation.id,
        completed_tasks=participation.completed_tasks,
    )
    db.commit()
    return participation_out(participation)


@router.get("/me/participations")
def list_my_participations(
    user: CurrentUser,
    db: DbSession,
    status: ParticipationStatus | None = None,
    cursor: str | None = None,
    limit: Limit = 20,
) -> ParticipationPage:
    stmt = (
        select(Participation)
        .where(Participation.user_id == user.id)
        .options(selectinload(Participation.challenge))
    )
    if status:
        stmt = stmt.where(Participation.status == status)
    participations, next_cursor = page(
        db, stmt, Participation.joined_at, Participation.id, cursor, limit
    )
    challenges = summaries(db, [p.challenge for p in participations])
    return ParticipationPage(
        items=[
            ParticipationWithChallenge(**participation_out(p).model_dump(), challenge=challenge)
            for p, challenge in zip(participations, challenges, strict=True)
        ],
        next_cursor=next_cursor,
    )
