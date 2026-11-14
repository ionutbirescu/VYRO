from datetime import datetime
from typing import Annotated
from uuid import UUID

from pydantic import Field, StringConstraints

from app.schemas.common import Count, Schema
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
    comment_count: Count


class ActivityPage(Schema):
    items: list[ActivityItem]
    can_view_proofs: bool = Field(
        description="The current user joined the challenge, so items include photos and captions"
    )
    next_cursor: str | None = None


class CommentCreate(Schema):
    body: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)]


class Comment(Schema):
    id: UUID
    proof_id: UUID
    user: UserSummary
    body: str
    created_at: datetime
    can_delete: bool = Field(description="The current user wrote it, or owns the proof")


class CommentPage(Schema):
    items: list[Comment] = Field(description="Newest first")
    next_cursor: str | None = None
