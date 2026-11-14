from datetime import UTC, datetime
from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Challenge
from scripts import seed
from tests.conftest import auth


def test_seed_gives_the_dev_user_real_data(
    db_client: TestClient, db: Session, tmp_path: Path
) -> None:
    now = datetime.now(UTC)
    created = seed.seed(db, "dev-tester", now, photos=tmp_path)
    assert created == ["tester", "maria", "radu", "elena", "andrei", "ioana", "alice", "bob"]
    assert (tmp_path / seed.PHOTO).read_bytes().startswith(b"\x89PNG")

    me = db_client.get("/v1/me", headers=auth("dev-tester")).json()
    assert me["completed_challenges"] == 1
    assert me["current_streak"] == 4
    assert (me["followers_count"], me["following_count"]) == (4, 3)
    active = db_client.get(
        "/v1/me/participations", headers=auth("dev-tester"), params={"status": "active"}
    ).json()["items"]
    assert sorted(f"{p['completed_tasks']}/{p['total_tasks']}" for p in active) == [
        "0/7",
        "1/14",
        "4/7",
    ]
    recommendations = db_client.get("/v1/recommendations", headers=auth("dev-tester")).json()
    assert len(recommendations["items"]) == 5

    # Running it again adds nothing.
    challenges = db.scalar(select(func.count()).select_from(Challenge))
    assert seed.seed(db, "dev-tester", now, photos=tmp_path) == []
    assert db.scalar(select(func.count()).select_from(Challenge)) == challenges
