import os
from collections.abc import Iterator
from pathlib import Path

# Settings are cached on first use, so configure them before importing the app.
os.environ.setdefault("VYRO_ENV", "test")
os.environ.setdefault("VYRO_AUTH_MODE", "dev")
os.environ.setdefault(
    "VYRO_DATABASE_URL", "postgresql+psycopg://vyro:vyro@localhost:5432/vyro_test"
)

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import Connection, text
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from app.db import get_db, get_engine
from app.enums import PriceVariant, StudyGroup
from app.main import create_app
from app.models import User

API_DIR = Path(__file__).resolve().parents[1]


@pytest.fixture(scope="session")
def migrated_db() -> None:
    """Migrate the test database to head, or skip DB tests if Postgres isn't running."""
    try:
        with get_engine().connect() as conn:
            conn.execute(text("SELECT 1"))
    except OperationalError:
        pytest.skip("Postgres is not reachable; run `docker compose up -d db`")
    command.upgrade(Config(str(API_DIR / "alembic.ini")), "head")


@pytest.fixture
def connection(migrated_db: None) -> Iterator[Connection]:
    # Each test runs in a transaction that is rolled back, so tests never see each other's rows.
    with get_engine().connect() as conn:
        transaction = conn.begin()
        yield conn
        transaction.rollback()


@pytest.fixture
def db(connection: Connection) -> Iterator[Session]:
    with Session(bind=connection, join_transaction_mode="create_savepoint") as session:
        yield session


@pytest.fixture
def client() -> Iterator[TestClient]:
    """A client for endpoints that don't touch the database."""
    with TestClient(create_app()) as test_client:
        yield test_client


@pytest.fixture
def db_client(db: Session) -> Iterator[TestClient]:
    app = create_app()
    app.dependency_overrides[get_db] = lambda: db
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def user(db: Session) -> User:
    user = User(
        firebase_uid="test-user",
        username="tester",
        display_name="Test User",
        study_group=StudyGroup.TREATMENT,
        price_variant=PriceVariant.A,
    )
    db.add(user)
    db.flush()
    return user


def auth(uid: str = "test-user") -> dict[str, str]:
    return {"Authorization": f"Bearer dev:{uid}"}
