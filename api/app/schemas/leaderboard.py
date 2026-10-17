from datetime import datetime
from uuid import UUID

from pydantic import Field

from app.schemas.common import Count, Schema
from app.schemas.users import UserSummary


class LeaderboardEntry(Schema):
    rank: int = Field(ge=1)
    user: UserSummary
    completed_tasks: Count
    xp_earned: Count
    last_progress_at: datetime | None


class Leaderboard(Schema):
    challenge_id: UUID
    entries: list[LeaderboardEntry]
    me: LeaderboardEntry | None = Field(description="The current user's row, even if not listed")
