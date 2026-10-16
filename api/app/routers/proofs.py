from uuid import UUID

from fastapi import APIRouter, status

from app.auth import CurrentUser
from app.db import DbSession
from app.errors import not_implemented
from app.schemas.proofs import (
    DisputeCreate,
    Proof,
    ProofCreate,
    ProofSubmission,
    UploadUrl,
    UploadUrlRequest,
)

router = APIRouter(tags=["proofs"])


@router.post("/proofs/upload-url", status_code=status.HTTP_201_CREATED)
def create_proof_upload_url(body: UploadUrlRequest, user: CurrentUser, db: DbSession) -> UploadUrl:
    """Step 1 of a proof: get a signed URL and PUT the photo to it."""
    not_implemented()


@router.post("/proofs", status_code=status.HTTP_201_CREATED)
def submit_proof(body: ProofCreate, user: CurrentUser, db: DbSession) -> ProofSubmission:
    """Step 2 of a proof: submit the uploaded photo for AI verification.

    Verification usually finishes within the request. If the proof comes back `pending`,
    poll GET /v1/proofs/{proof_id}.
    """
    not_implemented()


@router.get("/proofs/{proof_id}")
def get_proof(proof_id: UUID, user: CurrentUser, db: DbSession) -> Proof:
    not_implemented()


@router.post("/proofs/{proof_id}/dispute")
def dispute_proof(proof_id: UUID, body: DisputeCreate, user: CurrentUser, db: DbSession) -> Proof:
    """Contest a rejected proof; it goes to human review."""
    not_implemented()
