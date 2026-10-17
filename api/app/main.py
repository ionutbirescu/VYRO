from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.routing import APIRoute

from app import __version__
from app.auth import AUTH_RESPONSES
from app.config import get_settings
from app.routers import (
    ai,
    challenges,
    events,
    gamification,
    health,
    leaderboard,
    me,
    moderation,
    proofs,
    recommendations,
    shop,
    social,
)

DESCRIPTION = """\
Backend for VYRO. Don't just scroll. Challenge yourself.

Every `/v1` endpoint takes `Authorization: Bearer <Firebase ID token>`. A signed-in user without
a profile gets `403 registration_required` and should call `POST /v1/me` first.
Endpoints that are not built yet return `501`.
"""


def _operation_id(route: APIRoute) -> str:
    # Use the handler name ("list_challenges") instead of FastAPI's path-derived default.
    return route.name


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="VYRO API",
        version=__version__,
        description=DESCRIPTION,
        generate_unique_id_function=_operation_id,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    v1 = APIRouter(prefix="/v1", responses=AUTH_RESPONSES)
    for module in (
        me,
        social,
        challenges,
        proofs,
        ai,
        recommendations,
        leaderboard,
        gamification,
        events,
        shop,
        moderation,
    ):
        v1.include_router(module.router)

    app.include_router(health.router)
    app.include_router(v1)
    return app


app = create_app()
