from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import uuid4
from zoneinfo import ZoneInfo

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.enums import Category, StudyGroup
from app.models import AiGeneration, Challenge, User
from app.schemas.challenges import ChallengeDraft
from app.services import templates, vertex
from tests.conftest import auth, make_user

GENERATE = "/v1/ai/challenges/generate"


def _model_draft(days: int, category: str = "fitness") -> dict[str, Any]:
    return {
        "title": "Couch to 5k",
        "description": "Build up to your first 5k.",
        "category": category,
        "tasks": [
            {
                "day_number": day,
                "title": f"Run day {day}",
                "instructions": "Run-walk for 20 minutes.",
                "proof_hint": "Your running app",
            }
            for day in range(1, days + 1)
        ],
    }


class FakeModel:
    """Stands in for vertex.generate_json and remembers what it was asked. With no answer set,
    it answers validly for whatever duration and category it is asked for."""

    def __init__(self, answer: dict[str, Any] | Exception | None = None) -> None:
        self.answer = answer
        self.calls: list[dict[str, Any]] = []

    def __call__(
        self, model: str, system: str, parts: list[dict[str, Any]], schema: dict[str, Any]
    ) -> vertex.Reply:
        self.calls.append({"model": model, "prompt": parts[0]["text"], "schema": schema})
        if isinstance(self.answer, Exception):
            raise self.answer
        if self.answer is None:
            days = schema["properties"]["tasks"]["minItems"]
            category = schema["properties"]["category"]["enum"][0]
            return vertex.Reply(_model_draft(days, category), "gemini-test", 100, 200)
        return vertex.Reply(self.answer, "gemini-test", 100, 200)


@pytest.fixture
def fake_model(monkeypatch: pytest.MonkeyPatch) -> FakeModel:
    fake = FakeModel()
    monkeypatch.setattr(vertex, "generate_json", fake)
    return fake


def _generations(db: Session, user: User) -> list[AiGeneration]:
    return list(
        db.scalars(
            select(AiGeneration)
            .where(AiGeneration.user_id == user.id)
            .order_by(AiGeneration.created_at, AiGeneration.schema_valid)
        )
    )


def test_treatment_users_get_a_model_draft(
    db_client: TestClient, db: Session, user: User, fake_model: FakeModel
) -> None:
    response = db_client.post(
        GENERATE, headers=auth(), json={"goal": "Run my first 5k", "duration_days": 7}
    )

    assert response.status_code == 201, response.text
    body = response.json()
    assert body["draft"]["title"] == "Couch to 5k"
    # Difficulty was left out, so it's the user's adaptive target (2 with no history).
    assert (body["draft"]["difficulty"], body["draft"]["duration_days"]) == (2, 7)
    assert body["quota"]["used_today"] == 1
    assert body["quota"]["daily_limit"] == 5

    [call] = fake_model.calls
    assert "Run my first 5k" in call["prompt"]
    assert "Difficulty: 2 of 5." in call["prompt"]
    assert call["schema"]["properties"]["tasks"]["minItems"] == 7
    assert len(call["schema"]["properties"]["category"]["enum"]) == len(Category)

    [generation] = _generations(db, user)
    assert str(generation.id) == body["generation_id"]
    assert (generation.model, generation.schema_valid, generation.error) == (
        "gemini-test",
        True,
        None,
    )
    assert (generation.input_tokens, generation.output_tokens) == (100, 200)
    assert generation.request["resolved_difficulty"] == 2


@pytest.mark.parametrize(
    ("answer", "error"),
    [
        # Six tasks for a seven-day challenge.
        (_model_draft(6), "Invalid draft"),
        # A different category from the one asked for.
        (_model_draft(7, category="reading"), "Invalid draft"),
        (vertex.AiError("Vertex AI answered 503", 50, None), "Vertex AI answered 503"),
    ],
)
def test_a_failed_model_answer_falls_back_to_a_template(
    db_client: TestClient,
    db: Session,
    user: User,
    fake_model: FakeModel,
    answer: Any,
    error: str,
) -> None:
    fake_model.answer = answer
    response = db_client.post(
        GENERATE, headers=auth(), json={"category": "fitness", "difficulty": 3, "duration_days": 7}
    )

    assert response.status_code == 201, response.text
    draft = response.json()["draft"]
    assert (draft["category"], draft["difficulty"], len(draft["tasks"])) == ("fitness", 3, 7)
    assert response.json()["quota"]["used_today"] == 1

    failed, fallback = _generations(db, user)
    assert not failed.schema_valid
    assert failed.output is None
    assert failed.error is not None and failed.error.startswith(error)
    assert (fallback.model, str(fallback.id)) == (
        "template-fallback",
        response.json()["generation_id"],
    )


