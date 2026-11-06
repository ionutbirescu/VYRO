import os
from collections.abc import Iterator
from pathlib import Path

# Settings are cached on first use, so configure them before importing the app.
os.environ.setdefault("VYRO_ENV", "test")
os.environ.setdefault("VYRO_AUTH_MODE", "dev")
# connect_timeout: if Docker is down, skip the DB tests in seconds instead of hanging.
os.environ.setdefault(
    "VYRO_DATABASE_URL",
    "postgresql+psycopg://vyro:vyro@localhost:5432/vyro_test?connect_timeout=5",
)
# Never call Vertex AI from tests, even if api/.env sets a project; tests fake the model.
os.environ["VYRO_AI_PROJECT"] = ""

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import Connection, text
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from app.db import get_db, get_engine
from app.enums import Category, ChallengeSource, PriceVariant, StudyGroup, Visibility
from app.main import create_app
from app.models import Challenge, ChallengeTask, User
from app.services import progress
from app.services.storage import LocalStorage, get_local_storage

API_DIR = Path(__file__).resolve().parents[1]
# TestClient's default host.
BASE_URL = "http://testserver"


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
def db_client(db: Session, tmp_path: Path) -> Iterator[TestClient]:
    app = create_app()
    app.dependency_overrides[get_db] = lambda: db
    # Proof photos go to a temporary folder instead of api/.uploads.
    app.dependency_overrides[get_local_storage] = lambda: LocalStorage(tmp_path, BASE_URL)
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def user(db: Session) -> User:
    return make_user(db, "test-user", username="tester")


def auth(uid: str = "test-user") -> dict[str, str]:
    return {"Authorization": f"Bearer dev:{uid}"}


def make_user(db: Session, uid: str, username: str | None = None, **fields: object) -> User:
    user = User(
        firebase_uid=uid,
        username=username or uid.replace("-", "_"),
        display_name=uid.title(),
        **{"study_group": StudyGroup.TREATMENT, "price_variant": PriceVariant.A, **fields},
    )
    db.add(user)
    db.flush()
    return user


def make_challenge(
    db: Session,
    *,
    creator: User | None = None,
    title: str = "Daily pushups",
    category: Category = Category.FITNESS,
    difficulty: int = 2,
    duration_days: int = 7,
    visibility: Visibility = Visibility.PUBLIC,
) -> Challenge:
    challenge = Challenge(
        title=title,
        description="Do pushups every day.",
        category=category,
        difficulty=difficulty,
        duration_days=duration_days,
        completion_xp=progress.completion_xp(difficulty, duration_days),
        source=ChallengeSource.USER if creator else ChallengeSource.TEMPLATE,
        visibility=visibility,
        creator_id=creator.id if creator else None,
        tasks=[
            ChallengeTask(
                day_number=day,
                title=f"Day {day}",
                instructions="Do 20 pushups.",
                proof_hint="You mid-pushup",
                xp=progress.task_xp(difficulty),
            )
            for day in range(1, duration_days + 1)
        ],
    )
    db.add(challenge)
    db.flush()
    return challenge
