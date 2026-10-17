from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query, status

from app.auth import CurrentPrincipal, CurrentUser
from app.db import DbSession
from app.errors import not_implemented
from app.schemas.common import Limit
from app.schemas.users import Me, MeCreate, MeUpdate, UserPage, UserProfile

router = APIRouter(tags=["users"])


@router.post(
    "/me",
    status_code=status.HTTP_201_CREATED,
    responses={status.HTTP_409_CONFLICT: {"description": "Username taken or already registered"}},
)
def create_me(body: MeCreate, principal: CurrentPrincipal, db: DbSession) -> Me:
    """Create the VYRO profile for the signed-in Firebase account (first launch)."""
    not_implemented()


@router.get("/me")
def get_me(user: CurrentUser) -> Me:
    not_implemented()


@router.patch("/me")
def update_me(body: MeUpdate, user: CurrentUser, db: DbSession) -> Me:
    not_implemented()


@router.get("/users")
def search_users(
    user: CurrentUser,
    db: DbSession,
    q: Annotated[str, Query(min_length=1, max_length=64, description="Username prefix")],
    cursor: str | None = None,
    limit: Limit = 20,
) -> UserPage:
    not_implemented()


@router.get("/users/{user_id}")
def get_user(user_id: UUID, user: CurrentUser, db: DbSession) -> UserProfile:
    not_implemented()
