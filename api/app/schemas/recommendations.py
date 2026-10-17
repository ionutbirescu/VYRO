from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.challenges import ChallengeSummary


class Recommendation(BaseModel):
    rank: int = Field(ge=1)
    challenge: ChallengeSummary
    reason: str | None = Field(examples=["Because you finished 3 fitness challenges"])


class RecommendationList(BaseModel):
    recommendation_id: UUID = Field(
        description="Pass to join_challenge and in events so outcomes can be attributed"
    )
    items: list[Recommendation]
