"""Server-side analytics events: what the API saw happen, for the study metrics.

Events are added to the request's session, so they are saved only if the action they describe
is committed. Client events (screen views, app opens) arrive through POST /v1/events instead.
"""

from typing import Any
from uuid import UUID

from pydantic_core import to_jsonable_python
from sqlalchemy.orm import Session

from app.enums import EventSource
from app.models import Event, User


def log(db: Session, user: User | UUID | None, name: str, **properties: Any) -> None:
    """Record `name` for `user`. Properties may hold UUIDs, enums and datetimes."""
    user_id = user.id if isinstance(user, User) else user
    db.add(
        Event(
            user_id=user_id,
            name=name,
            source=EventSource.SERVER,
            properties=to_jsonable_python(properties),
        )
    )
