from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.enums import Category, ParticipationStatus, Visibility
from app.models import AiGeneration, Follow, Participation, User, UserAchievement
from app.schemas.challenges import ChallengeDraft
from tests.conftest import auth, make_challenge, make_user


def _titles(client: TestClient, **params: Any) -> list[str]:
    response = client.get("/v1/challenges", headers=auth(), params=params)
    assert response.status_code == 200, response.text
    return sorted(c["title"] for c in response.json()["items"])


def _draft(**overrides: Any) -> dict[str, Any]:
    return {
        "title": "Cold showers",
        "description": "End every shower cold.",
        "category": "fitness",
        "difficulty": 4,
        "duration_days": 7,
        "tasks": [
            {
                "day_number": day,
                "title": f"Day {day}",
                "instructions": "30 seconds of cold water.",
                "proof_hint": "The shower dial on cold",
            }
            for day in (3, 1, 2, 4, 5, 6, 7)
        ],
        **overrides,
    }


def test_browse_shows_only_what_the_user_may_see(
    db_client: TestClient, db: Session, user: User
) -> None:
    friend = make_user(db, "friend")
    idol = make_user(db, "idol")
    db.add_all(
        [
            Follow(follower_id=user.id, followee_id=friend.id),
            Follow(follower_id=friend.id, followee_id=user.id),
            # Followed but not following back, so not a friend.
            Follow(follower_id=user.id, followee_id=idol.id),
        ]
    )
    make_challenge(db, title="Public")
    make_challenge(db, creator=friend, title="Friend's", visibility=Visibility.FRIENDS)
    make_challenge(db, creator=idol, title="Idol's", visibility=Visibility.FRIENDS)
    make_challenge(db, creator=friend, title="Friend's private", visibility=Visibility.PRIVATE)
    make_challenge(db, creator=user, title="Mine", visibility=Visibility.PRIVATE)
    joined = make_challenge(db, creator=idol, title="Joined", visibility=Visibility.PRIVATE)
    db.add(Participation(user_id=user.id, challenge_id=joined.id))
    db.flush()

    assert _titles(db_client) == ["Friend's", "Joined", "Mine", "Public"]


def test_browse_filters_and_search(db_client: TestClient, db: Session, user: User) -> None:
    make_challenge(db, title="Morning run", category=Category.FITNESS, difficulty=3)
    make_challenge(db, title="Evening RUN", category=Category.OUTDOORS, difficulty=1)
    make_challenge(db, title="Read 100% of a book", category=Category.READING, duration_days=14)

    assert _titles(db_client, category="fitness") == ["Morning run"]
    assert _titles(db_client, difficulty=1) == ["Evening RUN"]
    assert _titles(db_client, duration_days=14) == ["Read 100% of a book"]
    assert _titles(db_client, q=" run ") == ["Evening RUN", "Morning run"]
    assert _titles(db_client, q="%") == ["Read 100% of a book"]


def test_browse_pages_newest_first(db_client: TestClient, db: Session, user: User) -> None:
    start = datetime(2026, 11, 1, tzinfo=UTC)
    for hour in range(5):
        make_challenge(db, title=f"C{hour}").created_at = start + timedelta(hours=hour)
    db.flush()

    seen: list[str] = []
    params: dict[str, Any] = {"limit": 2}
    while True:
        body = db_client.get("/v1/challenges", headers=auth(), params=params).json()
        seen += [c["title"] for c in body["items"]]
        if not body["next_cursor"]:
            break
        params["cursor"] = body["next_cursor"]

    assert seen == ["C4", "C3", "C2", "C1", "C0"]


def test_bad_cursor_is_400(db_client: TestClient, user: User) -> None:
    response = db_client.get("/v1/challenges", headers=auth(), params={"cursor": "nope"})
    assert response.status_code == 400


def test_summary_counts_participants_and_xp(db_client: TestClient, db: Session, user: User) -> None:
    challenge = make_challenge(db, difficulty=2, duration_days=7)
    other = make_user(db, "other")
    db.add_all(
        [
            Participation(
                user_id=user.id, challenge_id=challenge.id, status=ParticipationStatus.ABANDONED
            ),
            Participation(user_id=user.id, challenge_id=challenge.id),
            Participation(user_id=other.id, challenge_id=challenge.id),
        ]
    )
    db.flush()

    [item] = db_client.get("/v1/challenges", headers=auth()).json()["items"]
    assert item["total_xp"] == 7 * 15 + 52
    assert item["participant_count"] == 2
    assert (item["source"], item["creator"]) == ("template", None)


def test_create_assigns_xp_from_difficulty(db_client: TestClient, db: Session, user: User) -> None:
    response = db_client.post("/v1/challenges", headers=auth(), json=_draft(visibility="friends"))
    assert response.status_code == 201, response.text
    body = response.json()

    assert [t["day_number"] for t in body["tasks"]] == [1, 2, 3, 4, 5, 6, 7]
    assert {t["xp"] for t in body["tasks"]} == {35}
    assert body["total_xp"] == 7 * 35 + 122
    assert (body["source"], body["visibility"]) == ("user", "friends")
    assert body["creator"]["username"] == "tester"
    assert body["my_participation"] is None
    codes = db.scalars(select(UserAchievement.code).where(UserAchievement.user_id == user.id))
    assert list(codes) == ["creator"]


