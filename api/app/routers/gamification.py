from uuid import UUID

from fastapi import APIRouter

from app.auth import CurrentUser
from app.db import DbSession
from app.errors import not_implemented
from app.schemas.gamification import AchievementList

router = APIRouter(tags=["gamification"])


@router.get("/users/{user_id}/achievements")
def list_user_achievements(user_id: UUID, user: CurrentUser, db: DbSession) -> AchievementList:
    """Every achievement, with `unlocked_at` set for the ones this user has."""
    not_implemented()
