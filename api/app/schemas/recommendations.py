from uuid import UUID

from pydantic import Field

from app.schemas.challenges import ChallengeSummary
from app.schemas.common import Schema


class Recommendation(Schema):
    rank: int = Field(ge=1)
    challenge: ChallengeSummary
    reason: str | None = Field(examples=["Because you finished 3 fitness challenges"])


class RecommendationList(Schema):
    recommendation_id: UUID = Field(
        description="Pass to join_challenge and in events so outcomes can be attributed"
    )
    items: list[Recommendation]
