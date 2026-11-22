from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.coach import rescue
from app.enums import AiVerdict, ParticipationStatus, ProofStatus
from app.models import Challenge, Event, Participation, Proof, User
from app.services import verification, vertex
from tests.conftest import auth, make_challenge, make_user
from tests.test_coach import FakeGemini
from tests.test_proofs import _prove

Json = dict[str, Any]


@pytest.fixture
def gemini(monkeypatch: pytest.MonkeyPatch) -> FakeGemini:
    fake = FakeGemini()
    monkeypatch.setattr(vertex, "enabled", lambda: True)
    monkeypatch.setattr(vertex, "chat", fake)
    return fake


def _join(
    client: TestClient, db: Session, challenge: Challenge, idle_days: int = 3
) -> Participation:
    """Join `challenge` as the test user, as if `idle_days` ago, with nothing done since."""
    response = client.post(f"/v1/challenges/{challenge.id}/join", headers=auth())
    assert response.status_code == 201, response.text
    participation = db.get(Participation, response.json()["id"])
    assert participation is not None
    participation.joined_at = datetime.now(UTC) - timedelta(days=idle_days)
    db.flush()
    return participation


def _rescue(client: TestClient) -> Json | None:
    response = client.get("/v1/coach/rescue", headers=auth())
    assert response.status_code == 200, response.text
    return response.json()


def _events(db: Session, name: str) -> list[Event]:
    return list(db.scalars(select(Event).where(Event.name == name)))


def test_nothing_to_rescue(db_client: TestClient, user: User) -> None:
    assert _rescue(db_client) is None


def test_offers_a_lighter_task_after_a_missed_day(
    db_client: TestClient, db: Session, user: User
) -> None:
    challenge = make_challenge(db, title="Daily pushups")
    _join(db_client, db, challenge)

    offer = _rescue(db_client)

    assert offer is not None
    assert offer["kind"] == "task_swap"
    assert offer["status"] == "open"
    assert offer["chosen_by"] == "rules"
    assert offer["challenge_id"] == str(challenge.id)
    assert "Daily pushups" in offer["message"]
    assert offer["lighter_task"]["proof_hint"] == "You mid-pushup"
    # Once a day: the next call returns the same offer and logs nothing new.
    assert _rescue(db_client)["id"] == offer["id"]  # type: ignore[index]
    assert len(_events(db, "agent_intervention_shown")) == 1


def test_accepting_a_swap_changes_todays_task(
    db_client: TestClient, db: Session, user: User, monkeypatch: pytest.MonkeyPatch
) -> None:
    challenge = make_challenge(db, difficulty=2)
    _join(db_client, db, challenge)
    offer = _rescue(db_client)
    assert offer is not None

    response = db_client.post(f"/v1/coach/rescue/{offer['id']}/accept", headers=auth())

    assert response.status_code == 200
    assert response.json()["status"] == "accepted"
    detail = db_client.get(f"/v1/challenges/{challenge.id}", headers=auth()).json()
    swapped = detail["my_participation"]["swapped_task"]
    assert swapped["day_number"] == 1
    assert swapped["title"] == offer["lighter_task"]["title"]
    assert swapped["xp"] == detail["tasks"][0]["xp"] // 2

    checked: list[Any] = []

    def verify(task, image, mime_type, caption):
        checked.append(task)
        return verification.Result(AiVerdict.PASS, 0.9, "Looks good", "test")

    monkeypatch.setattr(verification, "verify", verify)
    proof = _prove(db_client, detail["my_participation"], detail["tasks"][0])

    assert proof.status_code == 201, proof.text
    assert checked[0].title == swapped["title"]
    assert proof.json()["proof"]["xp_awarded"] == swapped["xp"]
    [rescued] = _events(db, "streak_rescued")
    assert rescued.properties["accepted"] is True
    assert len(_events(db, "agent_action_accepted")) == 1


def test_dismissing_is_final_for_the_day(db_client: TestClient, db: Session, user: User) -> None:
    _join(db_client, db, make_challenge(db))
    offer = _rescue(db_client)
    assert offer is not None

    dismissed = db_client.post(f"/v1/coach/rescue/{offer['id']}/dismiss", headers=auth())
    again = db_client.post(f"/v1/coach/rescue/{offer['id']}/accept", headers=auth())

    assert dismissed.json()["status"] == "dismissed"
    assert again.status_code == 409
    assert _rescue(db_client)["status"] == "dismissed"  # type: ignore[index]
    assert len(_events(db, "agent_intervention_dismissed")) == 1


