"""Streak Rescue: when the app opens, the coach looks for a challenge that is going wrong today
and offers one fix as a card on Home. The user accepts it or dismisses it.

The situations come from rules over the user's data (below). Gemini then picks the fix: it can
look up details with read-only tools and ends by calling `propose`. Nothing changes until the
user accepts. Without AI, or when the model fails or proposes something invalid, a rule picks
the fix instead, the same way the challenge generator falls back to templates.

Guardrails: one intervention per user per local day (a unique key), at most MAX_STEPS model
calls, and every proposal is checked against the situations found here.
"""

import json
import logging
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any
from uuid import UUID
from zoneinfo import ZoneInfo

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.coach.tools import DIFFICULTY_LABELS, proof_info
from app.config import get_settings
from app.enums import InterventionKind, InterventionStatus, ParticipationStatus, ProofStatus
from app.models import (
    ChallengeTask,
    CoachIntervention,
    Participation,
    Proof,
    TaskSwap,
    User,
)
from app.routers import challenges as challenges_api
from app.schemas.challenges import JoinRequest
from app.services import difficulty as adaptive
from app.services import events, progress, recommender, vertex
from app.services.challenges import friend_ids

log = logging.getLogger(__name__)

Kind = InterventionKind

# Model calls per intervention: up to three lookups, then the proposal.
MAX_STEPS = 4
# From this local hour, a task not done today counts as at risk.
EVENING_HOUR = 17
REJECTED_WITHIN = timedelta(days=2)
ENDED_WITHIN = timedelta(days=3)
# Which situation the rules handle first when the model doesn't choose.
PRIORITY = [Kind.PROOF_RETAKE, Kind.TASK_SWAP, Kind.NEXT_CHALLENGE, Kind.BUDDY]

ACCEPT_LABELS = {
    Kind.TASK_SWAP: "Use the lighter version",
    Kind.PROOF_RETAKE: "Retake the photo",
    Kind.BUDDY: "Open the challenge",
    Kind.NEXT_CHALLENGE: "Join it",
}


@dataclass
class Situation:
    kind: InterventionKind
    participation: Participation | None = None
    task: ChallengeTask | None = None
    facts: dict[str, Any] = field(default_factory=dict)

    def describe(self) -> dict[str, Any]:
        participation_id = str(self.participation.id) if self.participation else None
        return {"kind": self.kind.value, "participation_id": participation_id, **self.facts}


@dataclass
class Proposal:
    situation: Situation
    message: str
    challenge_id: UUID | None
    action: dict[str, Any] = field(default_factory=dict)


# --- Finding situations -----------------------------------------------------------------------


def _next_task(db: Session, participation: Participation) -> ChallengeTask | None:
    return db.scalar(
        select(ChallengeTask).where(
            ChallengeTask.challenge_id == participation.challenge_id,
            ChallengeTask.day_number == participation.completed_tasks + 1,
        )
    )


def _latest_proof(db: Session, participation: Participation, task: ChallengeTask) -> Proof | None:
    return db.scalar(
        select(Proof)
        .where(Proof.participation_id == participation.id, Proof.task_id == task.id)
        .order_by(Proof.submitted_at.desc())
        .limit(1)
    )


def _friends_in(db: Session, user: User, participation: Participation):
    return db.execute(
        select(User, Participation)
        .join(Participation, Participation.user_id == User.id)
        .where(
            Participation.challenge_id == participation.challenge_id,
            Participation.status == ParticipationStatus.ACTIVE,
            User.id.in_(friend_ids(user.id)),
        )
        .limit(5)
    ).all()


