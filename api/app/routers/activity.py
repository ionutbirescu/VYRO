"""What participants did in a challenge: their approved proofs, newest first.

Anyone who can see a challenge sees who completed which day. Photos and captions are only for
users who joined it (in any state, so finishing or leaving keeps access).
"""

from uuid import UUID

from fastapi import APIRouter
from sqlalchemy import exists, select, tuple_
from sqlalchemy.orm import Session

from app.auth import CurrentUser
from app.db import DbSession
from app.enums import ProofStatus
from app.models import ChallengeTask, Participation, Proof, User
from app.pagination import decode_cursor, encode_cursor
from app.schemas.activity import ActivityItem, ActivityPage
from app.schemas.common import Limit
from app.schemas.users import UserSummary
from app.services.challenges import get_visible
from app.services.storage import Storage

router = APIRouter(tags=["activity"])


def joined(db: Session, user_id: UUID, challenge_id: UUID) -> bool:
    return bool(
        db.scalar(
            select(
                exists().where(
                    Participation.user_id == user_id,
                    Participation.challenge_id == challenge_id,
                )
            )
        )
    )


@router.get("/challenges/{challenge_id}/activity")
def get_challenge_activity(
    challenge_id: UUID,
    user: CurrentUser,
    db: DbSession,
    storage: Storage,
    cursor: str | None = None,
    limit: Limit = 20,
) -> ActivityPage:
    """Approved proofs in this challenge, newest first."""
    get_visible(db, user, challenge_id)
    can_view = joined(db, user.id, challenge_id)

    stmt = (
        select(Proof, User, ChallengeTask)
        .join(Participation, Proof.participation_id == Participation.id)
        .join(User, Proof.user_id == User.id)
        .join(ChallengeTask, Proof.task_id == ChallengeTask.id)
        .where(Participation.challenge_id == challenge_id, Proof.status == ProofStatus.APPROVED)
    )
    if cursor:
        stmt = stmt.where(tuple_(Proof.submitted_at, Proof.id) < tuple_(*decode_cursor(cursor)))
    rows = db.execute(
        stmt.order_by(Proof.submitted_at.desc(), Proof.id.desc()).limit(limit + 1)
    ).all()

    next_cursor = None
    if len(rows) > limit:
        rows = rows[:limit]
        last = rows[-1].Proof
        next_cursor = encode_cursor(last.submitted_at, last.id)
    return ActivityPage(
        items=[
            ActivityItem(
                proof_id=proof.id,
                user=UserSummary.model_validate(author),
                day_number=task.day_number,
                task_title=task.title,
                completed_at=proof.verified_at or proof.submitted_at,
                image_url=storage.view_url(proof.image_path) if can_view else None,
                caption=proof.caption if can_view else None,
            )
            for proof, author, task in rows
        ],
        can_view_proofs=can_view,
        next_cursor=next_cursor,
    )
