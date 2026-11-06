from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.enums import ParticipationStatus, Visibility
from app.models import Challenge, Participation, User
from tests.conftest import auth, make_challenge, make_user

START = datetime(2026, 11, 2, 8, tzinfo=UTC)


def _attempt(
    db: Session,
    user: User,
    challenge: Challenge,
    tasks: int,
    *,
    joined_hours: int = 0,
    progress_hours: int | None = None,
    status: ParticipationStatus = ParticipationStatus.ACTIVE,
) -> None:
    db.add(
        Participation(
            user_id=user.id,
            challenge_id=challenge.id,
            status=status,
            completed_tasks=tasks,
            xp_earned=tasks * 10,
            joined_at=START + timedelta(hours=joined_hours),
            last_progress_at=(
                START + timedelta(hours=progress_hours) if progress_hours is not None else None
            ),
        )
    )
    db.flush()


def _leaderboard(client: TestClient, challenge_id: UUID, **params: Any) -> dict[str, Any]:
    response = client.get(
        f"/v1/challenges/{challenge_id}/leaderboard", headers=auth(), params=params
    )
    assert response.status_code == 200, response.text
    return response.json()


def _ranking(board: dict[str, Any]) -> list[tuple[int, str]]:
    return [(entry["rank"], entry["user"]["username"]) for entry in board["entries"]]


def test_ranks_by_tasks_then_who_got_there_first(
    db_client: TestClient, db: Session, user: User
) -> None:
    challenge = make_challenge(db)
    slow, fast, leader, idle, late = (
        make_user(db, name) for name in ("slow", "fast", "leader", "idle", "late")
    )
    _attempt(db, slow, challenge, 2, progress_hours=30)
    _attempt(db, fast, challenge, 2, progress_hours=20)
    _attempt(db, leader, challenge, 4, progress_hours=50)
    _attempt(db, late, challenge, 0, joined_hours=5)
    _attempt(db, idle, challenge, 0, joined_hours=1)

    board = _leaderboard(db_client, challenge.id)

    assert board["challenge_id"] == str(challenge.id)
    assert _ranking(board) == [(1, "leader"), (2, "fast"), (3, "slow"), (4, "idle"), (5, "late")]
    top = board["entries"][0]
    assert top["completed_tasks"] == 4
    assert top["xp_earned"] == 40
    assert top["last_progress_at"] is not None
    assert top["user"]["display_name"] == "Leader"
    assert board["entries"][3]["last_progress_at"] is None
    # The current user hasn't joined.
    assert board["me"] is None


def test_lists_each_user_once_with_their_best_attempt(
    db_client: TestClient, db: Session, user: User
) -> None:
    challenge = make_challenge(db)
    rival = make_user(db, "rival")
    _attempt(db, user, challenge, 5, progress_hours=60, status=ParticipationStatus.ABANDONED)
    _attempt(db, user, challenge, 1, joined_hours=70, progress_hours=80)
    _attempt(db, rival, challenge, 3, progress_hours=40)

    board = _leaderboard(db_client, challenge.id)

    assert _ranking(board) == [(1, "tester"), (2, "rival")]
    assert board["entries"][0]["completed_tasks"] == 5
    assert board["me"] == board["entries"][0]


def test_me_is_returned_when_outside_the_limit(
    db_client: TestClient, db: Session, user: User
) -> None:
    challenge = make_challenge(db)
    for place, name in enumerate(("first", "second", "third"), start=1):
        _attempt(db, make_user(db, name), challenge, 7 - place, progress_hours=place)
    _attempt(db, user, challenge, 1, progress_hours=10)

    board = _leaderboard(db_client, challenge.id, limit=2)

    assert _ranking(board) == [(1, "first"), (2, "second")]
    assert board["me"]["rank"] == 4
    assert board["me"]["user"]["username"] == "tester"
    assert board["me"]["completed_tasks"] == 1


def test_only_counts_this_challenge(db_client: TestClient, db: Session, user: User) -> None:
    challenge = make_challenge(db)
    other = make_challenge(db, title="Other")
    _attempt(db, make_user(db, "elsewhere"), other, 6, progress_hours=1)

    board = _leaderboard(db_client, challenge.id)

    assert board["entries"] == []
    assert board["me"] is None


def test_hidden_or_missing_challenge_is_404(db_client: TestClient, db: Session, user: User) -> None:
    stranger = make_user(db, "stranger")
    hidden = make_challenge(db, creator=stranger, visibility=Visibility.PRIVATE)
    missing = UUID("00000000-0000-0000-0000-000000000000")

    for challenge_id in (hidden.id, missing):
        response = db_client.get(f"/v1/challenges/{challenge_id}/leaderboard", headers=auth())
        assert response.status_code == 404