def test_a_rejected_photo_gets_retake_tips(db_client: TestClient, db: Session, user: User) -> None:
    challenge = make_challenge(db, title="Read 10 pages")
    participation = _join(db_client, db, challenge, idle_days=0)
    db.add(
        Proof(
            participation_id=participation.id,
            task_id=challenge.tasks[0].id,
            user_id=user.id,
            image_path="x.jpg",
            status=ProofStatus.REJECTED,
            ai_verdict=AiVerdict.FAIL,
            ai_reason="The photo is too dark to see the book.",
        )
    )
    db.flush()

    offer = _rescue(db_client)

    assert offer is not None
    assert offer["kind"] == "proof_retake"
    assert "too dark" in offer["message"]
    assert offer["lighter_task"] is None


def test_suggests_the_next_challenge(db_client: TestClient, db: Session, user: User) -> None:
    finished = make_challenge(db, title="Old one")
    participation = _join(db_client, db, finished)
    participation.status = ParticipationStatus.COMPLETED
    participation.ended_at = datetime.now(UTC) - timedelta(days=1)
    db.flush()
    make_challenge(db, title="Next one")

    offer = _rescue(db_client)

    assert offer is not None
    assert offer["kind"] == "next_challenge"
    accepted = db_client.post(f"/v1/coach/rescue/{offer['id']}/accept", headers=auth())
    assert accepted.status_code == 200, accepted.text
    joined = db.scalar(
        select(Participation).where(
            Participation.user_id == user.id, Participation.status == ParticipationStatus.ACTIVE
        )
    )
    assert joined is not None
    assert str(joined.challenge_id) == offer["challenge_id"]
    assert joined.recommendation_id is not None


def test_the_agent_picks_and_writes_the_fix(
    db_client: TestClient, db: Session, user: User, gemini: FakeGemini
) -> None:
    participation = _join(db_client, db, make_challenge(db, title="Daily pushups"))
    pid = str(participation.id)
    lighter = {
        "title": "10 pushups",
        "instructions": "Do 10 pushups, knees down is fine.",
        "proof_hint": "You mid-pushup",
    }
    gemini.script = [
        [("get_task", {"participation_id": pid})],
        [
            (
                "propose",
                {
                    "kind": "task_swap",
                    "participation_id": pid,
                    "message": "Ten pushups today keeps Daily pushups alive.",
                    "lighter_task": lighter,
                },
            )
        ],
    ]

    offer = _rescue(db_client)

    assert offer is not None
    assert offer["chosen_by"] == "agent"
    assert offer["message"] == "Ten pushups today keeps Daily pushups alive."
    assert offer["lighter_task"] == lighter
    [answer] = gemini.tool_answers()
    assert answer["response"]["result"]["instructions"] == "Do 20 pushups."


def test_an_invalid_proposal_goes_back_to_the_agent(
    db_client: TestClient, db: Session, user: User, gemini: FakeGemini
) -> None:
    participation = _join(db_client, db, make_challenge(db))
    pid = str(participation.id)
    gemini.script = [
        # No friend is in this challenge, so buddy isn't one of the situations.
        [("propose", {"kind": "buddy", "participation_id": pid, "message": "Ask a friend"})],
        [("propose", {"kind": "next_challenge", "message": "Try another"})],
        [("get_task", {"participation_id": "not-mine"})],
        # The last step can only propose; the agent still fails, so the rules decide.
        [("propose", {"kind": "task_swap", "participation_id": pid, "message": "Go"})],
    ]

    offer = _rescue(db_client)

    assert offer is not None
    assert offer["chosen_by"] == "rules"
    assert offer["kind"] == "task_swap"
    assert len(gemini.sent) == 4
    assert "error" in gemini.tool_answers(1)[0]["response"]


def test_falls_back_to_rules_when_the_model_fails(
    db_client: TestClient, db: Session, user: User, gemini: FakeGemini
) -> None:
    _join(db_client, db, make_challenge(db))
    gemini.script = [vertex.AiError("down")]

    offer = _rescue(db_client)

    assert offer is not None
    assert offer["chosen_by"] == "rules"


def test_a_friend_in_the_same_challenge(db_client: TestClient, db: Session, user: User) -> None:
    challenge = make_challenge(db, title="Morning run")
    friend = make_user(db, "friend-user")
    db_client.put(f"/v1/users/{friend.id}/follow", headers=auth())
    db_client.put(f"/v1/users/{user.id}/follow", headers=auth("friend-user"))
    db_client.post(f"/v1/challenges/{challenge.id}/join", headers=auth("friend-user"))
    _join(db_client, db, challenge)

    situations = rescue.find_situations(db, user, datetime.now(UTC))

    assert {s.kind.value for s in situations} == {"task_swap", "buddy"}
    [buddy] = [s for s in situations if s.kind.value == "buddy"]
    assert buddy.facts["friends"] == [friend.display_name]


def test_offers_are_private(db_client: TestClient, db: Session, user: User) -> None:
    _join(db_client, db, make_challenge(db))
    offer = _rescue(db_client)
    assert offer is not None
    make_user(db, "other-user")

    response = db_client.post(f"/v1/coach/rescue/{offer['id']}/accept", headers=auth("other-user"))

    assert response.status_code == 404
