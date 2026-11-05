from uuid import UUID

from fastapi import APIRouter, HTTPException, status

from app.auth import CurrentUser
from app.db import DbSession
from app.models import User
from app.schemas.gamification import AchievementList
from app.services import achievements

router = APIRouter(tags=["gamification"])


@router.get("/users/{user_id}/achievements")
def list_user_achievements(user_id: UUID, user: CurrentUser, db: DbSession) -> AchievementList:
    """Every achievement, with `unlocked_at` set for the ones this user has."""
    if db.get(User, user_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    return AchievementList(items=achievements.list_for(db, user_id))
