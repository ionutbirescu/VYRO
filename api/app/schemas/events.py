from datetime import datetime
from typing import Annotated, Any

from pydantic import Field, StringConstraints

from app.schemas.common import Count, Schema

EventName = Annotated[
    str,
    StringConstraints(pattern=r"^[a-z][a-z0-9_]{1,63}$"),
    Field(examples=["challenge_viewed"]),
]


class ClientEvent(Schema):
    name: EventName
    properties: dict[str, Any] = Field(default_factory=dict)
    client_ts: datetime | None = Field(default=None, description="When it happened on the device")


class EventBatch(Schema):
    events: list[ClientEvent] = Field(min_length=1, max_length=100)


class EventBatchAccepted(Schema):
    accepted: Count
