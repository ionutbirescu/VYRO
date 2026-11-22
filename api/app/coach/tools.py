"""Tools the coach (and the MCP server) can use. Each one calls the matching API handler, so
visibility rules, validation and event logging are the same as for the app itself.

Tools with a `confirm` text change the user's data or spend their AI quota. The coach never runs
those on its own: the user approves them in the app first.
"""

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any
from uuid import UUID

from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.enums import ALLOWED_DURATIONS, Category, ParticipationStatus, Visibility
from app.models import (
    AiGeneration,
    Challenge,
    ChallengeTask,
    Participation,
    Proof,
    TaskSwap,
    User,
)
from app.routers import ai as ai_api
from app.routers import challenges as challenges_api
from app.routers import leaderboard as leaderboard_api
from app.routers import me as me_api
from app.routers import recommendations as recommendations_api
from app.schemas.ai import GenerateChallengeRequest
from app.schemas.challenges import ChallengeCreate, ChallengeSummary, JoinRequest
from app.schemas.challenges import Participation as ParticipationOut
from app.schemas.leaderboard import LeaderboardEntry

DIFFICULTY_LABELS = {1: "easy", 2: "medium", 3: "hard", 4: "very hard", 5: "extreme"}

Args = dict[str, Any]


@dataclass(frozen=True)
class Tool:
    name: str
    description: str
    parameters: dict[str, Any]
    run: Callable[[Session, User, Args], Any]
    # Shown in the app next to the coach's reply, e.g. "Checked your challenges".
    label: str
    # Builds the question the app asks before running the tool. None: runs without asking.
    confirm: Callable[[Session, User, Args], str] | None = None

    def declaration(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "parametersJsonSchema": self.parameters,
        }


def _object(properties: dict[str, Any] | None = None, required: list[str] | None = None):
    return {
        "type": "object",
        "properties": properties or {},
        "required": required or [],
        "additionalProperties": False,
    }


def _challenge(c: ChallengeSummary) -> dict[str, Any]:
    return {
        "id": str(c.id),
        "title": c.title,
        "description": c.description[:240],
        "category": c.category.value,
        "difficulty": DIFFICULTY_LABELS[c.difficulty],
        "duration_days": c.duration_days,
        "total_xp": c.total_xp,
        "participants": c.participant_count,
    }


def _participation(p: ParticipationOut) -> dict[str, Any]:
    return {
        "status": p.status.value,
        "completed_tasks": p.completed_tasks,
        "total_tasks": p.total_tasks,
        "next_day_number": p.next_day_number,
        "next_task_is_lighter_version": p.swapped_task is not None,
        "xp_earned": p.xp_earned,
        "joined_at": p.joined_at.isoformat(),
        "last_progress_at": p.last_progress_at.isoformat() if p.last_progress_at else None,
    }


def _challenge_title(db: Session, challenge_id: str) -> str:
    try:
        challenge = db.get(Challenge, UUID(challenge_id))
    except ValueError:
        challenge = None
    return f"“{challenge.title}”" if challenge else "this challenge"


# --- Reading ----------------------------------------------------------------------------------


def get_my_profile(db: Session, user: User, args: Args) -> dict[str, Any]:
    me = me_api.get_me(user, db)
    return {
        "display_name": me.display_name,
        "level": me.level,
        "xp": me.xp,
        "xp_for_next_level": me.next_level_xp,
        "current_streak_days": me.current_streak,
        "longest_streak_days": me.longest_streak,
        "completed_challenges": me.completed_challenges,
        "has_vyro_plus": me.is_plus,
        "suggested_difficulty": DIFFICULTY_LABELS[me.suggested_difficulty],
        "timezone": me.timezone,
    }


def list_my_challenges(db: Session, user: User, args: Args) -> dict[str, Any]:
    status = ParticipationStatus(args.get("status", "active"))
    page = challenges_api.list_my_participations(user, db, status, None, 20)
    return {
        "challenges": [
            {"challenge": _challenge(p.challenge), "progress": _participation(p)}
            for p in page.items
        ]
    }


def get_challenge(db: Session, user: User, args: Args) -> dict[str, Any]:
    detail = challenges_api.get_challenge(UUID(args["challenge_id"]), user, db)
    mine = detail.my_participation
    return {
        **_challenge(detail),
        "description": detail.description,
        "tasks": [
            {"day": t.day_number, "title": t.title, "instructions": t.instructions[:300]}
            for t in detail.tasks
        ],
        "my_progress": _participation(mine) if mine else None,
    }


def search_challenges(db: Session, user: User, args: Args) -> dict[str, Any]:
    difficulty = args.get("difficulty")
    page = challenges_api.list_challenges(
        user,
        db,
        Category(args["category"]) if args.get("category") else None,
        {v: k for k, v in DIFFICULTY_LABELS.items()}[difficulty] if difficulty else None,
        args.get("duration_days"),
        args.get("title_contains"),
        None,
        min(int(args.get("limit", 8)), 10),
    )
    return {"challenges": [_challenge(c) for c in page.items]}


