"""The AI challenge generator (task 5) and its daily quota.

Treatment users get drafts written by Gemini; control users get hand-written templates, the
baseline the study compares against. Every draft is saved in ai_generations for the metrics
(schema validity, rating, edit rate). Model rows have the Gemini model's name; "template" rows
are the baseline; "template-fallback" rows replaced a model answer that failed.
"""

import time
from datetime import datetime, timedelta
from typing import Any
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.enums import Category, ParticipationStatus, StudyGroup
from app.models import AiGeneration, Challenge, Participation, User
from app.schemas.ai import AiQuota, GenerateChallengeRequest, GeneratedChallenge
from app.schemas.challenges import ChallengeDraft
from app.services import difficulty as adaptive
from app.services import events, templates, vertex

TEMPLATE = "template"
TEMPLATE_FALLBACK = "template-fallback"

SYSTEM_PROMPT = """\
You design challenges for VYRO, a mobile app where people take on daily challenges and prove \
each day's task with one photo. Write one challenge for the user.

Rules:
- Exactly one task per day, numbered from day 1. Multi-day challenges build up gradually.
- Every task is safe, legal, free or cheap, and doable in one day by an ordinary adult. No \
medical, dieting or extreme-exercise advice, nothing dangerous, and nothing that needs other \
people's consent.
- Every task can be proved with a single photo. proof_hint says concretely what the photo \
shows, e.g. "Your running app showing today's distance".
- Difficulty 1-5: 1 takes a few minutes, 3 is a real daily effort of 20-40 minutes, 5 is \
demanding. Match the requested difficulty.
- Title: short and motivating, at most 60 characters. Description: 1-3 sentences. Task titles: \
at most 60 characters. Instructions: 1-3 specific sentences, with numbers and durations.
- Write in English. If the goal is unsafe or not a challenge, write a safe challenge in the \
same spirit instead.
"""


def quota(db: Session, user: User, now: datetime) -> AiQuota:
    """Drafts delivered in the last window (48 hours by default). Failed model calls don't count.

    A draft frees its slot when it leaves the window, so a user at the limit gets the next one
    when enough of their oldest drafts have aged out.
    """
    settings = get_settings()
    window = timedelta(hours=settings.ai_free_window_hours)
    delivered = list(
        db.scalars(
            select(AiGeneration.created_at)
            .where(
                AiGeneration.user_id == user.id,
                AiGeneration.created_at > now - window,
                AiGeneration.output.is_not(None),
            )
            .order_by(AiGeneration.created_at)
        )
    )
    plus = user.plus_until is not None and user.plus_until > now
    limit = None if plus else settings.ai_free_drafts
    blocked = limit is not None and len(delivered) >= limit
    return AiQuota(
        used=len(delivered),
        limit=limit,
        window_hours=settings.ai_free_window_hours,
        # Below the limit again once the (used - limit + 1) oldest drafts have left the window.
        next_free_at=delivered[len(delivered) - limit] + window if blocked and limit else None,
    )


def _response_schema(category: Category | None, duration_days: int) -> dict[str, Any]:
    """What the model must return. Difficulty and duration are filled in by the server."""
    text = {"type": "string", "minLength": 1}
    return {
        "type": "object",
        "additionalProperties": False,
        "required": ["title", "description", "category", "tasks"],
        "properties": {
            "title": {**text, "maxLength": 120},
            "description": {**text, "maxLength": 2000},
            "category": {"type": "string", "enum": [category] if category else list(Category)},
            "tasks": {
                "type": "array",
                "minItems": duration_days,
                "maxItems": duration_days,
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "required": ["day_number", "title", "instructions", "proof_hint"],
                    "properties": {
                        "day_number": {"type": "integer", "minimum": 1, "maximum": duration_days},
                        "title": {**text, "maxLength": 120},
                        "instructions": {**text, "maxLength": 2000},
                        "proof_hint": {**text, "maxLength": 280},
                    },
                },
            },
        },
    }


def _history(db: Session, user: User) -> str:
    """A short summary of the user's recent challenges, to personalize the draft."""
    rows = db.execute(
        select(Challenge.title, Challenge.category, Challenge.difficulty, Participation.status)
        .join(Participation, Participation.challenge_id == Challenge.id)
        .where(Participation.user_id == user.id)
        .order_by(Participation.joined_at.desc())
        .limit(5)
    ).all()
    if not rows:
        return "They haven't taken any challenges yet."
    outcome = {
        ParticipationStatus.ACTIVE: "in progress",
        ParticipationStatus.COMPLETED: "completed",
        ParticipationStatus.ABANDONED: "gave up",
        ParticipationStatus.FAILED: "failed",
    }
    lines = [
        f'- "{title}" ({category}, difficulty {level}): {outcome[state]}'
        for title, category, level, state in rows
    ]
    return "Their recent challenges:\n" + "\n".join(lines)


