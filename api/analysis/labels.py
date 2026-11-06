"""Human rating of proof photos: the ground truth for RQ3.

    python -m analysis.labels export --rater rater1 --out to-rate [--limit 200]
    # Open to-rate/rater1.csv, look at each photo in to-rate/photos/, and fill in is_valid
    # with 1 (it proves the task) or 0 (it doesn't). Leave it blank to skip a proof.
    python -m analysis.labels import to-rate/rater1.csv --rater rater1

Raters see the task and the photo but not the AI verdict, so it can't anchor their judgement.
Each export skips proofs that rater already labelled and comes in random order. Use two raters
on the same proofs to report their agreement too.

The export folder holds users' photos: keep it within the study team and delete it after rating.
"""

import argparse
import csv
import random
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_sessionmaker
from app.models import ChallengeTask, Proof, ProofLabel
from app.services.storage import LOCAL_ROOT, CloudStorage, LocalStorage, ProofStorage

COLUMNS = ["proof_id", "photo", "task", "instructions", "proof_hint", "caption", "is_valid"]
YES = {"1", "y", "yes", "true"}
NO = {"0", "n", "no", "false"}


def storage() -> ProofStorage:
    bucket = get_settings().proof_bucket
    return CloudStorage(bucket) if bucket else LocalStorage(LOCAL_ROOT, "http://localhost:8000")


def export(
    db: Session,
    photos: ProofStorage,
    rater: str,
    out: Path,
    limit: int | None = None,
    rng: random.Random | None = None,
) -> int:
    """Write `out/<rater>.csv` and the photos it refers to. Returns how many proofs it holds."""
    labelled = select(ProofLabel.proof_id).where(ProofLabel.rater == rater)
    rows = list(
        db.execute(
            select(Proof, ChallengeTask)
            .join(ChallengeTask, ChallengeTask.id == Proof.task_id)
            .where(Proof.ai_verdict.is_not(None), Proof.id.not_in(labelled))
            .order_by(Proof.submitted_at, Proof.id)
        ).all()
    )
    (rng or random.Random()).shuffle(rows)
    rows = rows[:limit]
    (out / "photos").mkdir(parents=True, exist_ok=True)
    with (out / f"{rater}.csv").open("w", newline="", encoding="utf-8") as file:
        writer = csv.writer(file)
        writer.writerow(COLUMNS)
        for proof, task in rows:
            photo = Path("photos") / f"{proof.id}.{proof.image_path.rsplit('.', 1)[1]}"
            (out / photo).write_bytes(photos.read(proof.image_path))
            writer.writerow(
                [
                    proof.id,
                    photo.as_posix(),
                    task.title,
                    task.instructions,
                    task.proof_hint,
                    proof.caption or "",
                    "",
                ]
            )
    return len(rows)


def import_labels(db: Session, path: Path, rater: str) -> tuple[int, int]:
    """Save the filled-in labels; a rater's new label replaces their old one.

    Returns (saved, skipped). Raises ValueError on a value that isn't yes/no or blank.
    """
    saved = skipped = 0
    with path.open(newline="", encoding="utf-8") as file:
        for line, row in enumerate(csv.DictReader(file), start=2):
            value = row["is_valid"].strip().lower()
            if not value:
                skipped += 1
                continue
            if value not in YES | NO:
                raise ValueError(f"Line {line}: is_valid must be 1 or 0, not {row['is_valid']!r}")
            if db.get(Proof, row["proof_id"]) is None:
                raise ValueError(f"Line {line}: no proof {row['proof_id']}")
            db.merge(ProofLabel(proof_id=row["proof_id"], rater=rater, is_valid=value in YES))
            saved += 1
    db.commit()
    return saved, skipped


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    commands = parser.add_subparsers(dest="command", required=True)
    export_cmd = commands.add_parser("export", help="Write photos and a CSV for one rater")
    export_cmd.add_argument("--rater", required=True, help="A pseudonym such as rater1")
    export_cmd.add_argument("--out", type=Path, required=True)
    export_cmd.add_argument("--limit", type=int)
    import_cmd = commands.add_parser("import", help="Save a filled-in CSV")
    import_cmd.add_argument("csv", type=Path)
    import_cmd.add_argument("--rater", required=True)
    args = parser.parse_args()

    with get_sessionmaker()() as db:
        if args.command == "export":
            count = export(db, storage(), args.rater, args.out, args.limit)
            print(f"{count} proofs to rate in {args.out / (args.rater + '.csv')}")
        else:
            saved, skipped = import_labels(db, args.csv, args.rater)
            print(f"Saved {saved} labels, skipped {skipped} blank rows")


if __name__ == "__main__":
    main()
