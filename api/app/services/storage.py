"""Where proof photos live. Clients upload and view them through short-lived URLs.

In production that is a Cloud Storage bucket with signed URLs. Without a bucket (local
development and tests), photos are saved under api/.uploads and served by the API itself at
/dev/uploads, so the whole proof flow works from Expo Go against a local API.
"""

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from functools import cache
from pathlib import Path
from typing import Annotated, Protocol

import google.auth
from fastapi import Depends, HTTPException, Request, status
from google.auth.transport.requests import Request as AuthRequest
from google.cloud import storage

from app.config import get_settings

MAX_UPLOAD_BYTES = 10 * 1024 * 1024
UPLOAD_TTL = timedelta(minutes=15)
VIEW_TTL = timedelta(hours=1)
LOCAL_ROOT = Path(__file__).resolve().parents[2] / ".uploads"


@dataclass(frozen=True)
class UploadTarget:
    url: str
    headers: dict[str, str]
    expires_at: datetime


class ProofStorage(Protocol):
    def upload_target(self, object_path: str, content_type: str) -> UploadTarget: ...

    def view_url(self, object_path: str) -> str: ...

    def exists(self, object_path: str) -> bool: ...


class CloudStorage:
    def __init__(self, bucket: str) -> None:
        self._bucket = storage.Client().bucket(bucket)
        self._credentials, _ = google.auth.default()

    def _signer(self) -> dict[str, str]:
        # Cloud Run has no private key to sign with. Given the account and an access token, the
        # library signs through the IAM API instead (the account has Token Creator on itself).
        if not self._credentials.valid:
            self._credentials.refresh(AuthRequest())
        return {
            "service_account_email": self._credentials.service_account_email,
            "access_token": self._credentials.token,
        }

    def upload_target(self, object_path: str, content_type: str) -> UploadTarget:
        headers = {
            "Content-Type": content_type,
            "x-goog-content-length-range": f"0,{MAX_UPLOAD_BYTES}",
        }
        url = self._bucket.blob(object_path).generate_signed_url(
            version="v4",
            expiration=UPLOAD_TTL,
            method="PUT",
            content_type=content_type,
            headers=headers,
            **self._signer(),
        )
        return UploadTarget(url, headers, datetime.now(UTC) + UPLOAD_TTL)

    def view_url(self, object_path: str) -> str:
        return self._bucket.blob(object_path).generate_signed_url(
            version="v4", expiration=VIEW_TTL, method="GET", **self._signer()
        )

    def exists(self, object_path: str) -> bool:
        return self._bucket.blob(object_path).exists()


class LocalStorage:
    def __init__(self, root: Path, base_url: str) -> None:
        self.root = root
        self._base_url = f"{base_url.rstrip('/')}/dev/uploads"

    def path(self, object_path: str) -> Path:
        path = (self.root / object_path).resolve()
        if not path.is_relative_to(self.root.resolve()):
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")
        return path

    def save(self, object_path: str, data: bytes) -> None:
        path = self.path(object_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)

    def upload_target(self, object_path: str, content_type: str) -> UploadTarget:
        return UploadTarget(
            f"{self._base_url}/{object_path}",
            {"Content-Type": content_type},
            datetime.now(UTC) + UPLOAD_TTL,
        )

    def view_url(self, object_path: str) -> str:
        return f"{self._base_url}/{object_path}"

    def exists(self, object_path: str) -> bool:
        return self.path(object_path).is_file()


@cache
def _cloud_storage(bucket: str) -> CloudStorage:
    return CloudStorage(bucket)


def get_local_storage(request: Request) -> LocalStorage:
    # The request's own host, so a phone on the LAN gets URLs it can reach.
    return LocalStorage(LOCAL_ROOT, str(request.base_url))


def get_storage(
    local: Annotated[LocalStorage, Depends(get_local_storage)],
) -> ProofStorage:
    bucket = get_settings().proof_bucket
    return _cloud_storage(bucket) if bucket else local


Storage = Annotated[ProofStorage, Depends(get_storage)]
