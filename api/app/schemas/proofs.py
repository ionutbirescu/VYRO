from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, Field, StringConstraints

from app.enums import AiVerdict, ProofStatus
from app.schemas.common import ApiModel
from app.schemas.gamification import Rewards

ImageContentType = Literal["image/jpeg", "image/png", "image/webp"]


class UploadUrlRequest(BaseModel):
    participation_id: UUID
    task_id: UUID
    content_type: ImageContentType = "image/jpeg"


class UploadUrl(BaseModel):
    upload_url: str = Field(description="Signed Cloud Storage URL; upload the image bytes here")
    method: Literal["PUT"] = "PUT"
    headers: dict[str, str] = Field(description="Headers the upload request must send")
    object_path: str = Field(description="Pass this to POST /v1/proofs after uploading")
    expires_at: datetime


class ProofCreate(BaseModel):
    participation_id: UUID
    task_id: UUID
    object_path: Annotated[str, StringConstraints(max_length=512)]
    caption: Annotated[str, StringConstraints(strip_whitespace=True, max_length=280)] | None = None


class Proof(ApiModel):
    id: UUID
    participation_id: UUID
    task_id: UUID
    status: ProofStatus
    image_url: str | None = Field(description="Short-lived signed URL for viewing the image")
    caption: str | None
    ai_verdict: AiVerdict | None
    ai_confidence: float | None = Field(ge=0, le=1)
    ai_reason: str | None
    xp_awarded: int
    dispute_reason: str | None
    disputed_at: datetime | None
    submitted_at: datetime
    verified_at: datetime | None


class ProofSubmission(BaseModel):
    proof: Proof
    rewards: Rewards | None = Field(description="Present when the proof was approved")


class DisputeCreate(BaseModel):
    reason: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)]
