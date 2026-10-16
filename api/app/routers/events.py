from fastapi import APIRouter, status

from app.auth import CurrentUser
from app.db import DbSession
from app.enums import EventSource
from app.models import Event
from app.schemas.events import EventBatch, EventBatchAccepted

router = APIRouter(tags=["events"])


@router.post("/events", status_code=status.HTTP_202_ACCEPTED)
def ingest_events(body: EventBatch, user: CurrentUser, db: DbSession) -> EventBatchAccepted:
    """Record client-side analytics events (screen views, taps) for the study metrics."""
    db.add_all(
        Event(
            user_id=user.id,
            name=event.name,
            source=EventSource.CLIENT,
            properties=event.properties,
            client_ts=event.client_ts,
        )
        for event in body.events
    )
    db.commit()
    return EventBatchAccepted(accepted=len(body.events))
