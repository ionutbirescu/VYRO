import re
import time
from datetime import UTC, datetime
from uuid import UUID, uuid4

from fastapi import APIRouter, HTTPException, status
from sqlalchemy.orm import Session

from app import models
from app.auth import CurrentUser
from app.db import DbSession
from app.enums import AiVerdict, ParticipationStatus, ProofStatus
from app.models import ChallengeTask, Participation, User
from app.schemas.proofs import (
    DisputeCreate,
    Proof,
    ProofCreate,
    ProofSubmission,
    UploadUrl,
    UploadUrlRequest,
)
from app.services import events, progress, verification
from app.services.storage import ProofStorage, Storage

router = APIRouter(tags=["proofs"])

EXTENSIONS = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}


def _object_prefix(user: User, participation_id: UUID, task_id: UUID) -> str:
    return f"proofs/{user.id}/{participation_id}/{task_id}/"


def _provable_task(
    db: Session, user: User, participation_id: UUID, task_id: UUID, now: datetime
) -> tuple[Participation, ChallengeTask]:
    """The user's participation and the task they may prove now, or why they can't."""
    participation = db.get(Participation, participation_id)
    if participation is None or participation.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Participation not found")
    task = db.get(ChallengeTask, task_id)
    if task is None or task.challenge_id != participation.challenge_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Task not found")
    if participation.status is not ParticipationStatus.ACTIVE:
        raise HTTPException(status.HTTP_409_CONFLICT, "This challenge is no longer active")
    next_day = participation.completed_tasks + 1
    if task.day_number < next_day:
        raise HTTPException(status.HTTP_409_CONFLICT, "This task is already done")
    if task.day_number > next_day:
        raise HTTPException(status.HTTP_409_CONFLICT, f"Complete day {next_day} first")
    if progress.completed_today(user, participation, now):
        raise HTTPException(
            status.HTTP_409_CONFLICT, "You already did today's task. Come back tomorrow!"
        )
    return participation, task


def _proof_out(proof: models.Proof, storage: ProofStorage) -> Proof:
    return Proof(
        id=proof.id,
        participation_id=proof.participation_id,
        task_id=proof.task_id,
        status=proof.status,
        image_url=storage.view_url(proof.image_path),
        caption=proof.caption,
        ai_verdict=proof.ai_verdict,
        ai_confidence=proof.ai_confidence,
        ai_reason=proof.ai_reason,
        xp_awarded=proof.xp_awarded,
        dispute_reason=proof.dispute_reason,
        disputed_at=proof.disputed_at,
        submitted_at=proof.submitted_at,
        verified_at=proof.verified_at,
    )


def _own_proof(db: Session, user: User, proof_id: UUID) -> models.Proof:
    proof = db.get(models.Proof, proof_id)
    if proof is None or proof.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Proof not found")
    return proof


@router.post("/proofs/upload-url", status_code=status.HTTP_201_CREATED)
def create_proof_upload_url(
    body: UploadUrlRequest, user: CurrentUser, db: DbSession, storage: Storage
) -> UploadUrl:
    """Step 1 of a proof: get a signed URL and PUT the photo to it."""
    _provable_task(db, user, body.participation_id, body.task_id, datetime.now(UTC))
    prefix = _object_prefix(user, body.participation_id, body.task_id)
    object_path = f"{prefix}{uuid4()}.{EXTENSIONS[body.content_type]}"
    target = storage.upload_target(object_path, body.content_type)
    return UploadUrl(
        upload_url=target.url,
        headers=target.headers,
        object_path=object_path,
        expires_at=target.expires_at,
    )


@router.post("/proofs", status_code=status.HTTP_201_CREATED)
def submit_proof(
    body: ProofCreate, user: CurrentUser, db: DbSession, storage: Storage
) -> ProofSubmission:
    """Step 2 of a proof: submit the uploaded photo for AI verification.

    Verification usually finishes within the request. If the proof comes back `pending`,
    poll GET /v1/proofs/{proof_id}.
    """
    now = datetime.now(UTC)
    progress.lock(db, user)
    participation, task = _provable_task(db, user, body.participation_id, body.task_id, now)

    prefix = re.escape(_object_prefix(user, body.participation_id, body.task_id))
    if not re.fullmatch(rf"{prefix}[0-9a-f-]{{36}}\.(jpg|png|webp)", body.object_path):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "object_path is not from this upload")
    if not storage.exists(body.object_path):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Upload the photo before submitting it")

    proof = models.Proof(
        participation_id=participation.id,
        task_id=task.id,
        user_id=user.id,
        image_path=body.object_path,
        caption=body.caption,
        submitted_at=now,
    )
    db.add(proof)

    started = time.monotonic()
    result = verification.verify(task, proof.image_path, proof.caption)
    proof.ai_verdict = result.verdict
    proof.ai_confidence = result.confidence
    proof.ai_reason = result.reason
    proof.ai_model = result.model
    proof.ai_latency_ms = round((time.monotonic() - started) * 1000)
    proof.verified_at = datetime.now(UTC)
    db.flush()
    events.log(
        db,
        user,
        "proof_verified",
        proof_id=proof.id,
        challenge_id=participation.challenge_id,
        participation_id=participation.id,
        day_number=task.day_number,
        verdict=result.verdict,
        confidence=result.confidence,
        model=result.model,
        latency_ms=proof.ai_latency_ms,
    )

    rewards = None
    if result.verdict is AiVerdict.PASS:
        rewards = progress.approve_proof(db, user, participation, task, proof, now)
    else:
        # Unsure counts as rejected: the user can dispute it for human review.
        proof.status = ProofStatus.REJECTED
    db.commit()
    return ProofSubmission(proof=_proof_out(proof, storage), rewards=rewards)


@router.get("/proofs/{proof_id}")
def get_proof(proof_id: UUID, user: CurrentUser, db: DbSession, storage: Storage) -> Proof:
    return _proof_out(_own_proof(db, user, proof_id), storage)


@router.post("/proofs/{proof_id}/dispute")
def dispute_proof(
    proof_id: UUID, body: DisputeCreate, user: CurrentUser, db: DbSession, storage: Storage
) -> Proof:
    """Contest a rejected proof; it goes to human review."""
    proof = _own_proof(db, user, proof_id)
    if proof.status is not ProofStatus.REJECTED:
        raise HTTPException(status.HTTP_409_CONFLICT, "Only a rejected proof can be disputed")
    proof.status = ProofStatus.DISPUTED
    proof.dispute_reason = body.reason
    proof.disputed_at = datetime.now(UTC)
    events.log(
        db,
        user,
        "proof_disputed",
        proof_id=proof.id,
        verdict=proof.ai_verdict,
        confidence=proof.ai_confidence,
    )
    db.commit()
    return _proof_out(proof, storage)
