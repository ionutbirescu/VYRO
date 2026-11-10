import random
from datetime import UTC, datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, select

from app.auth import CurrentPrincipal, CurrentUser
from app.db import DbSession
from app.enums import ParticipationStatus, PriceVariant, StudyGroup
from app.models import Follow, Participation, User
from app.pagination import page
from app.schemas.common import Limit
from app.schemas.users import Me, MeCreate, MeUpdate, UserPage, UserProfile, UserSummary
from app.services import events, progress
from app.services import difficulty as adaptive

router = APIRouter(tags=["users"])


def _counts(db, user_id: UUID) -> tuple[int, int, int]:
    """Return (followers_count, following_count, completed_challenges)."""
    followers = db.scalar(
        select(func.count()).select_from(Follow).where(Follow.followee_id == user_id)
    ) or 0
    following = db.scalar(
        select(func.count()).select_from(Follow).where(Follow.follower_id == user_id)
    ) or 0
    completed = db.scalar(
        select(func.count()).select_from(Participation).where(
            Participation.user_id == user_id,
            Participation.status == ParticipationStatus.COMPLETED,
        )
    ) or 0
    return followers, following, completed


def _me_out(db, user: User, now: datetime) -> Me:
    followers, following, completed = _counts(db, user.id)
    return Me(
        id=user.id,
        username=user.username,
        display_name=user.display_name,
        avatar_url=user.avatar_url,
        level=user.level,
        bio=user.bio,
        xp=user.xp,
        current_streak=progress.current_streak(user, now),
        longest_streak=user.longest_streak,
        followers_count=followers,
        following_count=following,
        completed_challenges=completed,
        created_at=user.created_at,
        timezone=user.timezone,
        next_level_xp=progress.xp_for_level(user.level + 1),
        is_plus=user.plus_until is not None and user.plus_until > now,
        plus_until=user.plus_until,
        suggested_difficulty=adaptive.target(db, user, now),
    )


def _profile_out(db, user: User, now: datetime) -> UserProfile:
    followers, following, completed = _counts(db, user.id)
    return UserProfile(
        id=user.id,
        username=user.username,
        display_name=user.display_name,
        avatar_url=user.avatar_url,
        level=user.level,
        bio=user.bio,
        xp=user.xp,
        current_streak=progress.current_streak(user, now),
        longest_streak=user.longest_streak,
        followers_count=followers,
        following_count=following,
        completed_challenges=completed,
        created_at=user.created_at,
    )


@router.post(
    "/me",
    status_code=status.HTTP_201_CREATED,
    responses={status.HTTP_409_CONFLICT: {"description": "Username taken or already registered"}},
)
def create_me(body: MeCreate, principal: CurrentPrincipal, db: DbSession) -> Me:
    """Create the VYRO profile for the signed-in Firebase account (first launch)."""
    if db.scalar(select(User).where(User.firebase_uid == principal.uid)):
        raise HTTPException(status.HTTP_409_CONFLICT, "Account already registered")
    if db.scalar(select(User).where(func.lower(User.username) == body.username.lower())):
        raise HTTPException(status.HTTP_409_CONFLICT, "Username already taken")
    now = datetime.now(UTC)
    user = User(
        firebase_uid=principal.uid,
        username=body.username,
        display_name=body.display_name,
        timezone=body.timezone,
        study_group=random.choice(list(StudyGroup)),
        price_variant=random.choice(list(PriceVariant)),
        research_consent_at=now if body.research_consent else None,
    )
    db.add(user)
    db.flush()
    events.log(db, user, "user_registered", research_consent=body.research_consent)
    db.commit()
    return _me_out(db, user, now)


@router.get("/me")
def get_me(user: CurrentUser, db: DbSession) -> Me:
    return _me_out(db, user, datetime.now(UTC))


@router.patch("/me")
def update_me(body: MeUpdate, user: CurrentUser, db: DbSession) -> Me:
    if body.display_name is not None:
        user.display_name = body.display_name
    if body.bio is not None:
        user.bio = body.bio
    if body.avatar_url is not None:
        user.avatar_url = body.avatar_url
    if body.timezone is not None:
        user.timezone = body.timezone
    db.commit()
    return _me_out(db, user, datetime.now(UTC))


@router.get("/users")
def search_users(
    user: CurrentUser,
    db: DbSession,
    q: Annotated[str, Query(min_length=1, max_length=64, description="Username prefix")],
    cursor: str | None = None,
    limit: Limit = 20,
) -> UserPage:
    stmt = select(User).where(User.username.ilike(f"{q.strip().lower()}%"))
    users, next_cursor = page(db, stmt, User.created_at, User.id, cursor, limit)
    return UserPage(
        items=[UserSummary.model_validate(u) for u in users],
        next_cursor=next_cursor,
    )


@router.get("/users/{user_id}")
def get_user(user_id: UUID, user: CurrentUser, db: DbSession) -> UserProfile:
    target = db.get(User, user_id)
    if target is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    return _profile_out(db, target, datetime.now(UTC))
