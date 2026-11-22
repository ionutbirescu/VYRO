"""VYRO as an MCP server, so any MCP client (Claude Desktop, Claude Code, an IDE) can work with
a user's challenges. It serves the same tools as the in-app coach.

Streamable HTTP at /v1/mcp, stateless. Clients send the app's bearer token (`dev:<uid>` locally,
a Firebase ID token otherwise) and every tool acts as that user. Tools that change data are
annotated as not read-only, so clients ask the user before calling them.
"""

import base64
import json
from collections.abc import Iterator
from contextlib import asynccontextmanager, contextmanager
from datetime import UTC, datetime
from typing import Any
from uuid import UUID, uuid4

import anyio
from fastapi import FastAPI, HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from mcp import types
from mcp.server.lowlevel import Server
from mcp.server.lowlevel.server import StreamableHTTPASGIApp
from mcp.server.streamable_http_manager import StreamableHTTPSessionManager
from mcp.server.transport_security import TransportSecuritySettings
from sqlalchemy import select
from sqlalchemy.orm import Session
from starlette.responses import JSONResponse
from starlette.routing import Route
from starlette.types import ASGIApp, Receive, Scope, Send

from app import __version__
from app.auth import REGISTRATION_REQUIRED, get_principal
from app.coach import rescue
from app.coach.tools import TOOLS, Tool, run_tool
from app.db import get_db
from app.enums import ParticipationStatus
from app.models import ChallengeTask, Participation, User
from app.routers import coach as coach_api
from app.routers import proofs as proofs_api
from app.schemas.proofs import ProofCreate
from app.services.storage import (
    LOCAL_ROOT,
    MAX_UPLOAD_BYTES,
    LocalStorage,
    ProofStorage,
    get_local_storage,
    get_storage,
)

PATH = "/v1/mcp"
# Where locally stored proof photos are served, for MCP calls that have no request host.
LOCAL_BASE_URL = "http://localhost:8000"
INSTRUCTIONS = (
    "Tools for VYRO, a habit app with day-by-day challenges. Look up the user's progress before "
    "giving advice. Ask before joining, leaving, drafting or publishing anything."
)
_DESTRUCTIVE = {"leave_challenge"}
# Run without asking, but record something (the day's streak rescue suggestion).
_WRITES_QUIETLY = {"check_streak_rescue"}


@contextmanager
def _db(app: FastAPI) -> Iterator[Session]:
    """A session from the same provider the API uses, so test overrides apply here too."""
    provided = app.dependency_overrides.get(get_db, get_db)()
    if isinstance(provided, Session):
        yield provided
        return
    try:
        yield next(provided)
    finally:
        provided.close()


def _authenticate(app: FastAPI, authorization: str) -> Any:
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(401, "Missing bearer token")
    principal = get_principal(HTTPAuthorizationCredentials(scheme="Bearer", credentials=token))
    with _db(app) as db:
        user_id = db.scalar(select(User.id).where(User.firebase_uid == principal.uid))
    if user_id is None:
        raise HTTPException(403, REGISTRATION_REQUIRED)
    return user_id


class _AuthGate:
    """Rejects requests without a valid VYRO token and passes the user's id on to the tools."""

    def __init__(self, app: FastAPI, inner: ASGIApp) -> None:
        self.app = app
        self.inner = inner

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        headers = dict(scope.get("headers") or [])
        authorization = headers.get(b"authorization", b"").decode()
        try:
            user_id = await anyio.to_thread.run_sync(_authenticate, self.app, authorization)
        except HTTPException as error:
            response = JSONResponse(
                {"detail": error.detail},
                error.status_code,
                headers={"WWW-Authenticate": "Bearer"} if error.status_code == 401 else None,
            )
            await response(scope, receive, send)
            return
        scope.setdefault("state", {})["vyro_user_id"] = user_id
        await self.inner(scope, receive, send)


def _storage(app: FastAPI) -> ProofStorage:
    """Proof storage as the API's routes get it, test overrides included."""
    override = app.dependency_overrides.get(get_local_storage)
    return get_storage(override() if override else LocalStorage(LOCAL_ROOT, LOCAL_BASE_URL))


