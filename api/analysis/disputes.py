"""Human review of disputed proofs.

    python -m analysis.disputes list
    python -m analysis.disputes approve <proof_id>
    python -m analysis.disputes reject <proof_id>

Approving awards the task as if the AI had passed it, dated when the photo was submitted, so
it doesn't use up the user's task for today. That only works while the disputed task is still
the next one in an active challenge; if the user has since redone it, or left, reject instead.
"""

import argparse
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_sessionmaker
from app.enums import ParticipationStatus, ProofStatus
from app.models import ChallengeTask, Participation, Proof, User
from app.services import events, progress


def pending(db: Session) -> list[tuple[Proof, ChallengeTask]]:
    return list(
        db.execute(
            select(Proof, ChallengeTask)
            .join(ChallengeTask, ChallengeTask.id == Proof.task_id)
            .where(Proof.status == ProofStatus.DISPUTED)
            .order_by(Proof.disputed_at)
        ).all()
    )


def resolve(db: Session, proof_id: UUID, approve: bool) -> str:
    """Approve or reject a disputed proof. Raises ValueError if it can't be done."""
    proof = db.get(Proof, proof_id)
    if proof is None or proof.status is not ProofStatus.DISPUTED:
        raise ValueError("No disputed proof with that id")
    user = db.get(User, proof.user_id)
    assert user is not None
    progress.lock(db, user)
    participation = db.get(Participation, proof.participation_id)
    task = db.get(ChallengeTask, proof.task_id)
    assert participation is not None and task is not None

    if approve:
        if participation.status is not ParticipationStatus.ACTIVE:
            raise ValueError(f"The challenge is {participation.status.value}; reject instead")
        if task.day_number != participation.completed_tasks + 1:
            raise ValueError("The user has already redone this task; reject instead")
        rewards = progress.approve_proof(db, user, participation, task, proof, proof.submitted_at)
        outcome = f"Approved: {rewards.xp_awarded} XP to the user"
    else:
        proof.status = ProofStatus.REJECTED
        outcome = "Rejected"
    events.log(db, user, "proof_dispute_resolved", proof_id=proof.id, approved=approve)
    db.commit()
    return outcome


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("list", help="Show disputed proofs, oldest first")
    for name in ("approve", "reject"):
        commands.add_parser(name).add_argument("proof_id", type=UUID)
    args = parser.parse_args()

    with get_sessionmaker()() as db:
        if args.command == "list":
            disputed = pending(db)
            for proof, task in disputed:
                print(f"{proof.id}  disputed {proof.disputed_at:%Y-%m-%d %H:%M}")
                print(f"  task:    day {task.day_number}, {task.title} ({task.proof_hint})")
                print(f"  photo:   {proof.image_path}")
                print(f"  AI:      {proof.ai_verdict} {proof.ai_confidence}: {proof.ai_reason}")
                print(f"  user:    {proof.dispute_reason}")
            print(f"{len(disputed)} disputed proofs")
        else:
            try:
                print(resolve(db, args.proof_id, approve=args.command == "approve"))
            except ValueError as error:
                raise SystemExit(str(error)) from error


if __name__ == "__main__":
    main()
