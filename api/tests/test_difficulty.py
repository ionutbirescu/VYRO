from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.enums import ParticipationStatus, StudyGroup
from app.models import Participation, User
from app.services import difficulty
from app.services.difficulty import Result
from tests.conftest import auth, make_challenge, make_user

NOW = datetime(2026, 11, 6, 12, tzinfo=UTC)


def _results(*outcomes: tuple[int, bool]) -> list[Result]:
    return [
        Result(level, succeeded, NOW - timedelta(days=day))
        for day, (level, succeeded) in enumerate(outcomes)
    ]


@pytest.mark.parametrize(
    ("outcomes", "expected"),
    [
        # Too few results to adapt on.
        ([], difficulty.DEFAULT),
        ([(4, True), (4, True)], difficulty.DEFAULT),
        # Mostly successes: one step above the typical difficulty.
        ([(3, True), (3, True), (3, True), (3, True), (3, False)], 4),
        # Mixed: stay at the typical difficulty.
        ([(3, True), (3, False), (3, True), (3, False), (3, True)], 3),
        # Mostly failures: one step down.
        ([(3, False), (3, False), (3, True), (3, False), (3, False)], 2),
        # Never leaves 1-5.
        ([(5, True), (5, True), (5, True)], 5),
        ([(1, False), (1, False), (1, False)], 1),
        # The typical difficulty is the (lower) median, so one outlier doesn't drag it.
        ([(2, True), (2, False), (5, True), (2, False), (2, True)], 2),
    ],
)
def test_controller(outcomes: list[tuple[int, bool]], expected: int) -> None:
    assert difficulty.controller(_results(*outcomes)) == expected


def _participation(
    db: Session,
    user: User,
    level: int,
    status: ParticipationStatus,
    *,
    days_ago: int,
    last_progress_days_ago: int | None = None,
) -> None:
    at = NOW - timedelta(days=days_ago)
    db.add(
        Participation(
            user_id=user.id,
            challenge_id=make_challenge(db, difficulty=level).id,
            status=status,
            joined_at=at - timedelta(days=1),
            ended_at=None if status is ParticipationStatus.ACTIVE else at,
            last_progress_at=(
                NOW - timedelta(days=last_progress_days_ago)
                if last_progress_days_ago is not None
                else None
            ),
        )
    )
    db.flush()


def test_recent_results_use_the_last_five_and_count_stalls_as_failures(
    db: Session, user: User
) -> None:
    for days_ago in (20, 19, 18):
        # Older than the window: ignored.
        _participation(db, user, 5, ParticipationStatus.COMPLETED, days_ago=days_ago)
    for days_ago in (7, 6, 5):
        _participation(db, user, 3, ParticipationStatus.COMPLETED, days_ago=days_ago)
    _participation(db, user, 3, ParticipationStatus.ABANDONED, days_ago=3)
    # No progress for 4 days: a stalled challenge counts as a failure.
    _participation(db, user, 3, ParticipationStatus.ACTIVE, days_ago=10, last_progress_days_ago=4)
    # Progress yesterday: still in play, not a result yet.
    _participation(db, user, 1, ParticipationStatus.ACTIVE, days_ago=2, last_progress_days_ago=1)

    results = difficulty.recent_results(db, user, NOW)

    assert [(r.difficulty, r.succeeded) for r in results] == [
        (3, False),
        (3, False),
        (3, True),
        (3, True),
        (3, True),
    ]
    # 3 of 5 succeeded: stay at 3.
    assert difficulty.target(db, user, NOW) == 3


def test_control_group_stays_at_the_default(db: Session) -> None:
    control = make_user(db, "control-user", study_group=StudyGroup.CONTROL)
    for days_ago in range(1, 6):
        _participation(db, control, 4, ParticipationStatus.COMPLETED, days_ago=days_ago)

    assert difficulty.target(db, control, NOW) == difficulty.DEFAULT


def test_join_records_the_target_difficulty(db_client: TestClient, db: Session, user: User) -> None:
    for days_ago in range(1, 6):
        _participation(db, user, 2, ParticipationStatus.COMPLETED, days_ago=days_ago)
    challenge = make_challenge(db)

    response = db_client.post(f"/v1/challenges/{challenge.id}/join", headers=auth())

    assert response.status_code == 201, response.text
    joined = db.get(Participation, response.json()["id"])
    assert joined is not None
    assert joined.target_difficulty_at_join == 3
