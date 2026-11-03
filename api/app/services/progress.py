"""XP, levels and streaks: what a user earns for completing tasks and challenges."""

from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session

from app.enums import ParticipationStatus, ProofStatus
from app.models import ChallengeTask, Participation, Proof, User
from app.schemas.gamification import Rewards
from app.services import achievements

# XP per task. Challenge XP is always derived from difficulty, never chosen by the creator.
TASK_XP = {1: 10, 2: 15, 3: 25, 4: 35, 5: 50}

# Level n needs LEVEL_STEP * n * (n - 1) total XP: 0, 100, 300, 600, 1000, ...
LEVEL_STEP = 50


def task_xp(difficulty: int) -> int:
    return TASK_XP[difficulty]


def completion_xp(difficulty: int, duration_days: int) -> int:
    """Bonus for finishing every task: half the tasks' XP, and at least one task's worth."""
    per_task = task_xp(difficulty)
    return max(per_task, per_task * duration_days // 2)


def xp_for_level(level: int) -> int:
    """Total XP needed to reach `level`."""
    return LEVEL_STEP * level * (level - 1)


def level_for_xp(xp: int) -> int:
    level = 1
    while xp_for_level(level + 1) <= xp:
        level += 1
    return level


def local_date(user: User, at: datetime) -> date:
    return at.astimezone(ZoneInfo(user.timezone)).date()


def record_activity(user: User, at: datetime) -> None:
    """Extend the user's streak for an approved proof at `at`, once per local day."""
    today = local_date(user, at)
    if user.last_active_on == today:
        return
    if user.last_active_on == today - timedelta(days=1):
        user.current_streak += 1
    else:
        user.current_streak = 1
    user.longest_streak = max(user.longest_streak, user.current_streak)
    user.last_active_on = today


def current_streak(user: User, now: datetime) -> int:
    """The streak as shown to users: it lapses after a whole local day without progress.

    The stored `current_streak` only changes when a proof is approved, so read it through this.
    """
    if user.last_active_on is None:
        return 0
    if user.last_active_on < local_date(user, now) - timedelta(days=1):
        return 0
    return user.current_streak


def completed_today(user: User, participation: Participation, now: datetime) -> bool:
    """Whether this participation already moved forward today. Each task takes its own day."""
    last = participation.last_progress_at
    return last is not None and local_date(user, last) == local_date(user, now)


def approve_proof(
    db: Session,
    user: User,
    participation: Participation,
    task: ChallengeTask,
    proof: Proof,
    now: datetime,
) -> Rewards:
    """Approve `proof` and award its task: XP, the completion bonus, level, streak, achievements.

    The caller holds a lock on the user's row, so progress updates never interleave.
    """
    challenge = participation.challenge
    xp = task.xp
    participation.completed_tasks += 1
    participation.last_progress_at = now
    finished = participation.completed_tasks >= challenge.duration_days
    if finished:
        xp += challenge.completion_xp
        participation.status = ParticipationStatus.COMPLETED
        participation.ended_at = now
    participation.xp_earned += xp

    proof.status = ProofStatus.APPROVED
    proof.xp_awarded = xp

    level_before = user.level
    user.xp += xp
    user.level = level_for_xp(user.xp)
    record_activity(user, now)
    db.flush()

    return Rewards(
        xp_awarded=xp,
        total_xp=user.xp,
        level=user.level,
        leveled_up=user.level > level_before,
        current_streak=user.current_streak,
        challenge_completed=finished,
        new_achievements=achievements.unlock_new(db, user, now),
    )
