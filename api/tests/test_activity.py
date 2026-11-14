from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.enums import ParticipationStatus, ProofStatus, Visibility
from app.models import Challenge, Participation, Proof, User
from tests.conftest import auth, make_challenge, make_user

START = datetime(2026, 11, 2, 18, tzinfo=UTC)


def join(db: Session, user: User, challenge: Challenge, **fields: Any) -> Participation:
    participation = Participation(user_id=user.id, challenge_id=challenge.id, **fields)
    db.add(participation)
    db.flush()
    return participation


def prove(
    db: Session,
    participation: Participation,
    day: int,
    *,
    hours: int = 0,
    status: ProofStatus = ProofStatus.APPROVED,
    caption: str | None = "Done!",
) -> Proof:
    challenge = db.get(Challenge, participation.challenge_id)
    assert challenge is not None
    at = START + timedelta(hours=hours)
    proof = Proof(
        participation_id=participation.id,
        task_id=challenge.tasks[day - 1].id,
        user_id=participation.user_id,
        image_path=f"proofs/{participation.user_id}/{day}.jpg",
        caption=caption,
        status=status,
        submitted_at=at,
        verified_at=at if status is ProofStatus.APPROVED else None,
    )
    db.add(proof)
    db.flush()
    return proof


def activity(client: TestClient, challenge_id: UUID, **params: Any) -> dict[str, Any]:
    response = client.get(f"/v1/challenges/{challenge_id}/activity", headers=auth(), params=params)
    assert response.status_code == 200, response.text
    return response.json()


def test_lists_approved_proofs_newest_first(db_client: TestClient, db: Session, user: User) -> None:
    challenge = make_challenge(db)
    maria, radu = make_user(db, "maria"), make_user(db, "radu")
    marias, radus = join(db, maria, challenge), join(db, radu, challenge)
    prove(db, marias, 1, hours=0)
    prove(db, radus, 1, hours=1, caption="Hard one")
    prove(db, marias, 2, hours=24)
    prove(db, radus, 2, hours=25, status=ProofStatus.REJECTED)
    prove(db, radus, 2, hours=26, status=ProofStatus.PENDING)
    join(db, user, challenge, status=ParticipationStatus.ABANDONED)

    page = activity(db_client, challenge.id)

    assert page["can_view_proofs"] is True
    assert [(i["user"]["username"], i["day_number"]) for i in page["items"]] == [
        ("maria", 2),
        ("radu", 1),
        ("maria", 1),
    ]
    radus_day_1 = page["items"][1]
    assert (radus_day_1["task_title"], radus_day_1["caption"]) == ("Day 1", "Hard one")
    assert radus_day_1["image_url"].endswith(f"proofs/{radu.id}/1.jpg")


def test_photos_and_captions_need_joining(db_client: TestClient, db: Session, user: User) -> None:
    challenge = make_challenge(db)
    prove(db, join(db, make_user(db, "maria"), challenge), 1)

    page = activity(db_client, challenge.id)

    assert page["can_view_proofs"] is False
    [item] = page["items"]
    assert (item["user"]["username"], item["day_number"]) == ("maria", 1)
    assert (item["image_url"], item["caption"]) == (None, None)


def test_pages(db_client: TestClient, db: Session, user: User) -> None:
    challenge = make_challenge(db)
    marias = join(db, make_user(db, "maria"), challenge)
    for day in range(1, 6):
        prove(db, marias, day, hours=24 * day)

    first = activity(db_client, challenge.id, limit=3)
    second = activity(db_client, challenge.id, limit=3, cursor=first["next_cursor"])

    assert [i["day_number"] for i in first["items"]] == [5, 4, 3]
    assert [i["day_number"] for i in second["items"]] == [2, 1]
    assert second["next_cursor"] is None


def test_hidden_challenges_are_not_found(db_client: TestClient, db: Session, user: User) -> None:
    challenge = make_challenge(db, creator=make_user(db, "stranger"), visibility=Visibility.FRIENDS)
    response = db_client.get(f"/v1/challenges/{challenge.id}/activity", headers=auth())
    assert response.status_code == 404
