from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, Field, StringConstraints

from app.enums import ReportTarget


class ReportCreate(BaseModel):
    target_type: ReportTarget
    target_id: Annotated[str, StringConstraints(min_length=1, max_length=128)] = Field(
        description="UUID for users, challenges and proofs; Firestore id for chat messages"
    )
    reason: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)]


class ReportCreated(BaseModel):
    id: UUID
