from datetime import datetime
from typing import Annotated, Self
from uuid import UUID

from pydantic import Field, StringConstraints, model_validator

from app.enums import Category, ChallengeSource, ParticipationStatus, Visibility
from app.schemas.common import ApiModel, Count, Difficulty, DurationDays, Schema
from app.schemas.users import UserSummary

Title = Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=120)]
LongText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)]
ProofHint = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=280),
    Field(description="What the proof photo should show; used by AI verification"),
]


class TaskIn(Schema):
    day_number: int = Field(ge=1, le=30)
    title: Title
    instructions: LongText
    proof_hint: ProofHint


class ChallengeDraft(Schema):
    """Editable challenge content. The AI generator returns one; create accepts one."""

    title: Title
    description: LongText
    category: Category
    difficulty: Difficulty
    duration_days: DurationDays
    tasks: list[TaskIn] = Field(description="Exactly one task per day, numbered from 1")

    @model_validator(mode="after")
    def _one_task_per_day(self) -> Self:
        days = sorted(task.day_number for task in self.tasks)
        if days != list(range(1, self.duration_days + 1)):
            raise ValueError("tasks must cover each day from 1 to duration_days exactly once")
        return self


class ChallengeCreate(ChallengeDraft):
    visibility: Visibility = Visibility.PUBLIC
    generation_id: UUID | None = Field(
        default=None, description="Set when publishing a draft from the AI generator"
    )


class Task(ApiModel):
    id: UUID
    day_number: int
    title: str
    instructions: str
    proof_hint: str
    xp: Count


class ChallengeSummary(ApiModel):
    id: UUID
    title: str
    description: str
    category: Category
    difficulty: Difficulty
    duration_days: DurationDays
    total_xp: Count = Field(description="XP for every task plus the completion bonus")
    source: ChallengeSource
    visibility: Visibility
    is_premium: bool
    participant_count: Count
    creator: UserSummary | None = Field(description="Null for built-in challenges")
    created_at: datetime


class Participation(ApiModel):
    id: UUID
    challenge_id: UUID
    status: ParticipationStatus
    completed_tasks: Count
    total_tasks: Count
    xp_earned: Count
    next_day_number: int | None = Field(
        ge=1, description="Next task to complete; null when finished"
    )
    joined_at: datetime
    last_progress_at: datetime | None
    ended_at: datetime | None


class ChallengeDetail(ChallengeSummary):
    tasks: list[Task]
    my_participation: Participation | None = Field(
        description="The current user's latest participation in this challenge"
    )


class ChallengePage(Schema):
    items: list[ChallengeSummary]
    next_cursor: str | None = None


class ParticipationWithChallenge(Participation):
    challenge: ChallengeSummary


class ParticipationPage(Schema):
    items: list[ParticipationWithChallenge]
    next_cursor: str | None = None


class JoinRequest(Schema):
    recommendation_id: UUID | None = Field(
        default=None,
        description="The recommendation_id from GET /v1/recommendations, if the challenge was "
        "joined from a recommendation",
    )
