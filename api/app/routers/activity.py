"""What participants did in a challenge, and comments on it.

Anyone who can see a challenge sees who completed which day. Photos, captions and comments are
only for users who joined it (in any state, so finishing or leaving keeps access).
"""

from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, HTTPException, Response, status
from sqlalchemy import exists, func, select, tuple_
from sqlalchemy.orm import Session

from app.auth import CurrentUser
from app.db import DbSession
from app.enums import ProofStatus
from app.models import ChallengeTask, Participation, Proof, ProofComment, User
from app.pagination import decode_cursor, encode_cursor, page
from app.schemas.activity import (
    ActivityItem,
    ActivityPage,
    Comment,
    CommentCreate,
    CommentPage,
)
from app.schemas.common import Limit
from app.schemas.users import UserSummary
from app.services import events
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


def _comment_counts(db: Session, proof_ids: list[UUID]) -> dict[UUID, int]:
    if not proof_ids:
        return {}
    rows = db.execute(
        select(ProofComment.proof_id, func.count())
        .where(ProofComment.proof_id.in_(proof_ids))
        .group_by(ProofComment.proof_id)
    )
    return {proof_id: count for proof_id, count in rows}


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
    counts = _comment_counts(db, [row.Proof.id for row in rows])
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
                comment_count=counts.get(proof.id, 0),
            )
            for proof, author, task in rows
        ],
        can_view_proofs=can_view,
        next_cursor=next_cursor,
    )


def _open_proof(db: Session, user: User, proof_id: UUID) -> tuple[Proof, UUID]:
    """An approved proof whose comments the user may read and write, and its challenge id."""
    row = db.execute(
        select(Proof, Participation.challenge_id)
        .join(Participation, Proof.participation_id == Participation.id)
        .where(Proof.id == proof_id, Proof.status == ProofStatus.APPROVED)
    ).first()
    # Joining a challenge keeps it visible, so this also covers who may see the challenge.
    if row is None or not joined(db, user.id, row.challenge_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Proof not found")
    return row.Proof, row.challenge_id


def _comment_out(comment: ProofComment, author: User, proof: Proof, user: User) -> Comment:
    return Comment(
        id=comment.id,
        proof_id=comment.proof_id,
        user=UserSummary.model_validate(author),
        body=comment.body,
        created_at=comment.created_at,
        can_delete=user.id in (comment.user_id, proof.user_id),
    )


@router.get("/proofs/{proof_id}/comments")
def list_comments(
    proof_id: UUID,
    user: CurrentUser,
    db: DbSession,
    cursor: str | None = None,
    limit: Limit = 20,
) -> CommentPage:
    proof, _ = _open_proof(db, user, proof_id)
    stmt = select(ProofComment).where(ProofComment.proof_id == proof.id)
    comments, next_cursor = page(db, stmt, ProofComment.created_at, ProofComment.id, cursor, limit)
    authors = {
        u.id: u for u in db.scalars(select(User).where(User.id.in_({c.user_id for c in comments})))
    }
    return CommentPage(
        items=[_comment_out(c, authors[c.user_id], proof, user) for c in comments],
        next_cursor=next_cursor,
    )


@router.post("/proofs/{proof_id}/comments", status_code=status.HTTP_201_CREATED)
def create_comment(
    proof_id: UUID, body: CommentCreate, user: CurrentUser, db: DbSession
) -> Comment:
    proof, challenge_id = _open_proof(db, user, proof_id)
    # The time of the request, not of its transaction (Postgres now()), so order is exact.
    comment = ProofComment(
        proof_id=proof.id, user_id=user.id, body=body.body, created_at=datetime.now(UTC)
    )
    db.add(comment)
    db.flush()
    events.log(
        db,
        user,
        "proof_commented",
        proof_id=proof.id,
        challenge_id=challenge_id,
        own_proof=proof.user_id == user.id,
    )
    db.commit()
    db.refresh(comment)
    return _comment_out(comment, user, proof, user)


@router.delete("/comments/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_comment(comment_id: UUID, user: CurrentUser, db: DbSession) -> Response:
    """Delete a comment you wrote, or any comment under your own proof."""
    comment = db.get(ProofComment, comment_id)
    if comment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Comment not found")
    proof, _ = _open_proof(db, user, comment.proof_id)
    if user.id not in (comment.user_id, proof.user_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You can only delete your own comments")
    db.delete(comment)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