def find_situations(db: Session, user: User, now: datetime) -> list[Situation]:
    """What is going wrong today, if anything. No situations means no intervention."""
    local_now = now.astimezone(ZoneInfo(user.timezone))
    evening = local_now.hour >= EVENING_HOUR
    active = db.scalars(
        select(Participation)
        .where(Participation.user_id == user.id, Participation.status == ParticipationStatus.ACTIVE)
        .order_by(Participation.joined_at.desc())
        .limit(10)
    ).all()

    found: list[Situation] = []
    for participation in active:
        if progress.completed_today(user, participation, now):
            continue
        task = _next_task(db, participation)
        if task is None:
            continue
        last = participation.last_progress_at or participation.joined_at
        idle_days = (local_now.date() - progress.local_date(user, last)).days
        facts = {
            "challenge": participation.challenge.title,
            "difficulty": DIFFICULTY_LABELS[participation.challenge.difficulty],
            "day": task.day_number,
            "of_days": participation.challenge.duration_days,
            "days_since_progress": idle_days,
        }
        proof = _latest_proof(db, participation, task)
        if (
            proof
            and proof.status is ProofStatus.REJECTED
            and proof.submitted_at > now - REJECTED_WITHIN
        ):
            found.append(Situation(Kind.PROOF_RETAKE, participation, task, facts))
        # Missed yesterday, or it's evening and today isn't done.
        if not (evening or idle_days >= 2):
            continue
        if not any(swap.task_id == task.id for swap in participation.swaps):
            found.append(Situation(Kind.TASK_SWAP, participation, task, facts))
        friends = _friends_in(db, user, participation)
        if friends:
            names = [friend.display_name for friend, _ in friends]
            found.append(Situation(Kind.BUDDY, participation, task, {**facts, "friends": names}))

    if not active:
        ended = db.scalar(
            select(Participation)
            .where(
                Participation.user_id == user.id,
                Participation.status != ParticipationStatus.ACTIVE,
                Participation.ended_at > now - ENDED_WITHIN,
            )
            .order_by(Participation.ended_at.desc())
            .limit(1)
        )
        if ended:
            found.append(
                Situation(
                    Kind.NEXT_CHALLENGE,
                    facts={"last_challenge": ended.challenge.title, "it_was": ended.status.value},
                )
            )
    return found


# --- The agent --------------------------------------------------------------------------------

SYSTEM = """\
You are the streak rescue coach in VYRO, a habit app where people do one task a day in a \
challenge and prove it with a photo. The app found the situations below for {name} today. Pick \
the ONE intervention most likely to get them to act today, then call propose.

The kinds:
- task_swap: a lighter version of today's task that still counts, for half the XP. Read the \
task with get_task first. Keep the same activity at roughly half the effort, provable with one \
photo. Good when they're behind and the task is big.
- proof_retake: today's photo was rejected. Read why with explain_rejection and give one \
concrete tip for a photo that will pass.
- buddy: a friend is in the same challenge. Use find_buddies and suggest checking in with them \
by name.
- next_challenge: nothing is active. Call recommend_next and propose one of its challenges. If \
they keep failing, prefer an easier one and say so kindly.

Rules:
- Only propose a kind listed in the situations, with that situation's participation_id.
- message: one or two short sentences to the user, warm and specific, no guilt, no emoji. Name \
the challenge. Under 300 characters, in English.
- Make at most three lookups, then propose.

Their local time is {now}."""

_PARTICIPATION_ID = {"type": "string", "description": "From the situations"}


def _object(properties: dict[str, Any], required: list[str] | None = None) -> dict[str, Any]:
    return {
        "type": "object",
        "properties": properties,
        "required": required or [],
        "additionalProperties": False,
    }


DECLARATIONS = [
    {
        "name": "get_task",
        "description": "Today's task in a challenge: title, instructions, what the photo shows.",
        "parametersJsonSchema": _object(
            {"participation_id": _PARTICIPATION_ID}, ["participation_id"]
        ),
    },
    {
        "name": "explain_rejection",
        "description": "Why today's photo was rejected: the verifier's reason and the task.",
        "parametersJsonSchema": _object(
            {"participation_id": _PARTICIPATION_ID}, ["participation_id"]
        ),
    },
    {
        "name": "find_buddies",
        "description": "Friends in the same challenge and how far they are.",
        "parametersJsonSchema": _object(
            {"participation_id": _PARTICIPATION_ID}, ["participation_id"]
        ),
    },
    {
        "name": "recommend_next",
        "description": "Up to three challenges to join next, with the difficulty that suits the "
        "user now and their recent results.",
        "parametersJsonSchema": _object({}),
    },
    {
        "name": "propose",
        "description": "Show the intervention to the user. Call this exactly once, last.",
        "parametersJsonSchema": _object(
            {
                "kind": {"type": "string", "enum": [k.value for k in Kind]},
                "participation_id": {
                    "type": "string",
                    "description": "Required except for next_challenge",
                },
                "message": {"type": "string", "maxLength": 300},
                "lighter_task": _object(
                    {
                        "title": {"type": "string", "maxLength": 120},
                        "instructions": {"type": "string", "maxLength": 600},
                        "proof_hint": {
                            "type": "string",
                            "maxLength": 280,
                            "description": "What the photo should show",
                        },
                    },
                    ["title", "instructions", "proof_hint"],
                ),
                "challenge_id": {
                    "type": "string",
                    "description": "For next_challenge: one from recommend_next",
                },
            },
            ["kind", "message"],
        ),
    },
]


