"""Request authentication.

Clients sign in with Firebase Authentication and send the Firebase ID token as
`Authorization: Bearer <token>`. In dev mode (local and tests only) the token is `dev:<uid>`,
so the API and mock clients can run without Firebase.
"""

from dataclasses import dataclass
from typing import Annotated, Any

import httpx
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select

from app.config import AuthMode, get_settings
from app.db import DbSession
from app.models import User
from app.schemas.common import ErrorResponse

DEV_TOKEN_PREFIX = "dev:"
REGISTRATION_REQUIRED = "registration_required"

_FIREBASE_LOOKUP_URL = (
    "https://identitytoolkit.googleapis.com/v1/accounts:lookup?key={api_key}"
)

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


def _verify_firebase_token(token: str) -> Principal:
    """Verify a Firebase ID token via the Firebase REST API (no service account needed)."""
    api_key = get_settings().firebase_web_api_key
    if not api_key:
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            "VYRO_FIREBASE_WEB_API_KEY is not configured",
        )
    try:
        response = httpx.post(
            _FIREBASE_LOOKUP_URL.format(api_key=api_key),
            json={"idToken": token},
            timeout=10,
        )
    except httpx.TimeoutException as exc:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE, "Could not verify token, try again"
        ) from exc

    if response.status_code != 200:
        error_msg = response.json().get("error", {}).get("message", "INVALID_ID_TOKEN")
        if "EXPIRED" in error_msg:
            raise _unauthorized("Token expired, please sign in again")
        raise _unauthorized("Invalid or expired token")

    users = response.json().get("users", [])
    if not users:
        raise _unauthorized("Invalid or expired token")

    user = users[0]
    return Principal(uid=user["localId"], email=user.get("email"))


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

    return _verify_firebase_token(token)


CurrentPrincipal = Annotated[Principal, Depends(get_principal)]


def get_current_user(principal: CurrentPrincipal, db: DbSession) -> User:
    user = db.scalar(select(User).where(User.firebase_uid == principal.uid))
    if user is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, REGISTRATION_REQUIRED)
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]