def _prompt(db: Session, user: User, body: GenerateChallengeRequest, level: int) -> str:
    lines = [
        f"Duration: {body.duration_days} day(s).",
        f"Difficulty: {level} of 5.",
        f"Category: {body.category or 'choose the best fit for the goal'}.",
        f"Goal, in the user's words: {body.goal or 'none given; suggest something fresh'}",
        f"The user is level {user.level} in the app. {_history(db, user)}",
    ]
    return "\n".join(lines)


def _from_model(
    db: Session, user: User, body: GenerateChallengeRequest, level: int, request: dict[str, Any]
) -> AiGeneration:
    """One model call. Its row records the outcome whether or not the answer is usable."""
    model = get_settings().ai_generation_model
    started = time.monotonic()
    generation = AiGeneration(user_id=user.id, request=request, model=model, schema_valid=False)
    try:
        reply = vertex.generate_json(
            model,
            SYSTEM_PROMPT,
            [vertex.text_part(_prompt(db, user, body, level))],
            _response_schema(body.category, body.duration_days),
        )
        generation.model = reply.model
        generation.input_tokens = reply.input_tokens
        generation.output_tokens = reply.output_tokens
        draft = ChallengeDraft.model_validate(
            {**reply.data, "difficulty": level, "duration_days": body.duration_days}
        )
        if body.category and draft.category != body.category:
            raise ValueError(f"asked for {body.category}, got {draft.category}")
        generation.output = draft.model_dump(mode="json")
        generation.schema_valid = True
    except vertex.AiError as error:
        generation.error = str(error)
        generation.input_tokens = error.input_tokens
        generation.output_tokens = error.output_tokens
    except (ValueError, TypeError) as error:  # pydantic's ValidationError is a ValueError
        generation.error = f"Invalid draft: {error}"[:2000]
    generation.latency_ms = round((time.monotonic() - started) * 1000)
    return generation


def _from_template(
    user: User, body: GenerateChallengeRequest, level: int, request: dict[str, Any], model: str
) -> AiGeneration:
    started = time.monotonic()
    draft = templates.draft(body.category, level, body.duration_days, body.goal)
    return AiGeneration(
        user_id=user.id,
        request=request,
        model=model,
        schema_valid=True,
        output=draft.model_dump(mode="json"),
        latency_ms=round((time.monotonic() - started) * 1000),
    )


def generate(
    db: Session, user: User, body: GenerateChallengeRequest, now: datetime
) -> GeneratedChallenge:
    current = quota(db, user, now)
    if current.next_free_at is not None:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            f"You've used your {current.limit} free AI drafts for the last "
            f"{current.window_hours} hours. VYRO+ makes them unlimited.",
        )
    level = body.difficulty or adaptive.target(db, user, now)
    request = {**body.model_dump(mode="json"), "resolved_difficulty": level}

    if user.study_group is StudyGroup.CONTROL:
        generation = _from_template(user, body, level, request, TEMPLATE)
    else:
        attempt = _from_model(db, user, body, level, request)
        # A failed attempt is kept for the schema-validity metric; the user gets a template.
        db.add(attempt)
        generation = (
            attempt
            if attempt.output is not None
            else _from_template(user, body, level, request, TEMPLATE_FALLBACK)
        )
    db.add(generation)
    db.flush()

    events.log(
        db,
        user,
        "ai_challenge_generated",
        generation_id=generation.id,
        model=generation.model,
        duration_days=body.duration_days,
        difficulty=level,
        latency_ms=generation.latency_ms,
    )
    return GeneratedChallenge(
        generation_id=generation.id,
        draft=ChallengeDraft.model_validate(generation.output),
        quota=quota(db, user, now),
    )


def rate(db: Session, user: User, generation_id: UUID, rating: int) -> None:
    generation = db.get(AiGeneration, generation_id)
    if generation is None or generation.user_id != user.id or generation.output is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "AI draft not found")
    generation.rating = rating
    events.log(
        db,
        user,
        "ai_generation_rated",
        generation_id=generation.id,
        model=generation.model,
        rating=rating,
    )
