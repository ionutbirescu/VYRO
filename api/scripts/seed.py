"""Fill the local database with realistic data, so the app can run against the real API.

    python scripts/seed.py                              # from api/, with the venv
    docker compose exec api python scripts/seed.py      # or inside the API container
    python scripts/seed.py --reset                      # empty the local database first

Adds a catalogue of built-in challenges (from the templates, plus the hand-written ones in
scripts/seed_challenges.py), your dev user (--uid, default dev-user, who is Alex) and seven
more, and three weeks of progress: follows, joined, completed and abandoned challenges, approved
proofs, XP, streaks and achievements. Running it again skips what's already there. It only runs
against the local Docker database.
"""

import argparse
import random
import struct
import sys
import zlib
from dataclasses import dataclass
from datetime import UTC, datetime, time, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import select, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_engine, get_sessionmaker
from app.enums import (
    AiVerdict,
    Category,
    ChallengeSource,
    ParticipationStatus,
    PriceVariant,
    StudyGroup,
    Visibility,
)
from app.models import Base, Challenge, ChallengeTask, Follow, Participation, Proof, User
from app.schemas.challenges import ChallengeDraft
from app.services import progress, templates
from app.services.storage import LOCAL_ROOT
from scripts.seed_challenges import CHALLENGES

ZONE = ZoneInfo("Europe/Bucharest")
PHOTO = "proofs/seed/placeholder.png"
# (duration_days, difficulty) of the built-in challenges in every category.
CATALOGUE = [(1, 1), (7, 2), (14, 3)]


@dataclass(frozen=True)
class Person:
    uid: str
    username: str
    name: str
    group: StudyGroup = StudyGroup.TREATMENT
    price: PriceVariant = PriceVariant.A
    bio: str | None = None


ALEX = Person("dev-user", "alex", "Alex", bio="Building good habits, one day at a time.")
OTHERS = [
    Person("dev-maria", "maria", "Maria"),
    Person("dev-radu", "radu", "Radu", StudyGroup.CONTROL),
    Person("dev-elena", "elena", "Elena"),
    Person("dev-andrei", "andrei", "Andrei", StudyGroup.CONTROL),
    Person("dev-ioana", "ioana", "Ioana"),
    Person(
        "dev-alice",
        "alice",
        "Alice",
        StudyGroup.CONTROL,
        PriceVariant.B,
        "Runner, reader, curious person.",
    ),
    Person("dev-bob", "bob", "Bob", bio="Trying to eat better and sleep more."),
]


def _check_local() -> None:
    settings = get_settings()
    url = make_url(settings.database_url)
    if (
        settings.env == "prod"
        or url.host not in {"localhost", "127.0.0.1", "db"}
        or (url.port or 5432) != 5432
    ):
        raise SystemExit(f"Refusing to seed {url.render_as_string()}: local database only")


def _png(width: int = 96, height: int = 96, rgb: tuple[int, int, int] = (99, 102, 241)) -> bytes:
    """A plain coloured PNG, so seeded proofs have a photo to show."""

    def chunk(kind: bytes, data: bytes) -> bytes:
        body = kind + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body))

    row = b"\x00" + bytes(rgb) * width
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(row * height))
        + chunk(b"IEND", b"")
    )


def _evening(days_ago: int, now: datetime) -> datetime:
    """18:00 local time, `days_ago` days before now."""
    day = now.astimezone(ZONE).date() - timedelta(days=days_ago)
    return datetime.combine(day, time(18), tzinfo=ZONE).astimezone(UTC)


def _challenge(draft: ChallengeDraft, creator: User | None, visibility: Visibility) -> Challenge:
    return Challenge(
        title=draft.title,
        description=draft.description,
        category=draft.category,
        difficulty=draft.difficulty,
        duration_days=draft.duration_days,
        completion_xp=progress.completion_xp(draft.difficulty, draft.duration_days),
        source=ChallengeSource.USER if creator else ChallengeSource.TEMPLATE,
        visibility=visibility,
        creator_id=creator.id if creator else None,
        tasks=[
            ChallengeTask(
                day_number=task.day_number,
                title=task.title,
                instructions=task.instructions,
                proof_hint=task.proof_hint,
                xp=progress.task_xp(draft.difficulty),
            )
            for task in draft.tasks
        ],
    )


