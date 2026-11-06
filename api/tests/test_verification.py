import base64
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.enums import AiVerdict
from app.models import ChallengeTask, Proof, User
from app.services import verification, vertex
from tests.test_proofs import PHOTO, _join, _prove

TASK = ChallengeTask(
    day_number=2,
    title="Read 10 pages",
    instructions="Read 10 pages of a book.",
    proof_hint="The page you stopped on",
)


class FakeVision:
    def __init__(self, answer: dict[str, Any] | Exception) -> None:
        self.answer = answer
        self.parts: list[dict[str, Any]] = []

    def __call__(
        self, model: str, system: str, parts: list[dict[str, Any]], schema: Any, **kwargs: Any
    ) -> vertex.Reply:
        self.parts = parts
        if isinstance(self.answer, Exception):
            raise self.answer
        return vertex.Reply(self.answer, "gemini-vision-test", 1000, 50)


@pytest.fixture
def vision(monkeypatch: pytest.MonkeyPatch) -> FakeVision:
    fake = FakeVision({"verdict": "pass", "confidence": 0.92, "reason": "Nice, an open book!"})
    monkeypatch.setattr(vertex, "enabled", lambda: True)
    monkeypatch.setattr(vertex, "generate_json", fake)
    return fake


def test_without_a_model_proofs_pass_unscored() -> None:
    result = verification.verify(TASK, PHOTO, "image/jpeg", None)
    assert result == verification.Result(AiVerdict.PASS, None, None, "auto-approve")


def test_the_model_sees_the_task_and_the_photo(vision: FakeVision) -> None:
    result = verification.verify(TASK, PHOTO, "image/png", "Chapter 3 done")

    assert result == verification.Result(
        AiVerdict.PASS, 0.92, "Nice, an open book!", "gemini-vision-test"
    )
    prompt, image = vision.parts
    assert "Read 10 pages" in prompt["text"]
    assert "The page you stopped on" in prompt["text"]
    assert "Chapter 3 done" in prompt["text"]
    assert image["inlineData"]["mimeType"] == "image/png"


@pytest.mark.parametrize(
    "answer",
    [
        vertex.AiError("Vertex AI answered 503"),
        {"verdict": "pass", "confidence": 1.7, "reason": "Out of range"},
        {"verdict": "maybe", "confidence": 0.5, "reason": "Unknown verdict"},
    ],
)
def test_model_failures_approve_without_a_score(vision: FakeVision, answer: Any) -> None:
    vision.answer = answer
    result = verification.verify(TASK, PHOTO, "image/jpeg", None)
    assert result == verification.Result(AiVerdict.PASS, None, None, "auto-approve-fallback")


def test_a_failed_verdict_rejects_the_proof(
    db_client: TestClient, db: Session, user: User, vision: FakeVision
) -> None:
    vision.answer = {"verdict": "fail", "confidence": 0.88, "reason": "That's a mug, not pushups."}
    participation, tasks = _join(db_client, db)

    body = _prove(db_client, participation, tasks[0]).json()

    assert body["rewards"] is None
    proof = body["proof"]
    assert (proof["status"], proof["ai_verdict"], proof["ai_confidence"]) == (
        "rejected",
        "fail",
        0.88,
    )
    assert proof["ai_reason"] == "That's a mug, not pushups."
    # The uploaded photo itself went to the model.
    assert vision.parts[1]["inlineData"]["mimeType"] == "image/jpeg"
    assert base64.b64decode(vision.parts[1]["inlineData"]["data"]) == PHOTO
    stored = db.get(Proof, proof["id"])
    assert stored is not None
    assert stored.ai_model == "gemini-vision-test"
    assert stored.ai_latency_ms is not None
