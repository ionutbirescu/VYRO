"""Stands in for Cloud Storage when no proof bucket is set (local development and tests).

Like a signed URL, these routes take no bearer token. They are only mounted without a bucket,
which the settings forbid in production.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import FileResponse

from app.services.storage import MAX_UPLOAD_BYTES, LocalStorage, get_local_storage

router = APIRouter(prefix="/dev/uploads", include_in_schema=False)

Local = Annotated[LocalStorage, Depends(get_local_storage)]


@router.put("/{object_path:path}", status_code=status.HTTP_204_NO_CONTENT)
async def upload(object_path: str, request: Request, storage: Local) -> None:
    data = await request.body()
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status.HTTP_413_CONTENT_TOO_LARGE, "Photo is too large")
    storage.save(object_path, data)


@router.get("/{object_path:path}")
def download(object_path: str, storage: Local) -> FileResponse:
    if not storage.exists(object_path):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")
    return FileResponse(storage.path(object_path))
