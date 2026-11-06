"""Adaptive difficulty (RQ2): the difficulty to offer each user next.

Treatment users get a rule-based controller over their last five results. Control users stay
at a fixed difficulty, so the two groups can be compared on completion and retention.

A result is a challenge the user finished (success), left or failed (failure), or stopped
making progress in for STALL_DAYS (failure: tasks have no deadline, so a stalled challenge
would otherwise never count).
"""

from dataclasses import dataclass
from datetime import datetime, timedelta
from statistics import median_low

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.enums import ParticipationStatus, StudyGroup
from app.models import Challenge, Participation, User

DEFAULT = 2
WINDOW = 5
# Fewer results than this is too little to adapt on.
MIN_RESULTS = 3
STALL_DAYS = 3
# Success rates at or beyond these move the target one step.
STEP_UP = 0.8
STEP_DOWN = 0.4


@dataclass(frozen=True)
class Result:
    difficulty: int
    succeeded: bool
    at: datetime


def _result(participation: Participation, difficulty: int, now: datetime) -> Result | None:
    match participation.status:
        case ParticipationStatus.COMPLETED:
            return Result(difficulty, True, participation.ended_at or now)
        case ParticipationStatus.ABANDONED | ParticipationStatus.FAILED:
            return Result(difficulty, False, participation.ended_at or now)
        case ParticipationStatus.ACTIVE:
            last_activity = participation.last_progress_at or participation.joined_at
            if last_activity <= now - timedelta(days=STALL_DAYS):
                return Result(difficulty, False, last_activity)
    return None


def recent_results(db: Session, user: User, now: datetime) -> list[Result]:
    """The user's last WINDOW results, newest first."""
    rows = db.execute(
        select(Participation, Challenge.difficulty)
        .join(Challenge, Challenge.id == Participation.challenge_id)
        .where(Participation.user_id == user.id)
        .order_by(Participation.joined_at.desc())
        .limit(50)
    ).all()
    results = [r for p, difficulty in rows if (r := _result(p, difficulty, now))]
    return sorted(results, key=lambda r: r.at, reverse=True)[:WINDOW]


def controller(results: list[Result]) -> int:
    """Around the typical difficulty of recent results, a step up after mostly successes and a
    step down after mostly failures."""
    if len(results) < MIN_RESULTS:
        return DEFAULT
    target = median_low(r.difficulty for r in results)
    success_rate = sum(r.succeeded for r in results) / len(results)
    if success_rate >= STEP_UP:
        target += 1
    elif success_rate <= STEP_DOWN:
        target -= 1
    return min(5, max(1, target))


def target(db: Session, user: User, now: datetime) -> int:
    if user.study_group is StudyGroup.CONTROL:
        return DEFAULT
    return controller(recent_results(db, user, now))