class _Run:
    """One agent run: the tools, limited to the situations found for this user."""

    def __init__(self, db: Session, user: User, situations: list[Situation], now: datetime) -> None:
        self.db = db
        self.user = user
        self.situations = situations
        self.now = now
        # challenge id -> recommendation id, from recommend_next.
        self.recommended: dict[str, UUID] = {}

    def _situation(self, args: dict[str, Any], kind: Kind | None = None) -> Situation:
        participation_id = str(args.get("participation_id") or "")
        for situation in self.situations:
            if (
                situation.participation
                and str(situation.participation.id) == participation_id
                and kind in (None, situation.kind)
            ):
                return situation
        raise ValueError(f"No {kind.value if kind else ''} situation for that participation_id")

    def get_task(self, args: dict[str, Any]) -> dict[str, Any]:
        task = self._situation(args).task
        assert task is not None
        return {
            "day": task.day_number,
            "title": task.title,
            "instructions": task.instructions,
            "photo_should_show": task.proof_hint,
            "xp": task.xp,
        }

    def explain_rejection(self, args: dict[str, Any]) -> dict[str, Any]:
        situation = self._situation(args, Kind.PROOF_RETAKE)
        assert situation.participation and situation.task
        proof = _latest_proof(self.db, situation.participation, situation.task)
        assert proof is not None
        return proof_info(self.db, proof)

    def find_buddies(self, args: dict[str, Any]) -> dict[str, Any]:
        situation = self._situation(args, Kind.BUDDY)
        assert situation.participation
        return {
            "friends": [
                {
                    "name": friend.display_name,
                    "completed_days": theirs.completed_tasks,
                    "did_today": progress.completed_today(self.user, theirs, self.now),
                }
                for friend, theirs in _friends_in(self.db, self.user, situation.participation)
            ]
        }

    def recommend_next(self, args: dict[str, Any]) -> dict[str, Any]:
        results = adaptive.recent_results(self.db, self.user, self.now)
        picks = recommender.recommend(self.db, self.user, 3, self.now)
        for item in picks.items:
            self.recommended[str(item.challenge.id)] = picks.recommendation_id
        return {
            "suggested_difficulty": DIFFICULTY_LABELS[
                adaptive.target(self.db, self.user, self.now)
            ],
            "recent_results": ["finished" if r.succeeded else "didn't finish" for r in results],
            "challenges": [
                {
                    "challenge_id": str(item.challenge.id),
                    "title": item.challenge.title,
                    "difficulty": DIFFICULTY_LABELS[item.challenge.difficulty],
                    "duration_days": item.challenge.duration_days,
                    "why": item.reason,
                }
                for item in picks.items
            ],
        }

    def propose(self, args: dict[str, Any]) -> Proposal:
        kind = Kind(args.get("kind"))
        message = str(args.get("message") or "").strip()
        if not 1 <= len(message) <= 300:
            raise ValueError("message must be 1 to 300 characters")
        if kind is Kind.NEXT_CHALLENGE:
            situation = next((s for s in self.situations if s.kind is kind), None)
            challenge_id = str(args.get("challenge_id") or "")
            if situation is None:
                raise ValueError("next_challenge isn't one of the situations")
            if challenge_id not in self.recommended:
                raise ValueError("challenge_id must come from recommend_next")
            action = {
                "challenge_id": challenge_id,
                "recommendation_id": str(self.recommended[challenge_id]),
            }
            return Proposal(situation, message, UUID(challenge_id), action)

        situation = self._situation(args, kind)
        assert situation.participation and situation.task
        action: dict[str, Any] = {}
        if kind is Kind.TASK_SWAP:
            lighter = args.get("lighter_task") or {}
            title = str(lighter.get("title") or "").strip()
            instructions = str(lighter.get("instructions") or "").strip()
            proof_hint = str(lighter.get("proof_hint") or "").strip()
            if not (3 <= len(title) <= 120 and 1 <= len(instructions) <= 600):
                raise ValueError("lighter_task needs a title and instructions")
            if not 1 <= len(proof_hint) <= 280:
                raise ValueError("lighter_task needs a proof_hint")
            action = _swap_action(situation.task, title, instructions, proof_hint)
        return Proposal(situation, message, situation.participation.challenge_id, action)

    def call(self, name: str, args: dict[str, Any]) -> dict[str, Any]:
        lookups = {
            "get_task": self.get_task,
            "explain_rejection": self.explain_rejection,
            "find_buddies": self.find_buddies,
            "recommend_next": self.recommend_next,
        }
        if name not in lookups:
            return {"error": f"There is no tool called {name}"}
        try:
            return {"result": lookups[name](args)}
        except (ValueError, KeyError, TypeError) as error:
            return {"error": str(error)[:300]}


