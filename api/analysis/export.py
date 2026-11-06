"""Export the study data as pseudonymized CSV files.

    python -m analysis.export --out study-data               # consented users only
    python -m analysis.export --out pilot-test --all-users   # testing: everyone

Only users who gave research consent are included. User ids are replaced with pseudonyms
(an HMAC with a salt that is never written down, so they can't be reversed), and everything
users wrote or photographed is left out: names, titles, goals, captions, photos and AI reasons.
Pass the same --salt to two exports to make their pseudonyms match.
"""

import argparse
import csv
import hashlib
import hmac
import json
import secrets
from collections.abc import Iterable, Sequence
from datetime import UTC, datetime
from enum import Enum
from pathlib import Path
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_sessionmaker
from app.models import (
    AiGeneration,
    Challenge,
    ChallengeTask,
    Event,
    Participation,
    Proof,
    ProofLabel,
    User,
)


class Pseudonyms:
    def __init__(self, salt: bytes) -> None:
        self._salt = salt

    def __call__(self, user_id: UUID | None) -> str:
        if user_id is None:
            return ""
        digest = hmac.new(self._salt, str(user_id).encode(), hashlib.sha256).hexdigest()
        return f"u_{digest[:12]}"


def _cell(value: Any) -> Any:
    if value is None:
        return ""
    if isinstance(value, datetime):
        return value.astimezone(UTC).isoformat()
    if isinstance(value, Enum):
        return value.value
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, dict | list):
        return json.dumps(value, sort_keys=True)
    return value


def _write(path: Path, header: Sequence[str], rows: Iterable[Sequence[Any]]) -> int:
    count = 0
    with path.open("w", newline="", encoding="utf-8") as file:
        writer = csv.writer(file)
        writer.writerow(header)
        for row in rows:
            writer.writerow([_cell(value) for value in row])
            count += 1
    return count