def _written(defn: dict) -> Challenge:
    """A challenge from scripts/seed_challenges.py."""
    return Challenge(
        title=defn["title"],
        description=defn["description"],
        category=defn["category"],
        difficulty=defn["difficulty"],
        duration_days=defn["duration_days"],
        completion_xp=progress.completion_xp(defn["difficulty"], defn["duration_days"]),
        source=ChallengeSource.TEMPLATE,
        visibility=Visibility.PUBLIC,
        tasks=[
            ChallengeTask(
                day_number=day,
                title=title,
                instructions=instructions,
                proof_hint=proof_hint,
                xp=progress.task_xp(defn["difficulty"]),
            )
            for day, title, instructions, proof_hint in defn["tasks"]
        ],
    )


def seed_written(db: Session) -> dict[str, Challenge]:
    """The hand-written challenges, by title. Creates the missing ones."""
    titles = [defn["title"] for defn in CHALLENGES]
    existing = {
        c.title: c
        for c in db.scalars(
            select(Challenge).where(Challenge.creator_id.is_(None), Challenge.title.in_(titles))
        )
    }
    for defn in CHALLENGES:
        if defn["title"] not in existing:
            existing[defn["title"]] = _written(defn)
            db.add(existing[defn["title"]])
    db.flush()
    return existing


def seed_catalogue(db: Session) -> dict[tuple[Category, int], Challenge]:
    """The built-in challenges from the templates, by (category, duration_days). Creates them on
    the first run."""
    written = {defn["title"] for defn in CHALLENGES}
    existing = {
        (c.category, c.duration_days): c
        for c in db.scalars(select(Challenge).where(Challenge.creator_id.is_(None)))
        if c.title not in written
    }
    rng = random.Random(7)
    for category in Category:
        for duration_days, difficulty in CATALOGUE:
            if (category, duration_days) not in existing:
                draft = templates.draft(category, difficulty, duration_days, rng=rng)
                challenge = _challenge(draft, None, Visibility.PUBLIC)
                db.add(challenge)
                existing[(category, duration_days)] = challenge
    db.flush()
    return existing


def _person(db: Session, person: Person, now: datetime) -> tuple[User, bool]:
    user = db.scalar(select(User).where(User.firebase_uid == person.uid))
    if user:
        return user, False
    user = User(
        firebase_uid=person.uid,
        username=person.username,
        display_name=person.name,
        bio=person.bio,
        timezone=str(ZONE),
        study_group=person.group,
        price_variant=person.price,
        research_consent_at=now - timedelta(days=25),
        created_at=now - timedelta(days=25),
    )
    db.add(user)
    db.flush()
    return user, True


@dataclass(frozen=True)
class Attempt:
    """Join `challenge` `started` days ago and prove `done` tasks on consecutive evenings."""

    challenge: Challenge
    started: int
    done: int
    leave: bool = False


def _play(db: Session, user: User, attempts: list[Attempt], now: datetime) -> None:
    proofs = []
    for attempt in attempts:
        participation = Participation(
            user_id=user.id,
            challenge_id=attempt.challenge.id,
            challenge=attempt.challenge,
            # Two hours before that day's evening task, but never in the future.
            joined_at=min(_evening(attempt.started, now) - timedelta(hours=2), now),
            target_difficulty_at_join=2,
        )
        db.add(participation)
        db.flush()
        for day in range(attempt.done):
            proofs.append((_evening(attempt.started - day, now), participation, day + 1))
        if attempt.leave:
            # Left the morning after the last task.
            left_at = _evening(attempt.started - attempt.done, now) - timedelta(hours=8)
            proofs.append((left_at, participation, None))

    # In time order, so streaks and achievements build up as they would have.
    for at, participation, day in sorted(proofs, key=lambda item: item[0]):
        if day is None:
            participation.status = ParticipationStatus.ABANDONED
            participation.ended_at = at
            continue
        task = participation.challenge.tasks[day - 1]
        proof = Proof(
            participation_id=participation.id,
            task_id=task.id,
            user_id=user.id,
            image_path=PHOTO,
            caption="Done!",
            submitted_at=at,
            verified_at=at,
            ai_verdict=AiVerdict.PASS,
            ai_model="seed",
        )
        db.add(proof)
        progress.approve_proof(db, user, participation, task, proof, at)
    db.flush()


