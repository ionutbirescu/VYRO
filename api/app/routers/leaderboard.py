from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query

from app.auth import CurrentUser
from app.db import DbSession
from app.errors import not_implemented
from app.schemas.leaderboard import Leaderboard

router = APIRouter(tags=["leaderboard"])


@router.get("/challenges/{challenge_id}/leaderboard")
def get_challenge_leaderboard(
    challenge_id: UUID,
    user: CurrentUser,
    db: DbSession,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
) -> Leaderboard:
    """Participants ranked by completed tasks, then by who got there first."""
    not_implemented()
