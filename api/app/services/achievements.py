"""Achievement definitions and unlocking. Only unlocks are stored (UserAchievement)."""

from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.enums import ChallengeSource, ParticipationStatus, ProofStatus
from app.models import Challenge, Participation, Proof, User, UserAchievement
from app.schemas.gamification import Achievement
from app.services import events


@dataclass(frozen=True)
class Stats:
    tasks_completed: int
    challenges_completed: int
    categories_completed: int
    longest_challenge_completed: int
    challenges_created: int
    longest_streak: int
    level: int


@dataclass(frozen=True)
class Definition:
    code: str
    name: str
    description: str
    icon: str
    earned: Callable[[Stats], bool]


# Order is the display order. Codes are stored, so never rename one.
DEFINITIONS = (
    Definition(
        "first_task",
        "First Step",
        "Complete your first task",
        "footprints",
        lambda s: s.tasks_completed >= 1,
    ),
    Definition(
        "first_challenge",
        "Finisher",
        "Complete your first challenge",
        "flag",
        lambda s: s.challenges_completed >= 1,
    ),
    Definition(
        "challenges_5",
        "Unstoppable",
        "Complete 5 challenges",
        "trophy",
        lambda s: s.challenges_completed >= 5,
    ),
    Definition(
        "challenges_20",
        "Legend",
        "Complete 20 challenges",
        "crown",
        lambda s: s.challenges_completed >= 20,
    ),
    Definition(
        "week_program",
        "Week Warrior",
        "Complete a challenge of 7 days or longer",
        "calendar",
        lambda s: s.longest_challenge_completed >= 7,
    ),
    Definition(
        "marathon",
        "Marathoner",
        "Complete a 30-day challenge",
        "medal",
        lambda s: s.longest_challenge_completed >= 30,
    ),
    Definition(
        "explorer",
        "Explorer",
        "Complete challenges in 5 different categories",
        "compass",
        lambda s: s.categories_completed >= 5,
    ),
    Definition(
        "streak_3",
        "Warming Up",
        "Reach a 3-day streak",
        "flame",
        lambda s: s.longest_streak >= 3,
    ),
    Definition(
        "streak_7",
        "On Fire",
        "Reach a 7-day streak",
        "fire",
        lambda s: s.longest_streak >= 7,
    ),
    Definition(
        "streak_30",
        "Unbreakable",
        "Reach a 30-day streak",
        "diamond",
        lambda s: s.longest_streak >= 30,
    ),
    Definition(
        "level_5",
        "Rising Star",
        "Reach level 5",
        "star",
        lambda s: s.level >= 5,
    ),
    Definition(
        "level_10",
        "Ascended",
        "Reach level 10",
        "rocket",
        lambda s: s.level >= 10,
    ),
    Definition(
        "creator",
        "Creator",
        "Publish your own challenge",
        "pencil",
        lambda s: s.challenges_created >= 1,
    ),
)


def _stats(db: Session, user: User) -> Stats:
    tasks_completed = db.scalar(
        select(func.count())
        .select_from(Proof)
        .where(Proof.user_id == user.id, Proof.status == ProofStatus.APPROVED)
    )
    completed = db.execute(
        select(Challenge.category, Challenge.duration_days)
        .join(Participation, Participation.challenge_id == Challenge.id)
        .where(
            Participation.user_id == user.id,
            Participation.status == ParticipationStatus.COMPLETED,
        )
    ).all()
    challenges_created = db.scalar(
        select(func.count())
        .select_from(Challenge)
        .where(Challenge.creator_id == user.id, Challenge.source != ChallengeSource.TEMPLATE)
    )
    return Stats(
        tasks_completed=tasks_completed or 0,
        challenges_completed=len(completed),
        categories_completed=len({category for category, _ in completed}),
        longest_challenge_completed=max((days for _, days in completed), default=0),
        challenges_created=challenges_created or 0,
        longest_streak=user.longest_streak,
        level=user.level,
    )


def _unlocked_at(db: Session, user_id: UUID) -> dict[str, datetime]:
    rows = db.execute(
        select(UserAchievement.code, UserAchievement.unlocked_at).where(
            UserAchievement.user_id == user_id
        )
    )
    return {code: unlocked_at for code, unlocked_at in rows}


def _to_schema(definition: Definition, unlocked_at: datetime | None) -> Achievement:
    return Achievement(
        code=definition.code,
        name=definition.name,
        description=definition.description,
        icon=definition.icon,
        unlocked_at=unlocked_at,
    )


def unlock_new(db: Session, user: User, now: datetime) -> list[Achievement]:
    """Unlock every achievement the user has now earned and return the new ones.

    Call after the user's progress is updated and flushed.
    """
    unlocked = _unlocked_at(db, user.id)
    stats = _stats(db, user)
    new = [d for d in DEFINITIONS if d.code not in unlocked and d.earned(stats)]
    db.add_all(UserAchievement(user_id=user.id, code=d.code, unlocked_at=now) for d in new)
    for definition in new:
        events.log(db, user, "achievement_unlocked", code=definition.code)
    return [_to_schema(d, now) for d in new]


def list_for(db: Session, user_id: UUID) -> list[Achievement]:
    """Every achievement, with `unlocked_at` set for the ones this user has."""
    unlocked = _unlocked_at(db, user_id)
    return [_to_schema(d, unlocked.get(d.code)) for d in DEFINITIONS]