def get_leaderboard(db: Session, user: User, args: Args) -> dict[str, Any]:
    limit = min(int(args.get("limit", 10)), 20)
    board = leaderboard_api.get_challenge_leaderboard(UUID(args["challenge_id"]), user, db, limit)

    def row(entry: LeaderboardEntry) -> dict[str, Any]:
        return {
            "rank": entry.rank,
            "name": entry.user.display_name,
            "completed_days": entry.completed_tasks,
            "xp_earned": entry.xp_earned,
        }

    return {"top": [row(e) for e in board.entries], "me": row(board.me) if board.me else None}


def proof_info(db: Session, proof: Proof) -> dict[str, Any]:
    """A proof as the model sees it: the verdict, and the task (or its lighter swap) it was
    checked against."""
    task = db.get(ChallengeTask, proof.task_id)
    assert task is not None
    checked_against = db.get(TaskSwap, (proof.participation_id, proof.task_id)) or task
    return {
        "day": task.day_number,
        "status": proof.status.value,
        "ai_verdict": proof.ai_verdict.value if proof.ai_verdict else None,
        "ai_confidence": proof.ai_confidence,
        "ai_reason": proof.ai_reason,
        "caption": proof.caption,
        "task_title": checked_against.title,
        "task_instructions": checked_against.instructions[:400],
        "photo_should_show": checked_against.proof_hint,
        "submitted_at": proof.submitted_at.isoformat(),
    }


def get_latest_proof(db: Session, user: User, args: Args) -> dict[str, Any]:
    proof = db.scalar(
        select(Proof)
        .join(Participation, Participation.id == Proof.participation_id)
        .where(Proof.user_id == user.id, Participation.challenge_id == UUID(args["challenge_id"]))
        .order_by(Proof.submitted_at.desc())
        .limit(1)
    )
    return {"proof": proof_info(db, proof) if proof else None}


def get_recommendations(db: Session, user: User, args: Args) -> dict[str, Any]:
    result = recommendations_api.get_recommendations(user, db, min(int(args.get("limit", 5)), 5))
    return {
        "recommendation_id": str(result.recommendation_id),
        "recommendations": [
            {"challenge": _challenge(r.challenge), "reason": r.reason} for r in result.items
        ],
    }


# --- Acting (need the user's approval) --------------------------------------------------------


def join_challenge(db: Session, user: User, args: Args) -> dict[str, Any]:
    recommendation_id = args.get("recommendation_id")
    body = JoinRequest(recommendation_id=UUID(recommendation_id)) if recommendation_id else None
    joined = challenges_api.join_challenge(UUID(args["challenge_id"]), user, db, body)
    return {"joined": True, "progress": _participation(joined)}


def leave_challenge(db: Session, user: User, args: Args) -> dict[str, Any]:
    left = challenges_api.leave_challenge(UUID(args["challenge_id"]), user, db)
    return {"left": True, "progress": _participation(left)}


def create_challenge_draft(db: Session, user: User, args: Args) -> dict[str, Any]:
    body = GenerateChallengeRequest(
        goal=args["goal"],
        category=Category(args["category"]) if args.get("category") else None,
        duration_days=args.get("duration_days", 7),
    )
    generated = ai_api.generate_challenge(body, user, db)
    draft = generated.draft
    return {
        "generation_id": str(generated.generation_id),
        "title": draft.title,
        "description": draft.description,
        "category": draft.category.value,
        "difficulty": DIFFICULTY_LABELS[draft.difficulty],
        "duration_days": draft.duration_days,
        "tasks": [{"day": t.day_number, "title": t.title} for t in draft.tasks],
        "drafts_left": (
            None if generated.quota.limit is None else generated.quota.limit - generated.quota.used
        ),
    }


def publish_draft(db: Session, user: User, args: Args) -> dict[str, Any]:
    generation_id = UUID(args["generation_id"])
    generation = db.get(AiGeneration, generation_id)
    if generation is None or generation.user_id != user.id or generation.output is None:
        raise HTTPException(404, "AI draft not found")
    body = ChallengeCreate(
        **generation.output,
        generation_id=generation_id,
        visibility=Visibility(args.get("visibility", "public")),
    )
    created = challenges_api.create_challenge(body, user, db)
    return {"published": True, "challenge": _challenge(created)}


def _draft_title(db: Session, generation_id: str) -> str:
    try:
        generation = db.get(AiGeneration, UUID(generation_id))
    except ValueError:
        generation = None
    if generation is None or generation.output is None:
        return "this draft"
    return f"“{generation.output['title']}”"


_CHALLENGE_ID = {"type": "string", "description": "The challenge id (a UUID) from another tool"}