def test_control_users_get_templates_without_calling_the_model(
    db_client: TestClient, db: Session, fake_model: FakeModel
) -> None:
    control = make_user(db, "control-user", study_group=StudyGroup.CONTROL)
    response = db_client.post(
        GENERATE,
        headers=auth("control-user"),
        json={"category": "reading", "difficulty": 4, "duration_days": 14},
    )

    assert response.status_code == 201, response.text
    assert fake_model.calls == []
    draft = response.json()["draft"]
    assert (draft["category"], draft["difficulty"], len(draft["tasks"])) == ("reading", 4, 14)
    [generation] = _generations(db, control)
    assert generation.model == "template"


def test_free_users_have_a_daily_limit(
    db_client: TestClient, db: Session, user: User, fake_model: FakeModel
) -> None:
    for _ in range(5):
        assert db_client.post(GENERATE, headers=auth(), json={}).status_code == 201

    response = db_client.post(GENERATE, headers=auth(), json={})

    assert response.status_code == 429
    assert "VYRO+" in response.json()["detail"]
    assert len(fake_model.calls) == 5


def test_failed_model_calls_dont_use_up_the_quota(
    db_client: TestClient, db: Session, user: User, fake_model: FakeModel
) -> None:
    fake_model.answer = vertex.AiError("down")
    db_client.post(GENERATE, headers=auth(), json={})

    quota = db_client.get("/v1/ai/quota", headers=auth()).json()
    assert quota["used_today"] == 1


def test_vyro_plus_is_unlimited(db_client: TestClient, db: Session, fake_model: FakeModel) -> None:
    make_user(db, "plus-user", plus_until=datetime.now(UTC) + timedelta(days=30))
    for _ in range(7):
        response = db_client.post(GENERATE, headers=auth("plus-user"), json={})
        assert response.status_code == 201
    assert response.json()["quota"]["daily_limit"] is None


def test_quota_resets_at_local_midnight(db_client: TestClient, db: Session) -> None:
    make_user(db, "night-owl", timezone="Pacific/Auckland")
    quota = db_client.get("/v1/ai/quota", headers=auth("night-owl")).json()

    zone = ZoneInfo("Pacific/Auckland")
    tomorrow = datetime.now(zone).date() + timedelta(days=1)
    resets_at = datetime.fromisoformat(quota["resets_at"]).astimezone(zone)
    assert (resets_at.date(), resets_at.hour, resets_at.minute) == (tomorrow, 0, 0)
    assert (quota["used_today"], quota["daily_limit"]) == (0, 5)


def test_rating_a_draft(
    db_client: TestClient, db: Session, user: User, fake_model: FakeModel
) -> None:
    generation_id = db_client.post(GENERATE, headers=auth(), json={}).json()["generation_id"]
    url = f"/v1/ai/generations/{generation_id}/rating"

    assert db_client.put(url, headers=auth(), json={"rating": 2}).status_code == 204
    assert db_client.put(url, headers=auth(), json={"rating": 4}).status_code == 204
    assert db_client.put(url, headers=auth(), json={"rating": 6}).status_code == 422
    [generation] = _generations(db, user)
    assert generation.rating == 4

    make_user(db, "someone-else")
    assert db_client.put(url, headers=auth("someone-else"), json={"rating": 1}).status_code == 404
    missing = f"/v1/ai/generations/{uuid4()}/rating"
    assert db_client.put(missing, headers=auth(), json={"rating": 1}).status_code == 404


def test_publishing_a_draft_records_whether_it_was_edited(
    db_client: TestClient, db: Session, user: User, fake_model: FakeModel
) -> None:
    generated = db_client.post(GENERATE, headers=auth(), json={"duration_days": 7}).json()
    unchanged = {**generated["draft"], "generation_id": generated["generation_id"]}

    created = db_client.post("/v1/challenges", headers=auth(), json=unchanged)

    assert created.status_code == 201, created.text
    assert created.json()["source"] == "ai"
    challenge = db.get(Challenge, created.json()["id"])
    assert challenge is not None
    [generation] = _generations(db, user)
    assert generation.published_at is not None
    assert generation.edited_before_publish is False


@pytest.mark.parametrize("category", list(Category))
def test_every_template_makes_valid_drafts(category: Category) -> None:
    for duration_days in (1, 7, 14, 30):
        for level in range(1, 6):
            draft = templates.draft(category, level, duration_days, goal="Feel better")
            assert ChallengeDraft.model_validate(draft.model_dump()) == draft
            assert "{n}" not in " ".join(task.instructions for task in draft.tasks)
