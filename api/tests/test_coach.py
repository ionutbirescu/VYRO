from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.enums import ParticipationStatus
from app.models import Challenge, Participation, User
from app.services import vertex
from tests.conftest import auth, make_challenge, make_user


class FakeGemini:
    """Stands in for vertex.chat: answers with the scripted turns in order and keeps what it
    was sent. A turn is a text reply, a list of function calls, or an AiError to raise."""

    def __init__(self) -> None:
        self.script: list[Any] = []
        self.sent: list[list[dict[str, Any]]] = []

    def __call__(self, model, system, contents, functions, **kwargs) -> vertex.Turn:
        self.sent.append(contents)
        step = self.script.pop(0)
        if isinstance(step, Exception):
            raise step
        if isinstance(step, str):
            parts = [{"text": step}]
        else:
            parts = [
                {"functionCall": {"name": name, "args": args}, "thoughtSignature": "sig"}
                for name, args in step
            ]
        return vertex.Turn({"role": "model", "parts": parts}, "gemini-test", 10, 5)

    def tool_answers(self, call: int = -1) -> list[dict[str, Any]]:
        """The functionResponse parts in the last user turn sent with model call `call`."""
        return [
            p["functionResponse"] for p in self.sent[call][-1]["parts"] if "functionResponse" in p
        ]


@pytest.fixture
def gemini(monkeypatch: pytest.MonkeyPatch) -> FakeGemini:
    fake = FakeGemini()
    monkeypatch.setattr(vertex, "enabled", lambda: True)
    monkeypatch.setattr(vertex, "chat", fake)
    return fake


@pytest.fixture
def challenge(db: Session) -> Challenge:
    return make_challenge(db, title="Morning run")


def _start(client: TestClient, text: str, uid: str = "test-user") -> dict[str, Any]:
    response = client.post("/v1/coach/conversations", json={"text": text}, headers=auth(uid))
    assert response.status_code == 201, response.text
    return response.json()


def _joined(db: Session, user: User, challenge: Challenge) -> bool:
    return (
        db.scalar(
            select(Participation).where(
                Participation.user_id == user.id,
                Participation.challenge_id == challenge.id,
                Participation.status == ParticipationStatus.ACTIVE,
            )
        )
        is not None
    )


def test_needs_ai_configured(db_client: TestClient, user: User) -> None:
    response = db_client.post("/v1/coach/conversations", json={"text": "hi"}, headers=auth())
    assert response.status_code == 503


def test_answers_with_what_a_tool_found(
    db_client: TestClient, db: Session, user: User, challenge: Challenge, gemini: FakeGemini
) -> None:
    db_client.post(f"/v1/challenges/{challenge.id}/join", headers=auth())
    gemini.script = [[("list_my_challenges", {})], "You're on day 1 of Morning run."]

    body = _start(db_client, "How am I doing?")

    assert body["messages"] == [
        {"role": "user", "text": "How am I doing?", "tools_used": []},
        {
            "role": "coach",
            "text": "You're on day 1 of Morning run.",
            "tools_used": ["Checked your challenges"],
        },
    ]
    assert body["pending_action"] is None
    [answer] = gemini.tool_answers()
    [item] = answer["response"]["result"]["challenges"]
    assert item["challenge"]["title"] == "Morning run"
    assert item["progress"]["next_day_number"] == 1
    # The model's own turn goes back unchanged, thought signature included.
    assert gemini.sent[1][1]["parts"][0]["thoughtSignature"] == "sig"