TOOLS: dict[str, Tool] = {
    tool.name: tool
    for tool in [
        Tool(
            "get_my_profile",
            "The user's level, XP, streaks, number of completed challenges, whether they have "
            "VYRO+, and the difficulty that suits them right now.",
            _object(),
            get_my_profile,
            "Checked your profile",
        ),
        Tool(
            "list_my_challenges",
            "The user's challenges with progress: completed days out of total, the next day to "
            "do, XP earned and when they last made progress.",
            _object(
                {
                    "status": {
                        "type": "string",
                        "enum": [s.value for s in ParticipationStatus],
                        "description": "Defaults to active",
                    }
                }
            ),
            list_my_challenges,
            "Checked your challenges",
        ),
        Tool(
            "get_challenge",
            "One challenge with its day-by-day tasks and the user's progress in it.",
            _object({"challenge_id": _CHALLENGE_ID}, ["challenge_id"]),
            get_challenge,
            "Read a challenge",
        ),
        Tool(
            "search_challenges",
            "Browse challenges the user can join. All filters are optional.",
            _object(
                {
                    "category": {"type": "string", "enum": [c.value for c in Category]},
                    "difficulty": {"type": "string", "enum": list(DIFFICULTY_LABELS.values())},
                    "duration_days": {"type": "integer", "enum": list(ALLOWED_DURATIONS)},
                    "title_contains": {"type": "string", "maxLength": 64},
                    "limit": {"type": "integer", "minimum": 1, "maximum": 10},
                }
            ),
            search_challenges,
            "Searched challenges",
        ),
        Tool(
            "get_recommendations",
            "Challenges picked for this user, best first, each with the reason it was picked. "
            "Pass the recommendation_id to join_challenge when joining one of them.",
            _object({"limit": {"type": "integer", "minimum": 1, "maximum": 5}}),
            get_recommendations,
            "Looked at recommendations",
        ),
        Tool(
            "get_leaderboard",
            "Who is furthest in a challenge, and where the user stands.",
            _object(
                {
                    "challenge_id": _CHALLENGE_ID,
                    "limit": {"type": "integer", "minimum": 1, "maximum": 20},
                },
                ["challenge_id"],
            ),
            get_leaderboard,
            "Checked the leaderboard",
        ),
        Tool(
            "get_latest_proof",
            "The user's most recent proof photo in a challenge: whether it passed, the "
            "verifier's reason and what the photo should show. Use it to explain a rejection.",
            _object({"challenge_id": _CHALLENGE_ID}, ["challenge_id"]),
            get_latest_proof,
            "Checked your last photo",
        ),
        Tool(
            "join_challenge",
            "Join a challenge for the user. The app asks the user to approve first.",
            _object(
                {
                    "challenge_id": _CHALLENGE_ID,
                    "recommendation_id": {
                        "type": "string",
                        "description": "From get_recommendations, if the challenge came from it",
                    },
                },
                ["challenge_id"],
            ),
            join_challenge,
            "Joined a challenge",
            lambda db, user, args: f"Join {_challenge_title(db, args.get('challenge_id', ''))}?",
        ),
        Tool(
            "leave_challenge",
            "Leave (abandon) one of the user's active challenges. Progress in it is lost. The "
            "app asks the user to approve first.",
            _object({"challenge_id": _CHALLENGE_ID}, ["challenge_id"]),
            leave_challenge,
            "Left a challenge",
            lambda db, user, args: (
                f"Leave {_challenge_title(db, args.get('challenge_id', ''))}? "
                "Your progress in it will be lost."
            ),
        ),
        Tool(
            "create_challenge_draft",
            "Write a new challenge with AI from the user's goal. Uses one of the user's AI "
            "drafts (free users get a few per window). Nothing is published yet; show the user "
            "the draft and publish it with publish_draft if they want it. The app asks the user "
            "to approve first.",
            _object(
                {
                    "goal": {"type": "string", "maxLength": 500},
                    "category": {"type": "string", "enum": [c.value for c in Category]},
                    "duration_days": {"type": "integer", "enum": list(ALLOWED_DURATIONS)},
                },
                ["goal"],
            ),
            create_challenge_draft,
            "Wrote a challenge draft",
            lambda db, user, args: (
                f"Write a {args.get('duration_days', 7)}-day challenge for "
                f"“{str(args.get('goal', ''))[:80]}”? This uses one AI draft."
            ),
        ),
        Tool(
            "publish_draft",
            "Publish a draft made by create_challenge_draft so the user (and others, if public) "
            "can join it. The app asks the user to approve first.",
            _object(
                {
                    "generation_id": {"type": "string"},
                    "visibility": {"type": "string", "enum": [v.value for v in Visibility]},
                },
                ["generation_id"],
            ),
            publish_draft,
            "Published a challenge",
            lambda db, user, args: f"Publish {_draft_title(db, args.get('generation_id', ''))}?",
        ),
    ]
}


def run_tool(
    db: Session, user: User, name: str, args: Args, tools: dict[str, Tool] = TOOLS
) -> dict[str, Any]:
    """Run a tool and return what the model should see. Errors come back as {"error": ...} so
    the model can explain them or try something else."""
    tool = tools.get(name)
    if tool is None:
        return {"error": f"There is no tool called {name}"}
    try:
        return {"result": tool.run(db, user, args)}
    except HTTPException as error:
        db.rollback()
        return {"error": str(error.detail)}
    except (ValidationError, ValueError, KeyError, TypeError) as error:
        db.rollback()
        return {"error": f"Invalid arguments: {error}"[:400]}
