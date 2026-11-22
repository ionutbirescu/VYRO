import base64
from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Participation, User
from tests.conftest import auth, make_challenge

HEADERS = {"Accept": "application/json, text/event-stream", "Content-Type": "application/json"}


def _rpc(client: TestClient, method: str, params: dict[str, Any] | None = None, **kwargs):
    headers = {**HEADERS, **kwargs.get("headers", auth())}
    body = {"jsonrpc": "2.0", "id": 1, "method": method, "params": params or {}}
    return client.post("/v1/mcp", json=body, headers=headers)


def _initialize(client: TestClient) -> dict[str, Any]:
    response = _rpc(
        client,
        "initialize",
        {
            "protocolVersion": "2025-06-18",
            "capabilities": {},
            "clientInfo": {"name": "test", "version": "1"},
        },
    )
    assert response.status_code == 200, response.text
    return response.json()["result"]


def test_requires_a_token(db_client: TestClient, user: User) -> None:
    response = _rpc(db_client, "tools/list", headers={})
    assert response.status_code == 401


def test_requires_a_profile(db_client: TestClient) -> None:
    response = _rpc(db_client, "tools/list", headers=auth("nobody"))
    assert response.status_code == 403


def test_lists_the_coach_tools(db_client: TestClient, user: User) -> None:
    assert _initialize(db_client)["serverInfo"]["name"] == "vyro"

    tools = {t["name"]: t for t in _rpc(db_client, "tools/list").json()["result"]["tools"]}

    assert {"list_my_challenges", "join_challenge", "publish_draft"} <= tools.keys()
    assert tools["get_my_profile"]["annotations"]["readOnlyHint"] is True
    assert tools["join_challenge"]["annotations"]["readOnlyHint"] is False
    assert tools["leave_challenge"]["annotations"]["destructiveHint"] is True


def test_tools_act_as_the_signed_in_user(db_client: TestClient, db: Session, user: User) -> None:
    challenge = make_challenge(db, title="Read 10 pages")
    _initialize(db_client)

    response = _rpc(
        db_client,
        "tools/call",
        {"name": "join_challenge", "arguments": {"challenge_id": str(challenge.id)}},
    )

    result = response.json()["result"]
    assert result["isError"] is False
    assert result["structuredContent"]["joined"] is True
    assert db.scalar(select(Participation).where(Participation.user_id == user.id))

    mine = _rpc(db_client, "tools/call", {"name": "list_my_challenges", "arguments": {}})
    [item] = mine.json()["result"]["structuredContent"]["challenges"]
    assert item["challenge"]["title"] == "Read 10 pages"


def test_submits_a_proof_photo(db_client: TestClient, db: Session, user: User) -> None:
    challenge = make_challenge(db)
    db_client.post(f"/v1/challenges/{challenge.id}/join", headers=auth())
    photo = base64.b64encode(b"\xff\xd8\xff not really a jpeg").decode()

    response = _rpc(
        db_client,
        "tools/call",
        {
            "name": "submit_proof",
            "arguments": {"challenge_id": str(challenge.id), "image_base64": photo},
        },
    )

    result = response.json()["result"]
    assert result["isError"] is False, result
    # Without AI configured, proofs pass unscored.
    assert result["structuredContent"]["status"] == "approved"
    assert result["structuredContent"]["day"] == 1

    board = _rpc(
        db_client,
        "tools/call",
        {"name": "get_leaderboard", "arguments": {"challenge_id": str(challenge.id)}},
    )
    assert board.json()["result"]["structuredContent"]["me"]["completed_days"] == 1


def test_lists_the_mcp_only_tools(db_client: TestClient, user: User) -> None:
    tools = {t["name"]: t for t in _rpc(db_client, "tools/list").json()["result"]["tools"]}

    assert tools["submit_proof"]["annotations"]["readOnlyHint"] is False
    assert tools["check_streak_rescue"]["annotations"]["readOnlyHint"] is False


def test_checks_for_a_streak_rescue(db_client: TestClient, user: User) -> None:
    response = _rpc(db_client, "tools/call", {"name": "check_streak_rescue", "arguments": {}})

    assert response.json()["result"]["structuredContent"]["suggestion"] is None


def test_tool_errors_are_reported(db_client: TestClient, user: User) -> None:
    response = _rpc(
        db_client, "tools/call", {"name": "get_challenge", "arguments": {"challenge_id": "x"}}
    )
    assert response.json()["result"]["isError"] is True
