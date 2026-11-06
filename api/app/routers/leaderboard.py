from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Query
from sqlalchemy import Row, func, or_, select

from app.auth import CurrentUser
from app.db import DbSession
from app.models import Participation, User
from app.schemas.leaderboard import Leaderboard, LeaderboardEntry
from app.schemas.users import UserSummary
from app.services.challenges import get_visible

router = APIRouter(tags=["leaderboard"])


def _best_first(columns: Any) -> tuple[Any, ...]:
    """Most tasks first, then whoever reached that count first, then whoever joined first.

    `last_progress_at` is when an attempt completed its latest task, so among equal task counts
    the earliest one got there first. It is NULL only for attempts with no tasks done.
    """
    return (
        columns.completed_tasks.desc(),
        columns.last_progress_at.asc().nulls_last(),
        columns.joined_at.asc(),
        columns.user_id.asc(),
    )


def _entry(row: Row[Any]) -> LeaderboardEntry:
    return LeaderboardEntry(
        rank=row.place,
        user=UserSummary.model_validate(row.User),
        completed_tasks=row.completed_tasks,
        xp_earned=row.xp_earned,
        last_progress_at=row.last_progress_at,
    )


@router.get("/challenges/{challenge_id}/leaderboard")
def get_challenge_leaderboard(
    challenge_id: UUID,
    user: CurrentUser,
    db: DbSession,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
) -> Leaderboard:
    """Participants ranked by completed tasks, then by who got there first.

    Each user is listed once, with their best attempt: leaving and rejoining starts a new
    participation, and an earlier attempt that got further still counts. Ranks are unique.
    """
    get_visible(db, user, challenge_id)

    attempts = (
        select(
            Participation.user_id,
            Participation.completed_tasks,
            Participation.xp_earned,
            Participation.last_progress_at,
            Participation.joined_at,
            func.row_number()
            .over(partition_by=Participation.user_id, order_by=_best_first(Participation))
            .label("attempt"),
        )
        .where(Participation.challenge_id == challenge_id)
        .subquery()
    )
    ranked = (
        select(attempts, func.row_number().over(order_by=_best_first(attempts.c)).label("place"))
        .where(attempts.c.attempt == 1)
        .subquery()
    )
    # The top `limit` rows plus the current user's, in one query.
    rows = db.execute(
        select(
            ranked.c.place,
            ranked.c.completed_tasks,
            ranked.c.xp_earned,
            ranked.c.last_progress_at,
            User,
        )
        .join(User, User.id == ranked.c.user_id)
        .where(or_(ranked.c.place <= limit, ranked.c.user_id == user.id))
        .order_by(ranked.c.place)
    ).all()

    return Leaderboard(
        challenge_id=challenge_id,
        entries=[_entry(row) for row in rows if row.place <= limit],
        me=next((_entry(row) for row in rows if row.User.id == user.id), None),
    )