def test_joining_waits_for_approval(
    db_client: TestClient, db: Session, user: User, challenge: Challenge, gemini: FakeGemini
) -> None:
    gemini.script = [[("join_challenge", {"challenge_id": str(challenge.id)})]]

    body = _start(db_client, "Sign me up for Morning run")

    assert body["pending_action"] == {"question": "Join “Morning run”?"}
    assert not _joined(db, user, challenge)

    gemini.script = ["Done, you're in."]
    response = db_client.post(
        f"/v1/coach/conversations/{body['id']}/decision", json={"approve": True}, headers=auth()
    )

    assert response.status_code == 200
    assert _joined(db, user, challenge)
    body = response.json()
    assert body["pending_action"] is None
    assert body["messages"][-1] == {
        "role": "coach",
        "text": "Done, you're in.",
        "tools_used": ["Joined a challenge"],
    }


def test_declining_leaves_data_alone(
    db_client: TestClient, db: Session, user: User, challenge: Challenge, gemini: FakeGemini
) -> None:
    gemini.script = [[("join_challenge", {"challenge_id": str(challenge.id)})]]
    body = _start(db_client, "Sign me up")

    gemini.script = ["No problem."]
    response = db_client.post(
        f"/v1/coach/conversations/{body['id']}/decision", json={"approve": False}, headers=auth()
    )

    assert not _joined(db, user, challenge)
    assert "declined" in gemini.tool_answers()[0]["response"]["error"]
    assert response.json()["messages"][-1]["tools_used"] == []


def test_a_new_message_declines_the_waiting_action(
    db_client: TestClient, db: Session, user: User, challenge: Challenge, gemini: FakeGemini
) -> None:
    gemini.script = [[("leave_challenge", {"challenge_id": str(challenge.id)})]]
    body = _start(db_client, "Get me out")

    gemini.script = ["Okay, staying in."]
    response = db_client.post(
        f"/v1/coach/conversations/{body['id']}/messages",
        json={"text": "Actually never mind"},
        headers=auth(),
    )

    assert response.status_code == 200
    last_turn = gemini.sent[-1][-1]
    assert "functionResponse" in last_turn["parts"][0]
    assert last_turn["parts"][1] == {"text": "Actually never mind"}


def test_tool_errors_go_back_to_the_model(
    db_client: TestClient, user: User, gemini: FakeGemini
) -> None:
    gemini.script = [[("get_challenge", {"challenge_id": "not-a-uuid"})], "I couldn't find it."]

    _start(db_client, "Show me that challenge")

    assert "error" in gemini.tool_answers()[0]["response"]


def test_failure_can_be_retried(db_client: TestClient, user: User, gemini: FakeGemini) -> None:
    gemini.script = [vertex.AiError("down")]
    body = _start(db_client, "Hello")

    assert body["error"]
    assert [m["role"] for m in body["messages"]] == ["user"]

    gemini.script = ["Hi! How can I help?"]
    response = db_client.post(f"/v1/coach/conversations/{body['id']}/retry", headers=auth())

    assert response.json()["error"] is None
    assert response.json()["messages"][-1]["text"] == "Hi! How can I help?"


def test_latest_conversation(db_client: TestClient, user: User, gemini: FakeGemini) -> None:
    assert db_client.get("/v1/coach/conversations/latest", headers=auth()).json() is None
    gemini.script = ["Hi"]
    body = _start(db_client, "Hello")

    latest = db_client.get("/v1/coach/conversations/latest", headers=auth()).json()

    assert latest["id"] == body["id"]


def test_conversations_are_private(
    db_client: TestClient, db: Session, user: User, gemini: FakeGemini
) -> None:
    make_user(db, "other-user")
    gemini.script = ["Hi"]
    body = _start(db_client, "Hello")

    response = db_client.post(
        f"/v1/coach/conversations/{body['id']}/messages",
        json={"text": "hi"},
        headers=auth("other-user"),
    )

    assert response.status_code == 404


def test_daily_limit(
    db_client: TestClient, user: User, gemini: FakeGemini, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(get_settings(), "ai_coach_daily_messages", 1)
    gemini.script = ["Hi"]
    body = _start(db_client, "Hello")

    response = db_client.post(
        f"/v1/coach/conversations/{body['id']}/messages", json={"text": "again"}, headers=auth()
    )

    assert response.status_code == 429
