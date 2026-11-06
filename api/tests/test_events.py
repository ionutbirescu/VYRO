from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.enums import AiVerdict, EventSource
from app.models import Event, User
from app.services import verification
from tests.conftest import auth
from tests.test_challenges import _draft
from tests.test_proofs import _join, _prove


def _server_events(db: Session, user: User) -> dict[str, dict[str, Any]]:
    """The user's server events by name, with each name's latest properties."""
    rows = db.scalars(
        select(Event)
        .where(Event.user_id == user.id, Event.source == EventSource.SERVER)
        .order_by(Event.id)
    )
    return {event.name: event.properties for event in rows}


def test_client_events_are_stored(db_client: TestClient, user: User, db: Session) -> None:
    body = {"events": [{"name": "challenge_viewed", "properties": {"id": "abc"}}]}
    response = db_client.post("/v1/events", headers=auth(), json=body)

    assert response.status_code == 202
    assert response.json() == {"accepted": 1}
    event = db.scalar(select(Event).where(Event.user_id == user.id))
    assert event is not None
    assert (event.name, event.source, event.properties) == (
        "challenge_viewed",
        EventSource.CLIENT,
        {"id": "abc"},
    )


def test_finishing_a_challenge_logs_each_step(
    db_client: TestClient, db: Session, user: User
) -> None:
    participation, tasks = _join(db_client, db, difficulty=2, duration_days=1)
    assert _prove(db_client, participation, tasks[0]).status_code == 201

    logged = _server_events(db, user)
    assert {
        "challenge_joined",
        "proof_verified",
        "task_completed",
        "challenge_completed",
        "achievement_unlocked",
    } <= logged.keys()
    assert logged["challenge_joined"]["challenge_id"] == participation["challenge_id"]
    assert logged["challenge_joined"]["recommendation_id"] is None
    verified = logged["proof_verified"]
    assert (verified["verdict"], verified["model"], verified["day_number"]) == (
        "pass",
        "auto-approve",
        1,
    )
    assert logged["task_completed"]["xp"] == 30
    assert logged["challenge_completed"]["participation_id"] == participation["id"]


def test_rejection_dispute_and_leave_are_logged(
    db_client: TestClient, db: Session, user: User, monkeypatch: pytest.MonkeyPatch
) -> None:
    def reject(*args: Any) -> verification.Result:
        return verification.Result(AiVerdict.FAIL, 0.8, "No pushups visible", "test-model")

    monkeypatch.setattr(verification, "verify", reject)
    participation, tasks = _join(db_client, db)
    proof = _prove(db_client, participation, tasks[0]).json()["proof"]
    db_client.post(f"/v1/proofs/{proof['id']}/dispute", headers=auth(), json={"reason": "I did"})
    db_client.post(f"/v1/challenges/{participation['challenge_id']}/leave", headers=auth())

    logged = _server_events(db, user)
    assert "task_completed" not in logged
    assert (logged["proof_verified"]["verdict"], logged["proof_verified"]["confidence"]) == (
        "fail",
        0.8,
    )
    assert logged["proof_disputed"] == {
        "proof_id": proof["id"],
        "verdict": "fail",
        "confidence": 0.8,
    }
    assert logged["challenge_left"]["completed_tasks"] == 0


def test_creating_a_challenge_is_logged(db_client: TestClient, db: Session, user: User) -> None:
    created = db_client.post("/v1/challenges", headers=auth(), json=_draft())
    assert created.status_code == 201, created.text

    logged = _server_events(db, user)["challenge_created"]
    assert logged["challenge_id"] == created.json()["id"]
    assert (logged["source"], logged["difficulty"], logged["generation_id"]) == ("user", 4, None)
