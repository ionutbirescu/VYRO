from enum import StrEnum
from functools import cache
from typing import Literal, Self

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class AuthMode(StrEnum):
    # Verify Firebase ID tokens (staging/production).
    FIREBASE = "firebase"
    # Accept "dev:<uid>" bearer tokens. Local development and tests only.
    DEV = "dev"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="VYRO_", env_file=".env", extra="ignore")

    env: Literal["local", "test", "prod"] = "local"
    database_url: str = "postgresql+psycopg://vyro:vyro@localhost:5432/vyro"
    auth_mode: AuthMode = AuthMode.DEV
    firebase_project_id: str | None = None
    # Firebase Web API key — used for token verification via REST API (no service account needed).
    # Find it in Firebase Console → Project Settings → General → Web API Key.
    firebase_web_api_key: str | None = None
    cors_origins: list[str] = ["http://localhost:8081", "http://localhost:8082"]
    # Cloud Storage bucket for proof photos. Unset locally: the API stores them itself.
    # Not validated here: the migration job shares these settings and has no bucket.
    proof_bucket: str | None = None
    # Google Cloud project for Gemini on Vertex AI. Unset (or empty): no model calls, so the
    # generator uses its templates and proofs fall back to the placeholder verifier.
    ai_project: str | None = None
    # The newest Gemini models are served from the global endpoint only.
    ai_location: str = "global"
    # A cheaper model writes challenges; the stronger one judges photos.
    ai_generation_model: str = "gemini-3.5-flash-lite"
    ai_verification_model: str = "gemini-3.5-flash"
    # Free users' AI drafts per local day; VYRO+ is unlimited.
    ai_daily_limit: int = 5

    @model_validator(mode="after")
    def _check_prod_safety(self) -> Self:
        if self.env == "prod" and self.auth_mode is AuthMode.DEV:
            raise ValueError("VYRO_AUTH_MODE=dev is not allowed when VYRO_ENV=prod")
        if self.auth_mode is AuthMode.FIREBASE and not self.firebase_project_id:
            raise ValueError("VYRO_FIREBASE_PROJECT_ID is required when VYRO_AUTH_MODE=firebase")
        return self


@cache
def get_settings() -> Settings:
    return Settings()