def export(
    db: Session, out: Path, *, salt: bytes, all_users: bool, now: datetime
) -> dict[str, int]:
    out.mkdir(parents=True, exist_ok=True)
    pseudo = Pseudonyms(salt)
    users_stmt = select(User).order_by(User.created_at)
    if not all_users:
        users_stmt = users_stmt.where(User.research_consent_at.is_not(None))
    users = list(db.scalars(users_stmt))
    ids = [u.id for u in users]
    counts = {}

    counts["users"] = _write(
        out / "users.csv",
        [
            "user",
            "study_group",
            "price_variant",
            "joined_at",
            "level",
            "xp",
            "longest_streak",
            "has_plus",
        ],
        (
            [
                pseudo(u.id),
                u.study_group,
                u.price_variant,
                u.created_at,
                u.level,
                u.xp,
                u.longest_streak,
                u.plus_until is not None,
            ]
            for u in users
        ),
    )
    included = set(ids)
    counts["challenges"] = _write(
        out / "challenges.csv",
        [
            "challenge_id",
            "category",
            "difficulty",
            "duration_days",
            "source",
            "visibility",
            "is_premium",
            "creator",
            "created_at",
        ],
        (
            [
                c.id,
                c.category,
                c.difficulty,
                c.duration_days,
                c.source,
                c.visibility,
                c.is_premium,
                pseudo(c.creator_id) if c.creator_id in included else "",
                c.created_at,
            ]
            for c in db.scalars(select(Challenge).order_by(Challenge.created_at))
        ),
    )
    counts["participations"] = _write(
        out / "participations.csv",
        [
            "participation_id",
            "user",
            "challenge_id",
            "status",
            "completed_tasks",
            "xp_earned",
            "target_difficulty_at_join",
            "recommendation_id",
            "joined_at",
            "last_progress_at",
            "ended_at",
        ],
        (
            [
                p.id,
                pseudo(p.user_id),
                p.challenge_id,
                p.status,
                p.completed_tasks,
                p.xp_earned,
                p.target_difficulty_at_join,
                p.recommendation_id,
                p.joined_at,
                p.last_progress_at,
                p.ended_at,
            ]
            for p in db.scalars(
                select(Participation)
                .where(Participation.user_id.in_(ids))
                .order_by(Participation.joined_at)
            )
        ),
    )
    proofs = db.execute(
        select(Proof, ChallengeTask.day_number)
        .join(ChallengeTask, ChallengeTask.id == Proof.task_id)
        .where(Proof.user_id.in_(ids))
        .order_by(Proof.submitted_at)
    ).all()
    counts["proofs"] = _write(
        out / "proofs.csv",
        [
            "proof_id",
            "user",
            "participation_id",
            "day_number",
            "status",
            "ai_verdict",
            "ai_confidence",
            "ai_model",
            "ai_latency_ms",
            "disputed",
            "submitted_at",
            "verified_at",
        ],
        (
            [
                p.id,
                pseudo(p.user_id),
                p.participation_id,
                day,
                p.status,
                p.ai_verdict,
                p.ai_confidence,
                p.ai_model,
                p.ai_latency_ms,
                p.disputed_at is not None,
                p.submitted_at,
                p.verified_at,
            ]
            for p, day in proofs
        ),
    )
    counts["proof_labels"] = _write(
        out / "proof_labels.csv",
        ["proof_id", "rater", "is_valid"],
        (
            [label.proof_id, label.rater, label.is_valid]
            for label in db.scalars(
                select(ProofLabel)
                .where(ProofLabel.proof_id.in_([p.id for p, _ in proofs]))
                .order_by(ProofLabel.proof_id, ProofLabel.rater)
            )
        ),
    )
    counts["ai_generations"] = _write(
        out / "ai_generations.csv",
        [
            "generation_id",
            "user",
            "model",
            "schema_valid",
            "failed",
            "category",
            "difficulty",
            "duration_days",
            "had_goal",
            "latency_ms",
            "input_tokens",
            "output_tokens",
            "rating",
            "published",
            "edited_before_publish",
            "created_at",
        ],
        (
            [
                g.id,
                pseudo(g.user_id),
                g.model,
                g.schema_valid,
                g.output is None,
                g.request.get("category"),
                g.request.get("resolved_difficulty", g.request.get("difficulty")),
                g.request.get("duration_days"),
                bool(g.request.get("goal")),
                g.latency_ms,
                g.input_tokens,
                g.output_tokens,
                g.rating,
                g.published_at is not None,
                g.edited_before_publish,
                g.created_at,
            ]
            for g in db.scalars(
                select(AiGeneration)
                .where(AiGeneration.user_id.in_(ids))
                .order_by(AiGeneration.created_at)
            )
        ),
    )
    counts["events"] = _write(
        out / "events.csv",
        ["event_id", "user", "name", "source", "properties", "client_ts", "created_at"],
        (
            [e.id, pseudo(e.user_id), e.name, e.source, e.properties, e.client_ts, e.created_at]
            for e in db.scalars(
                select(Event).where(Event.user_id.in_(ids)).order_by(Event.created_at, Event.id)
            )
        ),
    )
    meta = {"exported_at": now.isoformat(), "all_users": all_users, "rows": counts}
    (out / "meta.json").write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")
    return counts


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--out", type=Path, required=True, help="Folder for the CSV files")
    parser.add_argument(
        "--all-users", action="store_true", help="Include users without research consent"
    )
    parser.add_argument("--salt", help="Pseudonym salt, to match another export's pseudonyms")
    args = parser.parse_args()
    salt = args.salt.encode() if args.salt else secrets.token_bytes(32)
    with get_sessionmaker()() as db:
        counts = export(db, args.out, salt=salt, all_users=args.all_users, now=datetime.now(UTC))
    for table, rows in counts.items():
        print(f"{table:16} {rows:6} rows")
    if not args.all_users and counts["users"] == 0:
        print("No users have given research consent yet. Use --all-users for test exports.")


if __name__ == "__main__":
    main()
