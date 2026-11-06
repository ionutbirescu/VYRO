import csv
import math
import random
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from analysis import disputes, export, labels, metrics
from app.enums import AiVerdict, EventSource, ParticipationStatus, ProofStatus, StudyGroup
from app.models import (
    AiGeneration,
    Event,
    Participation,
    Proof,
    ProofLabel,
    User,
)
from app.services import verification
from app.services.storage import LocalStorage
from tests.conftest import BASE_URL, auth, make_challenge, make_user
from tests.test_proofs import PHOTO, _join, _prove

NOW = datetime.now(UTC)


def _ago(days: float) -> datetime:
    return NOW - timedelta(days=days)


# --- Building blocks --------------------------------------------------------------------------


def test_cohen_kappa() -> None:
    assert metrics.cohen_kappa([True, False, True, False], [True, False, True, False]) == 1
    assert metrics.cohen_kappa([True, True, False, False], [True, False, True, False]) == 0
    # Both raters always say yes: agreement by chance alone, so kappa is undefined.
    assert metrics.cohen_kappa([True, True], [True, True]) is None
    assert metrics.cohen_kappa([], []) is None


def test_expected_calibration_error() -> None:
    # Confident and right, or unconfident and wrong in proportion: well calibrated.
    assert metrics.expected_calibration_error([1.0, 1.0], [True, True]) == 0
    assert metrics.expected_calibration_error([0.9, 0.9], [False, False]) == pytest.approx(0.9)
    assert metrics.expected_calibration_error(
        [0.75, 0.75, 0.75, 0.75], [True, True, True, False]
    ) == pytest.approx(0)


def test_ndcg() -> None:
    assert metrics.ndcg([1, 0, 0]) == 1
    assert metrics.ndcg([0, 1]) == pytest.approx(1 / math.log2(3))
    assert metrics.ndcg([0, 0, 0]) is None


# --- Export and metrics, end to end -----------------------------------------------------------


def _study(db: Session) -> dict[str, Any]:
    """Two consented users, one per group, and a third who didn't consent."""
    treated = make_user(db, "treated", created_at=_ago(30), research_consent_at=_ago(30))
    control = make_user(
        db,
        "controlled",
        study_group=StudyGroup.CONTROL,
        created_at=_ago(30),
        research_consent_at=_ago(30),
    )
    make_user(db, "no-consent", created_at=_ago(30))
    recommended, other = make_challenge(db, title="Secret title"), make_challenge(db)
    rec_id = uuid4()

    done = Participation(
        user_id=treated.id,
        challenge_id=recommended.id,
        status=ParticipationStatus.COMPLETED,
        completed_tasks=7,
        joined_at=_ago(20),
        recommendation_id=rec_id,
        target_difficulty_at_join=2,
    )
    left = Participation(
        user_id=control.id,
        challenge_id=other.id,
        status=ParticipationStatus.ABANDONED,
        joined_at=_ago(20),
        target_difficulty_at_join=2,
    )
    db.add_all([done, left])
    db.flush()
    task = recommended.tasks[0]
    proofs = [
        Proof(
            participation_id=done.id,
            task_id=task.id,
            user_id=treated.id,
            image_path="proofs/x.jpg",
            caption="Secret caption",
            status=status,
            ai_verdict=verdict,
            ai_confidence=confidence,
            ai_model="gemini",
            disputed_at=_ago(1) if verdict is AiVerdict.FAIL else None,
        )
        for status, verdict, confidence in [
            (ProofStatus.APPROVED, AiVerdict.PASS, 0.9),
            (ProofStatus.DISPUTED, AiVerdict.FAIL, 0.8),
        ]
    ]
    db.add_all(proofs)
    db.flush()
    db.add_all(
        [
            ProofLabel(proof_id=proofs[0].id, rater="r1", is_valid=True),
            ProofLabel(proof_id=proofs[0].id, rater="r2", is_valid=True),
            ProofLabel(proof_id=proofs[1].id, rater="r1", is_valid=False),
            ProofLabel(proof_id=proofs[1].id, rater="r2", is_valid=False),
        ]
    )
    request = {"goal": "Secret goal", "duration_days": 7, "resolved_difficulty": 2}
    draft = {"title": "x"}
    db.add_all(
        [
            AiGeneration(
                user_id=treated.id,
                request=request,
                model="gemini-3.5-flash-lite",
                schema_valid=True,
                output=draft,
                rating=4,
                published_at=_ago(5),
                edited_before_publish=False,
                latency_ms=3000,
            ),
            AiGeneration(
                user_id=treated.id,
                request=request,
                model="gemini-3.5-flash-lite",
                schema_valid=False,
            ),
            AiGeneration(
                user_id=treated.id,
                request=request,
                model="template-fallback",
                schema_valid=True,
                output=draft,
            ),
            AiGeneration(
                user_id=control.id,
                request=request,
                model="template",
                schema_valid=True,
                output=draft,
                rating=2,
            ),
        ]
    )
    served = {
        "recommendation_id": str(rec_id),
        "strategy": "content_epsilon_greedy",
        "items": [
            {"rank": 1, "challenge_id": str(recommended.id), "score": 0.9, "explore": False},
            {"rank": 2, "challenge_id": str(other.id), "score": 0.5, "explore": False},
        ],
    }
    db.add_all(
        [
            Event(
                user_id=treated.id,
                name="recommendations_served",
                source=EventSource.SERVER,
                properties=served,
                created_at=_ago(21),
            ),
            # Active 16 days after joining: retained.
            Event(
                user_id=treated.id,
                name="app_opened",
                source=EventSource.CLIENT,
                created_at=_ago(14),
            ),
            Event(
                user_id=control.id,
                name="app_opened",
                source=EventSource.CLIENT,
                created_at=_ago(29),
            ),
        ]
    )
    db.flush()
    return {"treated": treated, "control": control}


