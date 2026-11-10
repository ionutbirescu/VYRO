from uuid import UUID

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.auth import CurrentUser
from app.db import DbSession
from app.models import Follow, User
from app.pagination import page
from app.schemas.common import Limit
from app.schemas.social import FollowStatus
from app.schemas.users import UserPage, UserSummary

router = APIRouter(tags=["social"])


def _follow_status(db, me_id: UUID, target_id: UUID) -> FollowStatus:
    following = (
        db.scalar(
            select(Follow).where(Follow.follower_id == me_id, Follow.followee_id == target_id)
        )
        is not None
    )
    followed_by = (
        db.scalar(
            select(Follow).where(Follow.follower_id == target_id, Follow.followee_id == me_id)
        )
        is not None
    )
    return FollowStatus(
        user_id=target_id,
        following=following,
        followed_by=followed_by,
        is_friend=following and followed_by,
    )


@router.put("/users/{user_id}/follow")
def follow_user(user_id: UUID, user: CurrentUser, db: DbSession) -> FollowStatus:
    if user_id == user.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cannot follow yourself")
    if db.get(User, user_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    stmt = pg_insert(Follow).values(follower_id=user.id, followee_id=user_id)
    db.execute(stmt.on_conflict_do_nothing())
    db.commit()
    return _follow_status(db, user.id, user_id)


@router.delete("/users/{user_id}/follow")
def unfollow_user(user_id: UUID, user: CurrentUser, db: DbSession) -> FollowStatus:
    if user_id == user.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cannot unfollow yourself")
    follow = db.scalar(
        select(Follow).where(Follow.follower_id == user.id, Follow.followee_id == user_id)
    )
    if follow:
        db.delete(follow)
        db.commit()
    return _follow_status(db, user.id, user_id)


def _users_for_ids(db, ids: list[UUID]) -> list[UserSummary]:
    if not ids:
        return []
    by_id = {u.id: u for u in db.scalars(select(User).where(User.id.in_(ids)))}
    return [UserSummary.model_validate(by_id[i]) for i in ids if i in by_id]


@router.get("/users/{user_id}/followers")
def list_followers(
    user_id: UUID, user: CurrentUser, db: DbSession, cursor: str | None = None, limit: Limit = 20
) -> UserPage:
    if db.get(User, user_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    follows, next_cursor = page(
        db,
        select(Follow).where(Follow.followee_id == user_id),
        Follow.created_at,
        Follow.follower_id,
        cursor,
        limit,
    )
    return UserPage(
        items=_users_for_ids(db, [f.follower_id for f in follows]),
        next_cursor=next_cursor,
    )


@router.get("/users/{user_id}/following")
def list_following(
    user_id: UUID, user: CurrentUser, db: DbSession, cursor: str | None = None, limit: Limit = 20
) -> UserPage:
    if db.get(User, user_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    follows, next_cursor = page(
        db,
        select(Follow).where(Follow.follower_id == user_id),
        Follow.created_at,
        Follow.followee_id,
        cursor,
        limit,
    )
    return UserPage(
        items=_users_for_ids(db, [f.followee_id for f in follows]),
        next_cursor=next_cursor,
    )


@router.get("/me/friends")
def list_friends(
    user: CurrentUser, db: DbSession, cursor: str | None = None, limit: Limit = 20
) -> UserPage:
    """Users the current user follows and who follow them back."""
    i_follow = select(Follow.followee_id).where(Follow.follower_id == user.id)
    they_follow = select(Follow.follower_id).where(Follow.followee_id == user.id)
    stmt = select(User).where(User.id.in_(i_follow), User.id.in_(they_follow))
    users, next_cursor = page(db, stmt, User.created_at, User.id, cursor, limit)
    return UserPage(
        items=[UserSummary.model_validate(u) for u in users],
        next_cursor=next_cursor,
    )
