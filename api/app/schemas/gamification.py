from datetime import datetime

from pydantic import Field

from app.schemas.common import Count, Level, Schema


class Achievement(Schema):
    code: str
    name: str
    description: str
    icon: str = Field(description="Icon key that the app maps to an asset")
    unlocked_at: datetime | None = Field(description="Null while still locked")


class AchievementList(Schema):
    items: list[Achievement]


class Rewards(Schema):
    """What an action earned, for the app's celebration UI."""

    xp_awarded: Count
    total_xp: Count
    level: Level
    leveled_up: bool
    current_streak: Count
    challenge_completed: bool
    new_achievements: list[Achievement]