def _mcp_only_tools(app: FastAPI) -> list[Tool]:
    """Tools only MCP clients get: the in-app coach can't send photos, and the app shows the
    streak rescue card itself."""

    def submit_proof(db: Session, user: User, args: dict[str, Any]) -> dict[str, Any]:
        participation = db.scalar(
            select(Participation).where(
                Participation.user_id == user.id,
                Participation.challenge_id == UUID(args["challenge_id"]),
                Participation.status == ParticipationStatus.ACTIVE,
            )
        )
        if participation is None:
            raise HTTPException(404, "You are not in this challenge")
        task = db.scalar(
            select(ChallengeTask).where(
                ChallengeTask.challenge_id == participation.challenge_id,
                ChallengeTask.day_number == participation.completed_tasks + 1,
            )
        )
        if task is None:
            raise HTTPException(409, "This challenge has no task left")
        mime_type = args.get("mime_type", "image/jpeg")
        if mime_type not in proofs_api.EXTENSIONS:
            raise ValueError("mime_type must be image/jpeg, image/png or image/webp")
        data = base64.b64decode(args["image_base64"], validate=True)
        if not 0 < len(data) <= MAX_UPLOAD_BYTES:
            raise ValueError("The photo must be between 1 byte and 10 MB")

        storage = _storage(app)
        prefix = proofs_api.object_prefix(user, participation.id, task.id)
        object_path = f"{prefix}{uuid4()}.{proofs_api.EXTENSIONS[mime_type]}"
        storage.save(object_path, data, mime_type)
        body = ProofCreate(
            participation_id=participation.id,
            task_id=task.id,
            object_path=object_path,
            caption=args.get("caption"),
        )
        submission = proofs_api.submit_proof(body, user, db, storage)
        proof, rewards = submission.proof, submission.rewards
        return {
            "day": task.day_number,
            "status": proof.status.value,
            "ai_verdict": proof.ai_verdict.value if proof.ai_verdict else None,
            "ai_confidence": proof.ai_confidence,
            "ai_reason": proof.ai_reason,
            "xp_awarded": proof.xp_awarded,
            "current_streak": rewards.current_streak if rewards else None,
            "challenge_completed": rewards.challenge_completed if rewards else False,
        }

    def check_streak_rescue(db: Session, user: User, args: dict[str, Any]) -> dict[str, Any]:
        intervention = rescue.todays_intervention(db, user, datetime.now(UTC))
        if intervention is None:
            return {"suggestion": None, "note": "Nothing needs rescuing today"}
        return {"suggestion": coach_api.rescue_offer(intervention).model_dump(mode="json")}

    return [
        Tool(
            "submit_proof",
            "Submit today's proof photo for one of the user's challenges. The photo is checked "
            "by AI against today's task (or its lighter version); if it passes, the day counts "
            "and XP is awarded. One task per day.",
            {
                "type": "object",
                "properties": {
                    "challenge_id": {"type": "string"},
                    "image_base64": {"type": "string", "description": "The photo, base64"},
                    "mime_type": {"type": "string", "enum": list(proofs_api.EXTENSIONS)},
                    "caption": {"type": "string", "maxLength": 280},
                },
                "required": ["challenge_id", "image_base64"],
                "additionalProperties": False,
            },
            submit_proof,
            "Submitted a proof",
            lambda db, user, args: "Submit this photo as today's proof?",
        ),
        Tool(
            "check_streak_rescue",
            "Run the streak rescue coach: if a challenge is at risk today, it picks one fix (a "
            "lighter task, photo tips, a friend to check in with, or the next challenge) and "
            "returns it. At most one suggestion a day; later calls return the same one. The "
            "user accepts or dismisses it in the app.",
            {"type": "object", "properties": {}, "additionalProperties": False},
            check_streak_rescue,
            "Checked for a streak rescue",
        ),
    ]


def _tool_list(tools: dict[str, Tool]) -> list[types.Tool]:
    return [
        types.Tool(
            name=tool.name,
            title=tool.name.replace("_", " ").capitalize(),
            description=tool.description,
            input_schema=tool.parameters,
            annotations=types.ToolAnnotations(
                read_only_hint=tool.confirm is None and tool.name not in _WRITES_QUIETLY,
                destructive_hint=tool.name in _DESTRUCTIVE,
                open_world_hint=False,
            ),
        )
        for tool in tools.values()
    ]


def install(app: FastAPI) -> StreamableHTTPSessionManager:
    """Add the MCP endpoint to `app`. Run the returned manager in the app's lifespan."""
    tools = {**TOOLS, **{tool.name: tool for tool in _mcp_only_tools(app)}}

    async def list_tools(ctx, params) -> types.ListToolsResult:
        return types.ListToolsResult(tools=_tool_list(tools))

    async def call_tool(ctx, params: types.CallToolRequestParams) -> types.CallToolResult:
        user_id = ctx.request.state.vyro_user_id

        def work() -> dict[str, Any]:
            with _db(app) as db:
                user = db.get(User, user_id)
                return run_tool(db, user, params.name, dict(params.arguments or {}), tools)

        outcome = await anyio.to_thread.run_sync(work)
        payload = outcome.get("result", outcome)
        return types.CallToolResult(
            content=[types.TextContent(type="text", text=json.dumps(payload, ensure_ascii=False))],
            structured_content=payload,
            is_error="error" in outcome,
        )

    server = Server(
        "vyro",
        title="VYRO",
        version=__version__,
        instructions=INSTRUCTIONS,
        on_list_tools=list_tools,
        on_call_tool=call_tool,
    )
    manager = StreamableHTTPSessionManager(
        app=server,
        json_response=True,
        stateless=True,
        # Every request needs a bearer token, so DNS rebinding can't borrow a browser's access.
        security_settings=TransportSecuritySettings(enable_dns_rebinding_protection=False),
    )
    endpoint = _AuthGate(app, StreamableHTTPASGIApp(manager))
    app.router.routes.append(Route(PATH, endpoint=endpoint, methods=["GET", "POST", "DELETE"]))
    return manager


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with app.state.mcp_manager.run():
        yield
