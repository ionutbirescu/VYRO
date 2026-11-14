from datetime import UTC, date, datetime, timedelta

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.enums import ParticipationStatus
from app.models import Follow, Participation, User
from tests.conftest import auth, make_challenge, make_user


def test_me(db_client: TestClient, db: Session, user: User) -> None:
    fan, friend = make_user(db, "fan"), make_user(db, "friend")
    db.add_all(
        [
            Follow(follower_id=fan.id, followee_id=user.id),
            Follow(follower_id=friend.id, followee_id=user.id),
            Follow(follower_id=user.id, followee_id=friend.id),
            Participation(
                user_id=user.id,
                challenge_id=make_challenge(db).id,
                status=ParticipationStatus.COMPLETED,
            ),
        ]
    )
    user.xp, user.level, user.current_streak, user.longest_streak = 150, 2, 3, 5
    user.last_active_on = datetime.now(UTC).date()
    user.plus_until = datetime.now(UTC) + timedelta(days=3)
    db.flush()

    response = db_client.get("/v1/me", headers=auth())

    assert response.status_code == 200, response.text
    me = response.json()
    assert (me["username"], me["xp"], me["level"], me["next_level_xp"]) == ("tester", 150, 2, 300)
    assert (me["current_streak"], me["longest_streak"]) == (3, 5)
    assert (me["followers_count"], me["following_count"], me["completed_challenges"]) == (2, 1, 1)
    assert (me["is_plus"], me["suggested_difficulty"], me["timezone"]) == (True, 2, "UTC")


def test_me_shows_a_lapsed_streak_as_zero(db_client: TestClient, db: Session, user: User) -> None:
    user.current_streak, user.last_active_on = 4, date(2026, 1, 1)
    db.flush()

    me = db_client.get("/v1/me", headers=auth()).json()

    assert (me["current_streak"], me["is_plus"]) == (0, False)


def test_unregistered_users_must_register(db_client: TestClient) -> None:
    response = db_client.get("/v1/me", headers=auth("newcomer"))
    assert (response.status_code, response.json()["detail"]) == (403, "registration_required")


def test_search_finds_others_by_username_or_name(db_client: TestClient, db: Session) -> None:
    for uid, username, name in [
        ("test-user", "tester", "Ana Tester"),
        ("maria", "maria_p", "Maria Popescu"),
        ("mario", "mario", "Mario Rossi"),
        ("radu", "radu", "Radu Pop"),
    ]:
        make_user(db, uid, username).display_name = name
    db.flush()

    def search(q: str) -> list[str]:
        response = db_client.get("/v1/users", headers=auth(), params={"q": q})
        assert response.status_code == 200, response.text
        return sorted(u["username"] for u in response.json()["items"])

    assert search("mar") == ["maria_p", "mario"]
    assert search("@MARIA") == ["maria_p"]
    assert search("pop") == ["maria_p", "radu"]  # part of a display name
    assert search("tester") == []  # never yourself
    assert search("maria_") == ["maria_p"]
    assert search("mari_") == []  # a literal underscore, not a wildcard for "mario"