def _csv(path: Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8") as file:
        return list(csv.DictReader(file))


def test_export_is_pseudonymized_and_consent_only(db: Session, user: User, tmp_path: Path) -> None:
    _study(db)
    counts = export.export(db, tmp_path, salt=b"salt", all_users=False, now=NOW)

    assert counts["users"] == 2
    users = _csv(tmp_path / "users.csv")
    assert {u["study_group"] for u in users} == {"treatment", "control"}
    assert all(u["user"].startswith("u_") and len(u["user"]) == 14 for u in users)
    everything = "".join(path.read_text(encoding="utf-8") for path in tmp_path.iterdir())
    for secret in ("treated", "controlled", "no_consent", "Secret", "proofs/x.jpg"):
        assert secret not in everything
    # The same salt gives the same pseudonyms.
    again = tmp_path / "again"
    export.export(db, again, salt=b"salt", all_users=False, now=NOW)
    assert _csv(again / "users.csv") == users
    # Test exports can include everyone.
    everyone = export.export(db, tmp_path / "all", salt=b"x", all_users=True, now=NOW)
    assert everyone["users"] == 4


def test_metrics_from_an_export(db: Session, tmp_path: Path) -> None:
    _study(db)
    export.export(db, tmp_path, salt=b"salt", all_users=False, now=NOW)

    numbers = metrics.report(metrics.Data(tmp_path))

    rq1 = numbers["rq1_recommendations"]["treatment"]
    assert (rq1["lists_served"], rq1["hit_rate"], rq1["precision_at_5"]) == (1, 1, 0.5)
    assert (rq1["ndcg_at_5"], rq1["completed_after_join"]) == (1, 1)
    completion = numbers["rq2_completion"]
    assert completion["treatment"]["completion_rate"] == 1
    assert completion["control"]["abandon_rate"] == 1
    assert completion["treatment"]["mean_difficulty_gap"] == 0
    retention = numbers["rq2_retention"]
    assert (retention["treatment"]["retention_rate"], retention["control"]["retention_rate"]) == (
        1,
        0,
    )
    generation = numbers["generation"]
    assert generation["model"]["calls"] == 2
    assert generation["model"]["schema_valid_rate"] == 0.5
    assert (generation["model"]["mean_rating"], generation["model"]["edit_rate"]) == (4, 0)
    assert generation["template (baseline)"]["mean_rating"] == 2
    assert generation["template (fallback)"]["drafts"] == 1
    rq3 = numbers["rq3_verification"]
    assert (rq3["proofs_labelled"], rq3["accuracy"], rq3["kappa"]) == (2, 1, 1)
    assert rq3["calibration_error"] == pytest.approx(0.15)
    assert rq3["dispute_rate"] == 1
    assert rq3["inter_rater"] == {"raters": ["r1", "r2"], "proofs": 2, "kappa": 1.0}

    report = metrics.markdown(numbers)
    assert "## RQ1: recommendations" in report
    # Groups are columns in alphabetical order; control was never served a list.
    assert "| precision_at_5 | n/a | 0.500 |" in report


# --- Human rating -----------------------------------------------------------------------------


def test_rating_round_trip(db_client: TestClient, db: Session, user: User, tmp_path: Path) -> None:
    participation, tasks = _join(db_client, db)
    proof_id = _prove(db_client, participation, tasks[0]).json()["proof"]["id"]
    # The same folder db_client stored the upload in.
    photos = LocalStorage(tmp_path, BASE_URL)

    out = tmp_path / "to-rate"
    assert labels.export(db, photos, "rater1", out, rng=random.Random(0)) == 1
    [row] = _csv(out / "rater1.csv")
    assert row["proof_id"] == proof_id
    assert row["proof_hint"] == "You mid-pushup"
    assert "ai_verdict" not in row
    assert (out / row["photo"]).read_bytes() == PHOTO

    row["is_valid"] = "yes"
    with (out / "rater1.csv").open("w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=labels.COLUMNS)
        writer.writeheader()
        writer.writerow(row)
    assert labels.import_labels(db, out / "rater1.csv", "rater1") == (1, 0)
    label = db.get(ProofLabel, (proof_id, "rater1"))
    assert label is not None and label.is_valid
    # Already labelled by rater1: not exported to them again, but still to rater2.
    assert labels.export(db, photos, "rater1", tmp_path / "again") == 0
    assert labels.export(db, photos, "rater2", tmp_path / "other") == 1


def test_import_rejects_unclear_values(db: Session, tmp_path: Path) -> None:
    path = tmp_path / "bad.csv"
    path.write_text("proof_id,is_valid\n" + f"{uuid4()},maybe\n", encoding="utf-8")
    with pytest.raises(ValueError, match="Line 2"):
        labels.import_labels(db, path, "rater1")


# --- Disputes ---------------------------------------------------------------------------------


@pytest.fixture
def rejecting(monkeypatch: pytest.MonkeyPatch) -> None:
    def reject(*args: Any) -> verification.Result:
        return verification.Result(AiVerdict.FAIL, 0.7, "No pushups visible", "test-model")

    monkeypatch.setattr(verification, "verify", reject)


def _disputed_proof(client: TestClient, db: Session) -> tuple[dict[str, Any], list[Any], str]:
    participation, tasks = _join(client, db)
    proof_id = _prove(client, participation, tasks[0]).json()["proof"]["id"]
    client.post(f"/v1/proofs/{proof_id}/dispute", headers=auth(), json={"reason": "I did it"})
    return participation, tasks, proof_id


def test_approving_a_dispute_awards_the_task(
    db_client: TestClient, db: Session, user: User, rejecting: None
) -> None:
    participation, _, proof_id = _disputed_proof(db_client, db)
    assert [str(p.id) for p, _ in disputes.pending(db)] == [proof_id]

    assert disputes.resolve(db, proof_id, approve=True).startswith("Approved")

    proof = db.get(Proof, proof_id)
    assert proof is not None and proof.status is ProofStatus.APPROVED
    stored = db.get(Participation, participation["id"])
    assert stored is not None and stored.completed_tasks == 1
    assert stored.last_progress_at == proof.submitted_at
    assert user.xp > 0
    assert db.scalar(select(Event).where(Event.name == "proof_dispute_resolved")) is not None
    assert disputes.pending(db) == []


def test_rejecting_a_dispute(
    db_client: TestClient, db: Session, user: User, rejecting: None
) -> None:
    _, _, proof_id = _disputed_proof(db_client, db)
    assert disputes.resolve(db, proof_id, approve=False) == "Rejected"
    proof = db.get(Proof, proof_id)
    assert proof is not None
    assert (proof.status, proof.disputed_at is not None) == (ProofStatus.REJECTED, True)


def test_cant_approve_a_task_already_redone(
    db_client: TestClient, db: Session, user: User, monkeypatch: pytest.MonkeyPatch, rejecting: None
) -> None:
    participation, tasks, proof_id = _disputed_proof(db_client, db)
    monkeypatch.setattr(
        verification,
        "verify",
        lambda *args: verification.Result(AiVerdict.PASS, 0.9, "Good", "test-model"),
    )
    assert _prove(db_client, participation, tasks[0]).json()["proof"]["status"] == "approved"

    with pytest.raises(ValueError, match="already redone"):
        disputes.resolve(db, proof_id, approve=True)
