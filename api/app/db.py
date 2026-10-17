from collections.abc import Iterator
from functools import cache
from typing import Annotated

from fastapi import Depends
from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.config import get_settings


@cache
def get_engine() -> Engine:
    # Cloud SQL's db-f1-micro allows ~25 connections. At most 5 per instance times Cloud Run's
    # 3 instances leaves room for the migration job and admin sessions. pool_pre_ping recovers
    # from connections dropped while an instance was idle.
    return create_engine(
        get_settings().database_url, pool_size=3, max_overflow=2, pool_pre_ping=True
    )


@cache
def get_sessionmaker() -> sessionmaker[Session]:
    return sessionmaker(get_engine(), expire_on_commit=False)


def get_db() -> Iterator[Session]:
    with get_sessionmaker()() as session:
        yield session


DbSession = Annotated[Session, Depends(get_db)]