def seed(db: Session, uid: str, now: datetime, photos: Path = LOCAL_ROOT) -> list[str]:
    """Seed what's missing and return the usernames it created."""
    photos.joinpath(PHOTO).parent.mkdir(parents=True, exist_ok=True)
    photos.joinpath(PHOTO).write_bytes(_png())
    catalogue = seed_catalogue(db)
    written = seed_written(db)

    def pick(category: Category, days: int) -> Challenge:
        return catalogue[(category, days)]

    handle = uid.removeprefix("dev-")
    me, new_me = _person(
        db,
        ALEX
        if uid == ALEX.uid
        else Person(uid, handle.replace("-", "_"), handle.replace("-", " ").title()),
        now,
    )
    others = {}
    created = []
    for person in OTHERS:
        user, new = _person(db, person, now)
        others[person.username] = user
        if new:
            created.append(person.username)
    maria, radu, elena, andrei, ioana, alice, bob = (others[p.username] for p in OTHERS)
    if "alice" in created:
        _play(db, alice, [Attempt(written["30-Day Reading Habit"], 9, 9)], now)
    if "bob" in created:
        _play(db, bob, [Attempt(written["14-Day Clean Eating Reset"], 5, 4)], now)

    if new_me:
        # Friends are mutual follows; Andrei follows you without being followed back.
        for friend in (maria, radu, elena):
            db.add_all(
                [
                    Follow(follower_id=me.id, followee_id=friend.id),
                    Follow(follower_id=friend.id, followee_id=me.id),
                ]
            )
        db.add(Follow(follower_id=andrei.id, followee_id=me.id))
        run_club = db.scalar(select(Challenge).where(Challenge.creator_id == maria.id))
        if run_club is None:
            draft = templates.draft(Category.FITNESS, 2, 7, rng=random.Random(3)).model_copy(
                update={
                    "title": "Maria's evening run club",
                    "description": "Friends only: a short run or brisk walk every evening.",
                }
            )
            run_club = _challenge(draft, maria, Visibility.FRIENDS)
            db.add(run_club)
            db.flush()
        reading, fitness = pick(Category.READING, 7), pick(Category.FITNESS, 7)
        _play(
            db,
            me,
            [
                Attempt(fitness, started=20, done=7),
                Attempt(pick(Category.PRODUCTIVITY, 7), started=12, done=2, leave=True),
                Attempt(reading, started=4, done=4),
                Attempt(pick(Category.MINDFULNESS, 14), started=2, done=1),
                Attempt(run_club, started=1, done=0),
            ],
            now,
        )
        _play(
            db,
            maria,
            [Attempt(fitness, 21, 7), Attempt(reading, 5, 5), Attempt(run_club, 3, 3)],
            now,
        )
        _play(db, radu, [Attempt(reading, 6, 6), Attempt(fitness, 15, 3, leave=True)], now)
        _play(
            db, elena, [Attempt(pick(Category.MINDFULNESS, 14), 7, 7), Attempt(reading, 3, 1)], now
        )
        _play(db, andrei, [Attempt(pick(Category.FITNESS, 1), 9, 1), Attempt(reading, 0, 0)], now)
        _play(db, ioana, [Attempt(pick(Category.OUTDOORS, 7), 3, 2)], now)
        created.insert(0, me.username)
    db.commit()
    return created


def reset(db: Session) -> None:
    tables = ", ".join(t.name for t in Base.metadata.sorted_tables)
    db.execute(text(f"TRUNCATE {tables} RESTART IDENTITY CASCADE"))
    db.commit()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--uid", default="dev-user", help="Your EXPO_PUBLIC_DEV_UID")
    parser.add_argument("--reset", action="store_true", help="Delete all local data first")
    args = parser.parse_args()
    _check_local()
    with get_sessionmaker()() as db:
        if args.reset:
            reset(db)
        created = seed(db, args.uid, datetime.now(UTC))
        challenges = len(list(db.scalars(select(Challenge.id))))
    get_engine().dispose()
    print(f"{challenges} challenges in the catalogue")
    print(f"New users: {', '.join(created) or 'none (already seeded)'}")
    print(f"Sign in as yourself with EXPO_PUBLIC_DEV_UID={args.uid}")
    print("or as anyone else: " + ", ".join(p.uid for p in OTHERS))


if __name__ == "__main__":
    main()
