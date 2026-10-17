from fastapi import APIRouter, status

from app.auth import CurrentUser
from app.db import DbSession
from app.errors import not_implemented
from app.schemas.moderation import ReportCreate, ReportCreated

router = APIRouter(tags=["moderation"])


@router.post("/reports", status_code=status.HTTP_201_CREATED)
def create_report(body: ReportCreate, user: CurrentUser, db: DbSession) -> ReportCreated:
    not_implemented()
