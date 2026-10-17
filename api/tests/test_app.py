import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import AuthMode, Settings
from app.models import Event, User
from scripts import export_openapi
from tests.conftest import auth


def test_health(client: TestClient) -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_contract_is_up_to_date() -> None:
    committed = export_openapi.CONTRACT.read_text(encoding="utf-8").replace("\r\n", "\n")
    assert committed == export_openapi.render(), "run: python scripts/export_openapi.py"


def test_prod_rejects_dev_auth() -> None:
    with pytest.raises(ValidationError):
        Settings(env="prod", auth_mode=AuthMode.DEV)


def test_firebase_auth_requires_project_id() -> None:
    with pytest.raises(ValidationError):
        Settings(auth_mode=AuthMode.FIREBASE, firebase_project_id=None)


@pytest.mark.parametrize(
    "headers",
    [{}, {"Authorization": "Bearer not-a-dev-token"}, {"Authorization": "Bearer dev:"}],
)
def test_missing_or_bad_token_is_401(client: TestClient, headers: dict[str, str]) -> None:
    response = client.get("/v1/challenges", headers=headers)
    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"


def test_unregistered_user_must_register(db_client: TestClient) -> None:
    response = db_client.get("/v1/challenges", headers=auth("nobody"))
    assert response.status_code == 403
    assert response.json()["detail"] == "registration_required"


def test_unbuilt_endpoint_is_501(db_client: TestClient, user: User) -> None:
    assert db_client.get("/v1/challenges", headers=auth()).status_code == 501


def test_ingest_events(db_client: TestClient, db: Session, user: User) -> None:
    response = db_client.post(
        "/v1/events",
        headers=auth(),
        json={
            "events": [
                {"name": "challenge_viewed", "properties": {"challenge_id": "abc"}},
                {"name": "tab_opened", "client_ts": "2026-10-17T09:00:00Z"},
            ]
        },
    )
    assert response.status_code == 202
    assert response.json() == {"accepted": 2}
    names = db.scalars(select(Event.name).where(Event.user_id == user.id)).all()
    assert sorted(names) == ["challenge_viewed", "tab_opened"]


def test_event_names_are_validated(db_client: TestClient, user: User) -> None:
    response = db_client.post("/v1/events", headers=auth(), json={"events": [{"name": "Bad Name"}]})
    assert response.status_code == 422


def test_unknown_fields_are_rejected(db_client: TestClient, user: User) -> None:
    response = db_client.post(
        "/v1/events", headers=auth(), json={"events": [{"name": "tab_opened", "nmae": "typo"}]}
    )
    assert response.status_code == 422
