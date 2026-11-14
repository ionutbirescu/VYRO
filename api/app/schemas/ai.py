from datetime import datetime
from typing import Annotated
from uuid import UUID

from pydantic import Field, StringConstraints

from app.enums import Category
from app.schemas.challenges import ChallengeDraft
from app.schemas.common import Count, Difficulty, DurationDays, Schema


class GenerateChallengeRequest(Schema):
    goal: Annotated[str, StringConstraints(strip_whitespace=True, max_length=500)] | None = Field(
        default=None, examples=["Run my first 5k"]
    )
    category: Category | None = None
    difficulty: Difficulty | None = Field(
        default=None, description="Omit to use the user's adaptive target difficulty"
    )
    duration_days: DurationDays = 1


class AiQuota(Schema):
    used: Count = Field(description="Drafts delivered in the last window_hours")
    limit: Count | None = Field(description="Free drafts per window. Null means unlimited (VYRO+)")
    window_hours: int = Field(ge=1)
    next_free_at: datetime | None = Field(
        description="When a draft is available again. Null while drafts are left"
    )


class GeneratedChallenge(Schema):
    generation_id: UUID = Field(description="Pass as generation_id when publishing the draft")
    draft: ChallengeDraft
    quota: AiQuota


class GenerationRating(Schema):
    rating: int = Field(ge=1, le=5)
