"""Request authentication.

Clients sign in with Firebase Authentication and send the Firebase ID token as
`Authorization: Bearer <token>`. In dev mode (local and tests only) the token is `dev:<uid>`,
so the API and mock clients can run without Firebase.
"""

from dataclasses import dataclass
from functools import cache
from typing import Annotated, Any

import firebase_admin
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from firebase_admin import auth as firebase_auth
from sqlalchemy import select

from app.config import AuthMode, get_settings
from app.db import DbSession
from app.models import User
from app.schemas.common import ErrorResponse

DEV_TOKEN_PREFIX = "dev:"
REGISTRATION_REQUIRED = "registration_required"

AUTH_RESPONSES: dict[int | str, dict[str, Any]] = {
    status.HTTP_401_UNAUTHORIZED: {
        "model": ErrorResponse,
        "description": "Missing, invalid or expired bearer token",
    },
    status.HTTP_403_FORBIDDEN: {
        "model": ErrorResponse,
        "description": f"`{REGISTRATION_REQUIRED}`: signed in but no profile yet; call POST /v1/me",
    },
}

_bearer = HTTPBearer(auto_error=False, description="Firebase ID token (dev mode: `dev:<uid>`)")


@dataclass(frozen=True)
class Principal:
    """The signed-in Firebase account, which may not have a VYRO profile yet."""

    uid: str
    email: str | None = None


def _unauthorized(detail: str) -> HTTPException:
    return HTTPException(
        status.HTTP_401_UNAUTHORIZED, detail, headers={"WWW-Authenticate": "Bearer"}
    )


@cache
def _firebase_app() -> firebase_admin.App:
    return firebase_admin.initialize_app(
        options={"projectId": get_settings().firebase_project_id}, name="vyro"
    )


def get_principal(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> Principal:
    if credentials is None:
        raise _unauthorized("Missing bearer token")
    token = credentials.credentials

    if get_settings().auth_mode is AuthMode.DEV:
        uid = token.removeprefix(DEV_TOKEN_PREFIX)
        if not token.startswith(DEV_TOKEN_PREFIX) or not 0 < len(uid) <= 128:
            raise _unauthorized("Dev mode expects a 'dev:<uid>' token")
        return Principal(uid=uid)

    try:
        claims = firebase_auth.verify_id_token(token, app=_firebase_app())
    except firebase_auth.CertificateFetchError as exc:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE, "Could not verify token, try again"
        ) from exc
    except (firebase_auth.InvalidIdTokenError, ValueError) as exc:
        raise _unauthorized("Invalid or expired token") from exc
    return Principal(uid=claims["uid"], email=claims.get("email"))


CurrentPrincipal = Annotated[Principal, Depends(get_principal)]


def get_current_user(principal: CurrentPrincipal, db: DbSession) -> User:
    user = db.scalar(select(User).where(User.firebase_uid == principal.uid))
    if user is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, REGISTRATION_REQUIRED)
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]
