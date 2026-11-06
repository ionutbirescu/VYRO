from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Query

from app.auth import CurrentUser
from app.db import DbSession
from app.schemas.recommendations import RecommendationList
from app.services import recommender

router = APIRouter(tags=["recommendations"])


@router.get("/recommendations")
def get_recommendations(
    user: CurrentUser, db: DbSession, limit: Annotated[int, Query(ge=1, le=20)] = 5
) -> RecommendationList:
    """Challenges picked for the current user, best first.

    Pass `recommendation_id` when joining one of them, and in events about them, so the study
    can tell which recommendations led to a join. Each call is a fresh pick.
    """
    recommendations = recommender.recommend(db, user, limit, datetime.now(UTC))
    db.commit()
    return recommendations
