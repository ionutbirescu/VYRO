from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, status

from app.auth import CurrentUser
from app.db import DbSession
from app.schemas.ai import AiQuota, GenerateChallengeRequest, GeneratedChallenge, GenerationRating
from app.services import generator

router = APIRouter(tags=["ai"])


@router.post(
    "/ai/challenges/generate",
    status_code=status.HTTP_201_CREATED,
    responses={status.HTTP_429_TOO_MANY_REQUESTS: {"description": "Daily AI quota used up"}},
)
def generate_challenge(
    body: GenerateChallengeRequest, user: CurrentUser, db: DbSession
) -> GeneratedChallenge:
    """Draft a challenge with AI. Nothing is published until POST /v1/challenges.

    A 30-day draft can take several seconds. If the model fails, the draft comes from a
    built-in template instead, so this only errors when the quota is used up.
    """
    generated = generator.generate(db, user, body, datetime.now(UTC))
    db.commit()
    return generated


@router.get("/ai/quota")
def get_ai_quota(user: CurrentUser, db: DbSession) -> AiQuota:
    return generator.quota(db, user, datetime.now(UTC))


@router.put("/ai/generations/{generation_id}/rating", status_code=status.HTTP_204_NO_CONTENT)
def rate_generation(
    generation_id: UUID, body: GenerationRating, user: CurrentUser, db: DbSession
) -> None:
    """Rate an AI draft from 1 to 5. Rating again replaces the earlier rating."""
    generator.rate(db, user, generation_id, body.rating)
    db.commit()
