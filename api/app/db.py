from collections.abc import Iterator
from functools import cache
from typing import Annotated

from fastapi import Depends
from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.config import get_settings


@cache
def get_engine() -> Engine:
    # Cloud Run instances are small and Cloud SQL's smallest tier caps connections, so keep the
    # pool tight. pool_pre_ping recovers from connections dropped while an instance was idle.
    return create_engine(
        get_settings().database_url, pool_size=5, max_overflow=5, pool_pre_ping=True
    )


@cache
def get_sessionmaker() -> sessionmaker[Session]:
    return sessionmaker(get_engine(), expire_on_commit=False)


def get_db() -> Iterator[Session]:
    with get_sessionmaker()() as session:
        yield session


DbSession = Annotated[Session, Depends(get_db)]
