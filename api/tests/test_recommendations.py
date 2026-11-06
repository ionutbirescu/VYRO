from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.enums import Category, ParticipationStatus, StudyGroup, Visibility
from app.models import Challenge, Event, Participation, User
from app.services import recommender
from tests.conftest import auth, make_challenge, make_user


def _recommend(client: TestClient, uid: str = "test-user", **params: Any) -> dict[str, Any]:
    response = client.get("/v1/recommendations", headers=auth(uid), params=params)
    assert response.status_code == 200, response.text
    return response.json()


def _titles(body: dict[str, Any]) -> list[str]:
    return [item["challenge"]["title"] for item in body["items"]]


def _took(
    db: Session, user: User, challenge: Challenge, status: ParticipationStatus, days_ago: int = 1
) -> None:
    at = datetime.now(UTC) - timedelta(days=days_ago)
    db.add(
        Participation(
            user_id=user.id,
            challenge_id=challenge.id,
            status=status,
            joined_at=at - timedelta(days=1),
            ended_at=None if status is ParticipationStatus.ACTIVE else at,
            last_progress_at=at,
        )
    )
    db.flush()


@pytest.fixture
def no_exploration(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(recommender, "EPSILON", 0.0)


def test_only_recommends_challenges_the_user_can_join(
    db_client: TestClient, db: Session, user: User
) -> None:
    stranger = make_user(db, "stranger")
    make_challenge(db, title="Open")
    _took(db, user, make_challenge(db, title="Already joined"), ParticipationStatus.ACTIVE)
    _took(db, user, make_challenge(db, title="Already done"), ParticipationStatus.COMPLETED)
    make_challenge(db, creator=user, title="My own")
    make_challenge(db, creator=stranger, title="Hidden", visibility=Visibility.PRIVATE)
    premium = make_challenge(db, title="Premium")
    premium.is_premium = True
    db.flush()

    assert _titles(_recommend(db_client)) == ["Open"]

    user.plus_until = datetime.now(UTC) + timedelta(days=1)
    db.flush()
    assert sorted(_titles(_recommend(db_client))) == ["Open", "Premium"]


def test_treatment_favours_liked_categories_near_the_target_difficulty(
    db_client: TestClient, db: Session, user: User, no_exploration: None
) -> None:
    # Three completed fitness challenges at difficulty 2: the target steps up to 3.
    for day in range(1, 4):
        _took(
            db, user, make_challenge(db, difficulty=2), ParticipationStatus.COMPLETED, days_ago=day
        )
    make_challenge(db, title="Fitness 3", category=Category.FITNESS, difficulty=3)
    make_challenge(db, title="Fitness 5", category=Category.FITNESS, difficulty=5)
    make_challenge(db, title="Reading 3", category=Category.READING, difficulty=3)

    body = _recommend(db_client, limit=3)

    assert _titles(body) == ["Fitness 3", "Fitness 5", "Reading 3"]
    assert [item["rank"] for item in body["items"]] == [1, 2, 3]
    assert body["items"][0]["reason"] == "Because you finished 3 fitness challenges"
    assert body["items"][2]["reason"] == "Matches your level"


def test_popular_challenges_lead_for_new_users(
    db_client: TestClient, db: Session, user: User, no_exploration: None
) -> None:
    quiet = make_challenge(db, title="Quiet")
    popular = make_challenge(db, title="Popular")
    for index in range(4):
        _took(db, make_user(db, f"fan-{index}"), popular, ParticipationStatus.COMPLETED)
    assert quiet.difficulty == popular.difficulty

    body = _recommend(db_client)

    assert _titles(body) == ["Popular", "Quiet"]
    assert body["items"][0]["reason"] == "Popular with other VYRO users"


def test_exploration_brings_in_untried_categories(
    db_client: TestClient, db: Session, user: User, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(recommender, "EPSILON", 1.0)
    _took(db, user, make_challenge(db), ParticipationStatus.COMPLETED)
    for index in range(3):
        make_challenge(db, title=f"Fitness {index}")
    make_challenge(db, title="Something else", category=Category.CREATIVITY)

    body = _recommend(db_client, limit=2)

    # The first slot always exploits; the second explores the untried category.
    assert body["items"][0]["challenge"]["category"] == "fitness"
    assert (body["items"][1]["challenge"]["title"], body["items"][1]["reason"]) == (
        "Something else",
        "Something new to try",
    )


def test_control_users_get_a_random_pick_without_reasons(
    db_client: TestClient, db: Session
) -> None:
    make_user(db, "control-user", study_group=StudyGroup.CONTROL)
    for index in range(8):
        make_challenge(db, title=f"Challenge {index}")

    body = _recommend(db_client, uid="control-user")

    assert len(body["items"]) == 5
    assert len(set(_titles(body))) == 5
    assert all(item["reason"] is None for item in body["items"])


def test_each_response_is_logged_for_attribution(
    db_client: TestClient, db: Session, user: User
) -> None:
    challenge = make_challenge(db)
    body = _recommend(db_client)

    event = db.scalar(select(Event).where(Event.name == "recommendations_served"))
    assert event is not None
    assert event.properties["recommendation_id"] == body["recommendation_id"]
    assert event.properties["strategy"] == "content_epsilon_greedy"
    assert event.properties["items"][0]["challenge_id"] == str(challenge.id)
    assert event.properties["items"][0]["rank"] == 1

    joined = db_client.post(
        f"/v1/challenges/{challenge.id}/join",
        headers=auth(),
        json={"recommendation_id": body["recommendation_id"]},
    )
    assert joined.status_code == 201
    participation = db.get(Participation, joined.json()["id"])
    assert participation is not None
    assert str(participation.recommendation_id) == body["recommendation_id"]


def test_nothing_to_recommend(db_client: TestClient, user: User) -> None:
    body = _recommend(db_client)
    assert body["items"] == []
