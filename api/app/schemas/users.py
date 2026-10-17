from datetime import datetime
from functools import cache
from typing import Annotated, Literal
from uuid import UUID
from zoneinfo import available_timezones

from pydantic import AfterValidator, BaseModel, Field, StringConstraints

from app.schemas.common import ApiModel, Difficulty


@cache
def _timezones() -> frozenset[str]:
    return frozenset(available_timezones())


def _check_timezone(value: str) -> str:
    if value not in _timezones():
        raise ValueError("must be an IANA time zone such as 'Europe/Bucharest'")
    return value


Username = Annotated[
    str,
    StringConstraints(pattern=r"^[a-z0-9_.]{3,32}$"),
    Field(description="Lowercase letters, digits, '_' and '.'; 3-32 characters"),
]
DisplayName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=64)]
Bio = Annotated[str, StringConstraints(strip_whitespace=True, max_length=280)]
TimeZone = Annotated[str, AfterValidator(_check_timezone), Field(examples=["Europe/Bucharest"])]


class UserSummary(ApiModel):
    id: UUID
    username: str
    display_name: str
    avatar_url: str | None
    level: int


class UserProfile(UserSummary):
    bio: str | None
    xp: int
    current_streak: int
    longest_streak: int
    followers_count: int
    following_count: int
    completed_challenges: int
    created_at: datetime


class Me(UserProfile):
    timezone: str
    next_level_xp: int = Field(description="Total XP needed to reach the next level")
    is_plus: bool
    plus_until: datetime | None
    suggested_difficulty: Difficulty = Field(
        description="Current adaptive target difficulty; the default for AI Studio"
    )


class MeCreate(BaseModel):
    username: Username
    display_name: DisplayName
    timezone: TimeZone = "UTC"
    confirms_adult: Literal[True] = Field(description="The user confirms they are 18 or older")
    research_consent: bool = Field(description="Informed consent for the pilot study")


class MeUpdate(BaseModel):
    display_name: DisplayName | None = None
    bio: Bio | None = None
    avatar_url: Annotated[str, StringConstraints(max_length=512)] | None = None
    timezone: TimeZone | None = None


class UserPage(BaseModel):
    items: list[UserSummary]
    next_cursor: str | None = None
