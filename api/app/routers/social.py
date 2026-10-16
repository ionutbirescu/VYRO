from uuid import UUID

from fastapi import APIRouter

from app.auth import CurrentUser
from app.db import DbSession
from app.errors import not_implemented
from app.schemas.common import Limit
from app.schemas.social import FollowStatus
from app.schemas.users import UserPage

router = APIRouter(tags=["social"])


@router.put("/users/{user_id}/follow")
def follow_user(user_id: UUID, user: CurrentUser, db: DbSession) -> FollowStatus:
    not_implemented()


@router.delete("/users/{user_id}/follow")
def unfollow_user(user_id: UUID, user: CurrentUser, db: DbSession) -> FollowStatus:
    not_implemented()


@router.get("/users/{user_id}/followers")
def list_followers(
    user_id: UUID, user: CurrentUser, db: DbSession, cursor: str | None = None, limit: Limit = 20
) -> UserPage:
    not_implemented()


@router.get("/users/{user_id}/following")
def list_following(
    user_id: UUID, user: CurrentUser, db: DbSession, cursor: str | None = None, limit: Limit = 20
) -> UserPage:
    not_implemented()


@router.get("/me/friends")
def list_friends(
    user: CurrentUser, db: DbSession, cursor: str | None = None, limit: Limit = 20
) -> UserPage:
    """Users the current user follows and who follow them back."""
    not_implemented()
