from datetime import datetime

from pydantic import BaseModel, Field


class Achievement(BaseModel):
    code: str
    name: str
    description: str
    icon: str = Field(description="Icon key that the app maps to an asset")
    unlocked_at: datetime | None = Field(description="Null while still locked")


class AchievementList(BaseModel):
    items: list[Achievement]


class Rewards(BaseModel):
    """What an action earned, for the app's celebration UI."""

    xp_awarded: int
    total_xp: int
    level: int
    leveled_up: bool
    current_streak: int
    challenge_completed: bool
    new_achievements: list[Achievement]
