from datetime import timedelta
from pathlib import Path
from typing import Any
from uuid import UUID, uuid4

import httpx2
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.enums import AiVerdict
from app.models import Participation, User
from app.services import verification
from app.services.storage import LocalStorage
from tests.conftest import auth, make_challenge, make_user

PHOTO = b"\xff\xd8\xff not really a jpeg"

Json = dict[str, Any]


def _join(client: TestClient, db: Session, **challenge_fields: Any) -> tuple[Json, list[Json]]:
    challenge = make_challenge(db, **challenge_fields)
    participation = client.post(f"/v1/challenges/{challenge.id}/join", headers=auth()).json()
    tasks = client.get(f"/v1/challenges/{challenge.id}", headers=auth()).json()["tasks"]
    return participation, tasks


def _upload_url(
    client: TestClient, participation: Json, task: Json, uid: str = "test-user"
) -> httpx2.Response:
    body = {"participation_id": participation["id"], "task_id": task["id"]}
    return client.post("/v1/proofs/upload-url", headers=auth(uid), json=body)


def _prove(
    client: TestClient, participation: Json, task: Json, *, upload: bool = True
) -> httpx2.Response:
    target = _upload_url(client, participation, task)
    assert target.status_code == 201, target.text
    target_body = target.json()
    if upload:
        put = client.put(target_body["upload_url"], content=PHOTO, headers=target_body["headers"])
        assert put.status_code == 204
    body = {
        "participation_id": participation["id"],
        "task_id": task["id"],
        "object_path": target_body["object_path"],
        "caption": "Done!",
    }
    return client.post("/v1/proofs", headers=auth(), json=body)


def _participation(client: TestClient, participation: Json) -> Json:
    url = f"/v1/challenges/{participation['challenge_id']}"
    return client.get(url, headers=auth()).json()["my_participation"]


def test_proof_flow_awards_the_task(db_client: TestClient, db: Session, user: User) -> None:
    participation, tasks = _join(db_client, db, difficulty=2, duration_days=7)
    response = _prove(db_client, participation, tasks[0])
    assert response.status_code == 201, response.text
    proof, rewards = response.json()["proof"], response.json()["rewards"]

    assert (proof["status"], proof["ai_verdict"], proof["ai_confidence"]) == (
        "approved",
        "pass",
        None,
    )
    assert (proof["xp_awarded"], proof["caption"]) == (15, "Done!")
    assert (rewards["xp_awarded"], rewards["current_streak"]) == (15, 1)
    assert not rewards["challenge_completed"]
    assert [a["code"] for a in rewards["new_achievements"]] == ["first_task"]

    assert db_client.get(proof["image_url"]).content == PHOTO
    fetched = db_client.get(f"/v1/proofs/{proof['id']}", headers=auth()).json()
    assert fetched["status"] == "approved"

    progress = _participation(db_client, participation)
    assert (progress["completed_tasks"], progress["next_day_number"]) == (1, 2)
    assert progress["xp_earned"] == 15

    dispute = {"reason": "Why not?"}
    url = f"/v1/proofs/{proof['id']}/dispute"
    assert db_client.post(url, headers=auth(), json=dispute).status_code == 409


def test_one_task_per_day_in_order(db_client: TestClient, db: Session, user: User) -> None:
    participation, tasks = _join(db_client, db, duration_days=7)
    assert _upload_url(db_client, participation, tasks[2]).json()["detail"] == (
        "Complete day 1 first"
    )
    _prove(db_client, participation, tasks[0])

    assert _upload_url(db_client, participation, tasks[0]).json()["detail"] == (
        "This task is already done"
    )
    too_soon = _upload_url(db_client, participation, tasks[1])
    assert too_soon.status_code == 409
    assert "tomorrow" in too_soon.json()["detail"]

    row = db.get(Participation, UUID(participation["id"]))
    assert row is not None and row.last_progress_at is not None
    row.last_progress_at -= timedelta(days=1)
    db.flush()
    assert _prove(db_client, participation, tasks[1]).json()["proof"]["status"] == "approved"


def test_last_task_completes_the_challenge(db_client: TestClient, db: Session, user: User) -> None:
    participation, tasks = _join(db_client, db, difficulty=2, duration_days=1)
    rewards = _prove(db_client, participation, tasks[0]).json()["rewards"]

    assert rewards["challenge_completed"]
    assert rewards["xp_awarded"] == 15 + 15
    assert _participation(db_client, participation)["status"] == "completed"
    assert _upload_url(db_client, participation, tasks[0]).status_code == 409


def test_submit_needs_the_uploaded_photo(db_client: TestClient, db: Session, user: User) -> None:
    participation, tasks = _join(db_client, db)
    missing = _prove(db_client, participation, tasks[0], upload=False)
    assert missing.status_code == 400
    assert missing.json()["detail"] == "Upload the photo before submitting it"

    body = {
        "participation_id": participation["id"],
        "task_id": tasks[0]["id"],
        "object_path": f"proofs/{uuid4()}/{participation['id']}/{tasks[0]['id']}/{uuid4()}.jpg",
    }
    foreign = db_client.post("/v1/proofs", headers=auth(), json=body)
    assert foreign.status_code == 400


def test_proofs_are_private(db_client: TestClient, db: Session, user: User) -> None:
    participation, tasks = _join(db_client, db)
    proof = _prove(db_client, participation, tasks[0]).json()["proof"]
    make_user(db, "intruder")

    assert _upload_url(db_client, participation, tasks[0], uid="intruder").status_code == 404
    response = db_client.get(f"/v1/proofs/{proof['id']}", headers=auth("intruder"))
    assert response.status_code == 404


def test_rejected_proof_can_be_disputed(
    db_client: TestClient, db: Session, user: User, monkeypatch: pytest.MonkeyPatch
) -> None:
    def reject(*args: Any) -> verification.Result:
        return verification.Result(AiVerdict.FAIL, 0.9, "No pushups visible", "test-model")

    monkeypatch.setattr(verification, "verify", reject)
    participation, tasks = _join(db_client, db)
    body = _prove(db_client, participation, tasks[0]).json()
    proof = body["proof"]

    assert body["rewards"] is None
    assert (proof["status"], proof["xp_awarded"]) == ("rejected", 0)
    assert (proof["ai_confidence"], proof["ai_reason"]) == (0.9, "No pushups visible")
    assert _participation(db_client, participation)["completed_tasks"] == 0
    # The user can try the same task again.
    assert _upload_url(db_client, participation, tasks[0]).status_code == 201

    url = f"/v1/proofs/{proof['id']}/dispute"
    disputed = db_client.post(url, headers=auth(), json={"reason": "I did 20!"})
    assert disputed.status_code == 200
    assert (disputed.json()["status"], disputed.json()["dispute_reason"]) == (
        "disputed",
        "I did 20!",
    )
    assert db_client.post(url, headers=auth(), json={"reason": "Again"}).status_code == 409


def test_local_storage_stays_in_its_folder(tmp_path: Path) -> None:
    storage = LocalStorage(tmp_path / "uploads", "http://testserver")
    with pytest.raises(HTTPException):
        storage.path("../outside.jpg")
