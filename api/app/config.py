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
    cors_origins: list[str] = ["http://localhost:8081", "http://localhost:8082"]

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