def _swap_action(task: ChallengeTask, title: str, instructions: str, proof_hint: str):
    return {
        "task_id": str(task.id),
        "day_number": task.day_number,
        "title": title,
        "instructions": instructions,
        "proof_hint": proof_hint,
    }


def _response(call: dict[str, Any], response: dict[str, Any]) -> dict[str, Any]:
    part: dict[str, Any] = {"name": call["name"], "response": response}
    if "id" in call:
        part["id"] = call["id"]
    return {"functionResponse": part}


def _agent(
    db: Session, user: User, situations: list[Situation], now: datetime
) -> tuple[Proposal | None, str | None]:
    """Let Gemini pick the intervention. Returns (None, model) if it didn't manage to."""
    run = _Run(db, user, situations, now)
    local = now.astimezone(ZoneInfo(user.timezone))
    system = SYSTEM.format(name=user.display_name, now=local.strftime("%A %H:%M"))
    brief = {"situations": [s.describe() for s in situations]}
    contents: list[dict[str, Any]] = [{"role": "user", "parts": [{"text": json.dumps(brief)}]}]
    model = get_settings().ai_coach_model
    used_model: str | None = None
    for step in range(MAX_STEPS):
        last = step == MAX_STEPS - 1
        turn = vertex.chat(
            model, system, contents, DECLARATIONS, must_call=["propose"] if last else []
        )
        used_model = turn.model
        # New lists, not appends: the history sent with each call stays as it was sent.
        contents = [*contents, turn.content]
        answers = []
        for call in turn.function_calls:
            args = call.get("args") or {}
            if call["name"] == "propose":
                try:
                    return run.propose(args), used_model
                except (ValueError, KeyError, TypeError) as error:
                    answers.append(_response(call, {"error": str(error)[:300]}))
                    continue
            answers.append(_response(call, run.call(call["name"], args)))
        if not answers:
            break
        contents = [*contents, {"role": "user", "parts": answers}]
    return None, used_model


# --- The fallback rules -----------------------------------------------------------------------


def _rules(db: Session, user: User, situations: list[Situation], now: datetime):
    situation = min(situations, key=lambda s: PRIORITY.index(s.kind))
    p, task = situation.participation, situation.task
    match situation.kind:
        case Kind.PROOF_RETAKE:
            assert p and task
            proof = _latest_proof(db, p, task)
            reason = f" {proof.ai_reason.rstrip('.')}." if proof and proof.ai_reason else ""
            message = (
                f"Your day {task.day_number} photo for “{p.challenge.title}” didn't pass.{reason} "
                f"Try again with a photo that shows: {task.proof_hint}"
            )
            return Proposal(situation, message[:600], p.challenge_id)
        case Kind.TASK_SWAP:
            assert p and task
            action = _swap_action(
                task,
                f"Short version: {task.title}"[:120],
                f"Do about half of today's task. The full task was: {task.instructions}"[:600],
                task.proof_hint,
            )
            message = (
                f"Day {task.day_number} of “{p.challenge.title}” isn't done yet. Do a shorter "
                "version today and keep your streak, for half the XP."
            )
            return Proposal(situation, message, p.challenge_id, action)
        case Kind.BUDDY:
            assert p
            names = situation.facts["friends"]
            who = names[0] if len(names) == 1 else f"{', '.join(names[:-1])} and {names[-1]}"
            verb = "is" if len(names) == 1 else "are"
            message = (
                f"{who} {verb} also doing “{p.challenge.title}”. "
                "Check in with them in the challenge chat."
            )
            return Proposal(situation, message, p.challenge_id)
        case Kind.NEXT_CHALLENGE:
            picks = recommender.recommend(db, user, 1, now)
            if not picks.items:
                return None
            pick = picks.items[0]
            why = f" {pick.reason}" if pick.reason else ""
            message = f"Ready for the next one? Try “{pick.challenge.title}”.{why}"
            action = {
                "challenge_id": str(pick.challenge.id),
                "recommendation_id": str(picks.recommendation_id),
            }
            return Proposal(situation, message, pick.challenge.id, action)


