from typing import Annotated

from fastapi import APIRouter, Query

from app.auth import CurrentUser
from app.db import DbSession
from app.errors import not_implemented
from app.schemas.recommendations import RecommendationList

router = APIRouter(tags=["recommendations"])


@router.get("/recommendations")
def get_recommendations(
    user: CurrentUser, db: DbSession, limit: Annotated[int, Query(ge=1, le=20)] = 5
) -> RecommendationList:
    """Challenges picked for the current user, best first."""
    not_implemented()
