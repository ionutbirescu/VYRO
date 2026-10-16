from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.users import UserSummary


class LeaderboardEntry(BaseModel):
    rank: int = Field(ge=1)
    user: UserSummary
    completed_tasks: int
    xp_earned: int
    last_progress_at: datetime | None


class Leaderboard(BaseModel):
    challenge_id: UUID
    entries: list[LeaderboardEntry]
    me: LeaderboardEntry | None = Field(description="The current user's row, even if not listed")
