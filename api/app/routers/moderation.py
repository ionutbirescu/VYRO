from fastapi import APIRouter, status

from app.auth import CurrentUser
from app.db import DbSession
from app.models import Report
from app.schemas.moderation import ReportCreate, ReportCreated

router = APIRouter(tags=["moderation"])


@router.post("/reports", status_code=status.HTTP_201_CREATED)
def create_report(body: ReportCreate, user: CurrentUser, db: DbSession) -> ReportCreated:
    report = Report(
        reporter_id=user.id,
        target_type=body.target_type,
        target_id=body.target_id,
        reason=body.reason,
    )
    db.add(report)
    db.commit()
    return ReportCreated(id=report.id)
