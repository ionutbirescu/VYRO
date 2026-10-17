from uuid import UUID

from fastapi import APIRouter, status

from app.auth import CurrentUser
from app.db import DbSession
from app.errors import not_implemented
from app.schemas.ai import AiQuota, GenerateChallengeRequest, GeneratedChallenge, GenerationRating

router = APIRouter(tags=["ai"])


@router.post(
    "/ai/challenges/generate",
    status_code=status.HTTP_201_CREATED,
    responses={status.HTTP_429_TOO_MANY_REQUESTS: {"description": "Daily AI quota used up"}},
)
def generate_challenge(
    body: GenerateChallengeRequest, user: CurrentUser, db: DbSession
) -> GeneratedChallenge:
    """Draft a challenge with AI. Nothing is published until POST /v1/challenges."""
    not_implemented()


@router.get("/ai/quota")
def get_ai_quota(user: CurrentUser, db: DbSession) -> AiQuota:
    not_implemented()


@router.put("/ai/generations/{generation_id}/rating", status_code=status.HTTP_204_NO_CONTENT)
def rate_generation(
    generation_id: UUID, body: GenerationRating, user: CurrentUser, db: DbSession
) -> None:
    not_implemented()
