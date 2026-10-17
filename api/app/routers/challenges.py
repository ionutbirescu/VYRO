from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Body, Query, status

from app.auth import CurrentUser
from app.db import DbSession
from app.enums import Category, ParticipationStatus
from app.errors import not_implemented
from app.schemas.challenges import (
    ChallengeCreate,
    ChallengeDetail,
    ChallengePage,
    JoinRequest,
    Participation,
    ParticipationPage,
)
from app.schemas.common import Difficulty, DurationDays, Limit

router = APIRouter(tags=["challenges"])


@router.get("/challenges")
def list_challenges(
    user: CurrentUser,
    db: DbSession,
    category: Category | None = None,
    difficulty: Difficulty | None = None,
    duration_days: DurationDays | None = None,
    q: Annotated[str | None, Query(max_length=64, description="Search in titles")] = None,
    cursor: str | None = None,
    limit: Limit = 20,
) -> ChallengePage:
    """Browse challenges the current user can see (public, or friends-only from friends)."""
    not_implemented()


@router.post("/challenges", status_code=status.HTTP_201_CREATED)
def create_challenge(body: ChallengeCreate, user: CurrentUser, db: DbSession) -> ChallengeDetail:
    """Publish a challenge. XP values are assigned by the server from the difficulty."""
    not_implemented()


@router.get("/challenges/{challenge_id}")
def get_challenge(challenge_id: UUID, user: CurrentUser, db: DbSession) -> ChallengeDetail:
    not_implemented()


@router.post(
    "/challenges/{challenge_id}/join",
    status_code=status.HTTP_201_CREATED,
    responses={status.HTTP_409_CONFLICT: {"description": "Already active in this challenge"}},
)
def join_challenge(
    challenge_id: UUID,
    user: CurrentUser,
    db: DbSession,
    body: Annotated[JoinRequest | None, Body()] = None,
) -> Participation:
    not_implemented()


@router.post("/challenges/{challenge_id}/leave")
def leave_challenge(challenge_id: UUID, user: CurrentUser, db: DbSession) -> Participation:
    """Abandon the current user's active participation."""
    not_implemented()


@router.get("/me/participations")
def list_my_participations(
    user: CurrentUser,
    db: DbSession,
    status: ParticipationStatus | None = None,
    cursor: str | None = None,
    limit: Limit = 20,
) -> ParticipationPage:
    not_implemented()