# --- Entry points -----------------------------------------------------------------------------


def _todays(db: Session, user: User, now: datetime) -> CoachIntervention | None:
    return db.scalar(
        select(CoachIntervention).where(
            CoachIntervention.user_id == user.id,
            CoachIntervention.local_date == progress.local_date(user, now),
        )
    )


def todays_intervention(db: Session, user: User, now: datetime) -> CoachIntervention | None:
    """Today's intervention, choosing one first if something is going wrong and there's none
    yet. Call when the app opens."""
    existing = _todays(db, user, now)
    if existing:
        return existing
    situations = find_situations(db, user, now)
    if not situations:
        return None

    proposal, model, source = None, None, "rules"
    if vertex.enabled():
        try:
            proposal, model = _agent(db, user, situations, now)
        except vertex.AiError as error:
            log.warning("Streak rescue agent failed, using the rules: %s", error)
        if proposal:
            source = "agent"
    if proposal is None:
        proposal = _rules(db, user, situations, now)
    if proposal is None:
        return None

    situation = proposal.situation
    intervention = CoachIntervention(
        user_id=user.id,
        local_date=progress.local_date(user, now),
        kind=situation.kind,
        participation_id=situation.participation.id if situation.participation else None,
        challenge_id=proposal.challenge_id,
        message=proposal.message,
        action=proposal.action,
        source=source,
        model=model if source == "agent" else None,
    )
    db.add(intervention)
    try:
        db.flush()
    except IntegrityError:
        # Another request (the app opened twice) chose one first.
        db.rollback()
        return _todays(db, user, now)
    events.log(
        db,
        user,
        "agent_intervention_shown",
        intervention_id=intervention.id,
        kind=intervention.kind,
        source=source,
        participation_id=intervention.participation_id,
        challenge_id=intervention.challenge_id,
    )
    db.commit()
    return intervention


def _answerable(user: User, intervention: CoachIntervention, now: datetime) -> None:
    if intervention.status is not InterventionStatus.OPEN:
        raise HTTPException(status.HTTP_409_CONFLICT, "You already answered this")
    if intervention.local_date != progress.local_date(user, now):
        raise HTTPException(status.HTTP_409_CONFLICT, "This suggestion has expired")


def accept(db: Session, user: User, intervention: CoachIntervention, now: datetime) -> None:
    """Do what the intervention offered. This is the only place it changes anything."""
    _answerable(user, intervention, now)
    action = intervention.action
    if intervention.kind is Kind.TASK_SWAP:
        progress.lock(db, user)
        participation = (
            db.get(Participation, intervention.participation_id)
            if intervention.participation_id
            else None
        )
        if (
            participation is None
            or participation.status is not ParticipationStatus.ACTIVE
            or participation.completed_tasks + 1 != action["day_number"]
            or progress.completed_today(user, participation, now)
        ):
            raise HTTPException(status.HTTP_409_CONFLICT, "That task has moved on")
        task = db.get(ChallengeTask, UUID(action["task_id"]))
        if task is None or db.get(TaskSwap, (participation.id, task.id)):
            raise HTTPException(status.HTTP_409_CONFLICT, "That task has moved on")
        db.add(
            TaskSwap(
                participation_id=participation.id,
                task_id=task.id,
                day_number=task.day_number,
                title=action["title"],
                instructions=action["instructions"],
                proof_hint=action["proof_hint"],
                xp=progress.swap_xp(task.xp),
                intervention_id=intervention.id,
            )
        )
        db.flush()
        db.expire(participation, ["swaps"])

    intervention.status = InterventionStatus.ACCEPTED
    intervention.resolved_at = now
    events.log(
        db, user, "agent_action_accepted", intervention_id=intervention.id, kind=intervention.kind
    )
    if intervention.kind is Kind.NEXT_CHALLENGE:
        # Commits the acceptance together with the join.
        challenges_api.join_challenge(
            UUID(action["challenge_id"]),
            user,
            db,
            JoinRequest(recommendation_id=UUID(action["recommendation_id"])),
        )
        return
    db.commit()


def dismiss(db: Session, user: User, intervention: CoachIntervention, now: datetime) -> None:
    _answerable(user, intervention, now)
    intervention.status = InterventionStatus.DISMISSED
    intervention.resolved_at = now
    events.log(
        db,
        user,
        "agent_intervention_dismissed",
        intervention_id=intervention.id,
        kind=intervention.kind,
    )
    db.commit()