def test_create_rejects_client_xp(db_client: TestClient, user: User) -> None:
    draft = _draft()
    draft["tasks"][0]["xp"] = 1000
    assert db_client.post("/v1/challenges", headers=auth(), json=draft).status_code == 422


def _generation(db: Session, user: User, output: dict[str, Any]) -> AiGeneration:
    generation = AiGeneration(
        user_id=user.id, request={}, output=output, model="test", schema_valid=True
    )
    db.add(generation)
    db.flush()
    return generation


def test_publishing_an_ai_draft_records_edits(
    db_client: TestClient, db: Session, user: User
) -> None:
    output = ChallengeDraft.model_validate(_draft()).model_dump(mode="json")
    as_generated = _generation(db, user, output)
    edited = _generation(db, user, output)

    for generation, title in [(as_generated, "Cold showers"), (edited, "Colder showers")]:
        response = db_client.post(
            "/v1/challenges",
            headers=auth(),
            json=_draft(title=title, generation_id=str(generation.id)),
        )
        assert response.status_code == 201, response.text
        assert response.json()["source"] == "ai"

    db.refresh(as_generated)
    db.refresh(edited)
    assert as_generated.published_at is not None
    assert as_generated.edited_before_publish is False
    assert edited.edited_before_publish is True

    again = _draft(generation_id=str(as_generated.id))
    assert db_client.post("/v1/challenges", headers=auth(), json=again).status_code == 409
    make_user(db, "other")
    assert db_client.post("/v1/challenges", headers=auth("other"), json=again).status_code == 404


def test_join_leave_and_rejoin(db_client: TestClient, db: Session, user: User) -> None:
    challenge = make_challenge(db, duration_days=7)
    url = f"/v1/challenges/{challenge.id}"

    detail = db_client.get(url, headers=auth()).json()
    assert [t["day_number"] for t in detail["tasks"]] == [1, 2, 3, 4, 5, 6, 7]
    assert detail["my_participation"] is None

    joined = db_client.post(f"{url}/join", headers=auth())
    assert joined.status_code == 201, joined.text
    first = joined.json()
    assert (first["status"], first["next_day_number"], first["total_tasks"]) == ("active", 1, 7)
    assert db_client.get(url, headers=auth()).json()["my_participation"]["id"] == first["id"]
    assert db_client.post(f"{url}/join", headers=auth()).status_code == 409

    left = db_client.post(f"{url}/leave", headers=auth()).json()
    assert (left["status"], left["next_day_number"]) == ("abandoned", None)
    assert left["ended_at"] is not None
    assert db_client.post(f"{url}/leave", headers=auth()).status_code == 404

    second = db_client.post(f"{url}/join", headers=auth()).json()
    assert second["id"] != first["id"]
    assert db_client.get(url, headers=auth()).json()["my_participation"]["id"] == second["id"]


def test_join_records_the_recommendation(db_client: TestClient, db: Session, user: User) -> None:
    challenge = make_challenge(db)
    recommendation_id = uuid4()
    response = db_client.post(
        f"/v1/challenges/{challenge.id}/join",
        headers=auth(),
        json={"recommendation_id": str(recommendation_id)},
    )
    assert response.status_code == 201
    participation = db.scalar(select(Participation).where(Participation.user_id == user.id))
    assert participation is not None
    assert participation.recommendation_id == recommendation_id


def test_hidden_challenges_are_404(db_client: TestClient, db: Session, user: User) -> None:
    stranger = make_user(db, "stranger")
    hidden = make_challenge(db, creator=stranger, visibility=Visibility.PRIVATE)
    for challenge_id in (hidden.id, uuid4()):
        url = f"/v1/challenges/{challenge_id}"
        assert db_client.get(url, headers=auth()).status_code == 404
        assert db_client.post(f"{url}/join", headers=auth()).status_code == 404


def test_my_participations(db_client: TestClient, db: Session, user: User) -> None:
    kept = make_challenge(db, title="Kept")
    dropped = make_challenge(db, title="Dropped")
    for challenge in (kept, dropped):
        db_client.post(f"/v1/challenges/{challenge.id}/join", headers=auth())
    db_client.post(f"/v1/challenges/{dropped.id}/leave", headers=auth())

    everything = db_client.get("/v1/me/participations", headers=auth()).json()["items"]
    assert sorted(p["challenge"]["title"] for p in everything) == ["Dropped", "Kept"]

    active = db_client.get(
        "/v1/me/participations", headers=auth(), params={"status": "active"}
    ).json()["items"]
    assert [(p["challenge"]["title"], p["status"]) for p in active] == [("Kept", "active")]
    assert active[0]["challenge"]["participant_count"] == 1
