"""Keyset pagination for lists ordered newest first.

A cursor is opaque to clients. It encodes the sort key of the last row on the page, so pages stay
stable when new rows arrive.
"""

import base64
import json
from datetime import datetime
from typing import Any
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import Select, tuple_
from sqlalchemy.orm import InstrumentedAttribute, Session


def encode_cursor(at: datetime, row_id: UUID) -> str:
    raw = json.dumps([at.isoformat(), str(row_id)]).encode()
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def decode_cursor(cursor: str) -> tuple[datetime, UUID]:
    try:
        raw = base64.urlsafe_b64decode(cursor + "=" * (-len(cursor) % 4))
        at, row_id = json.loads(raw)
        return datetime.fromisoformat(at), UUID(row_id)
    except (ValueError, TypeError) as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid cursor") from exc


def page[T](
    db: Session,
    stmt: Select[tuple[T]],
    at: InstrumentedAttribute[datetime],
    row_id: InstrumentedAttribute[Any],
    cursor: str | None,
    limit: int,
) -> tuple[list[T], str | None]:
    """Run `stmt` newest first by (`at`, `row_id`) and return one page and the next cursor."""
    if cursor:
        stmt = stmt.where(tuple_(at, row_id) < tuple_(*decode_cursor(cursor)))
    rows = list(db.scalars(stmt.order_by(at.desc(), row_id.desc()).limit(limit + 1)))
    if len(rows) <= limit:
        return rows, None
    last = rows[limit - 1]
    return rows[:limit], encode_cursor(getattr(last, at.key), getattr(last, row_id.key))
