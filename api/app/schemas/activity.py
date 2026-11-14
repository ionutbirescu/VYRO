from datetime import datetime
from uuid import UUID

from pydantic import Field

from app.schemas.common import Schema
from app.schemas.users import UserSummary


class ActivityItem(Schema):
    """One approved proof: someone completed a day of the challenge."""

    proof_id: UUID
    user: UserSummary
    day_number: int = Field(ge=1)
    task_title: str
    completed_at: datetime
    image_url: str | None = Field(
        description="Short-lived photo URL. Only for users who joined the challenge"
    )
    caption: str | None = Field(description="Only for users who joined the challenge")


class ActivityPage(Schema):
    items: list[ActivityItem]
    can_view_proofs: bool = Field(
        description="The current user joined the challenge, so items include photos and captions"
    )
    next_cursor: str | None = None
