from fastapi import APIRouter

from app import __version__
from app.schemas.common import HealthStatus

router = APIRouter(tags=["health"])


# Not /healthz: Cloud Run reserves some URL paths ending in "z".
@router.get("/health")
def health() -> HealthStatus:
    return HealthStatus(status="ok", version=__version__)
