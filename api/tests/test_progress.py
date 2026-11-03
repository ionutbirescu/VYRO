from datetime import UTC, date, datetime, timedelta

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.enums import Category, ParticipationStatus, ProofStatus
from app.models import Participation, Proof, User, UserAchievement
from app.services import achievements, progress
from tests.conftest import make_challenge

NOW = datetime(2026, 11, 3, 12, 0, tzinfo=UTC)


def test_xp_comes_from_difficulty_and_duration() -> None:
    assert progress.task_xp(1) == 10
    assert progress.task_xp(5) == 50
    assert progress.completion_xp(2, 1) == 15
    assert progress.completion_xp(2, 7) == 52
    assert progress.completion_xp(5, 30) == 750


@pytest.mark.parametrize(
    ("xp", "level"), [(0, 1), (99, 1), (100, 2), (299, 2), (300, 3), (600, 4), (4500, 10)]
)
def test_level_for_xp(xp: int, level: int) -> None:
    assert progress.level_for_xp(xp) == level


def test_each_level_starts_at_its_threshold() -> None:
    for level in range(1, 30):
        assert progress.level_for_xp(progress.xp_for_level(level)) == level


def _user(**fields: object) -> User:
    return User(**{"current_streak": 0, "longest_streak": 0, "timezone": "UTC", **fields})


def test_streak_counts_consecutive_local_days() -> None:
    user = _user()
    progress.record_activity(user, NOW)
    progress.record_activity(user, NOW + timedelta(hours=2))
    assert user.current_streak == 1

    progress.record_activity(user, NOW + timedelta(days=1))
    assert user.current_streak == 2

    progress.record_activity(user, NOW + timedelta(days=3))
    assert (user.current_streak, user.longest_streak) == (1, 2)


def test_streak_days_follow_the_users_time_zone() -> None:
    user = _user(timezone="Europe/Bucharest", last_active_on=date(2026, 11, 3))
    user.current_streak = user.longest_streak = 4
    # 23:30 UTC is already the next day in Bucharest.
    progress.record_activity(user, datetime(2026, 11, 3, 23, 30, tzinfo=UTC))
    assert user.last_active_on == date(2026, 11, 4)
    assert user.current_streak == 5


def test_streak_lapses_after_a_missed_day() -> None:
    user = _user(last_active_on=date(2026, 11, 2), current_streak=3)
    assert progress.current_streak(user, NOW) == 3
    assert progress.current_streak(user, NOW + timedelta(days=1)) == 0
    assert progress.current_streak(_user(), NOW) == 0


def _approve_next(db: Session, user: User, participation: Participation, at: datetime):
    task = participation.challenge.tasks[participation.completed_tasks]
    proof = Proof(
        participation_id=participation.id,
        task_id=task.id,
        user_id=user.id,
        image_path="proofs/test.jpg",
    )
    db.add(proof)
    db.flush()
    return proof, progress.approve_proof(db, user, participation, task, proof, at)


def _join(db: Session, user: User, **challenge_fields: object) -> Participation:
    challenge = make_challenge(db, **challenge_fields)
    participation = Participation(user_id=user.id, challenge_id=challenge.id, challenge=challenge)
    db.add(participation)
    db.flush()
    return participation


def test_approving_a_task_awards_xp_and_progress(db: Session, user: User) -> None:
    participation = _join(db, user, difficulty=2, duration_days=7)
    proof, rewards = _approve_next(db, user, participation, NOW)

    assert proof.status is ProofStatus.APPROVED
    assert proof.xp_awarded == rewards.xp_awarded == 15
    assert (participation.completed_tasks, participation.xp_earned) == (1, 15)
    assert participation.status is ParticipationStatus.ACTIVE
    assert participation.last_progress_at == NOW
    assert (user.xp, user.current_streak, user.last_active_on) == (15, 1, NOW.date())
    assert not rewards.challenge_completed
    assert [a.code for a in rewards.new_achievements] == ["first_task"]


def test_finishing_a_challenge_adds_the_bonus(db: Session, user: User) -> None:
    participation = _join(db, user, difficulty=2, duration_days=1)
    _, rewards = _approve_next(db, user, participation, NOW)

    assert rewards.challenge_completed
    assert rewards.xp_awarded == 15 + 15
    assert participation.status is ParticipationStatus.COMPLETED
    assert participation.ended_at == NOW
    assert {a.code for a in rewards.new_achievements} == {"first_task", "first_challenge"}


def test_level_up_is_reported(db: Session, user: User) -> None:
    user.xp = 95
    participation = _join(db, user, difficulty=1, duration_days=7)
    _, rewards = _approve_next(db, user, participation, NOW)
    assert (rewards.total_xp, rewards.level, rewards.leveled_up) == (105, 2, True)


def test_achievements_unlock_once(db: Session, user: User) -> None:
    participation = _join(db, user)
    _approve_next(db, user, participation, NOW)
    _, rewards = _approve_next(db, user, participation, NOW + timedelta(days=1))

    assert rewards.new_achievements == []
    codes = db.scalars(select(UserAchievement.code).where(UserAchievement.user_id == user.id))
    assert list(codes) == ["first_task"]


def test_explorer_needs_five_categories(db: Session, user: User) -> None:
    categories = [Category.FITNESS, Category.SLEEP, Category.READING, Category.SOCIAL]
    for category in categories:
        _approve_next(db, user, _join(db, user, category=category, duration_days=1), NOW)
    assert "explorer" not in {a.code for a in achievements.list_for(db, user.id) if a.unlocked_at}

    last = _join(db, user, category=Category.FINANCE, duration_days=1)
    _, rewards = _approve_next(db, user, last, NOW)
    assert "explorer" in {a.code for a in rewards.new_achievements}


def test_achievement_list_marks_unlocked_ones(db: Session, user: User) -> None:
    _approve_next(db, user, _join(db, user), NOW)
    listed = achievements.list_for(db, user.id)

    assert [a.code for a in listed] == [d.code for d in achievements.DEFINITIONS]
    unlocked = {a.code: a.unlocked_at for a in listed if a.unlocked_at}
    assert unlocked == {"first_task": NOW}


def test_completed_today_uses_local_days(user: User) -> None:
    participation = Participation(last_progress_at=NOW)
    assert progress.completed_today(user, participation, NOW + timedelta(hours=11))
    assert not progress.completed_today(user, participation, NOW + timedelta(hours=12))
    assert not progress.completed_today(user, Participation(), NOW)
