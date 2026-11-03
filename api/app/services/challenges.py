"""Challenge visibility and response building, shared by the challenge, leaderboard and
recommendation endpoints."""

from collections.abc import Sequence
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import ColumnElement, Select, and_, distinct, func, or_, select
from sqlalchemy.orm import Session

from app.enums import ParticipationStatus, Visibility
from app.models import Challenge, ChallengeTask, Follow, Participation, User
from app.schemas.challenges import ChallengeSummary
from app.schemas.challenges import Participation as ParticipationOut
from app.schemas.users import UserSummary


def friend_ids(user_id: UUID) -> Select[tuple[UUID]]:
    """Users who follow `user_id` and whom `user_id` follows back."""
    following = select(Follow.followee_id).where(Follow.follower_id == user_id)
    return select(Follow.follower_id).where(
        Follow.followee_id == user_id, Follow.follower_id.in_(following)
    )


def visible_to(user_id: UUID) -> ColumnElement[bool]:
    """Public challenges, friends-only ones from friends, the user's own, and any they joined.

    Joined ones stay visible so a user can finish a challenge after unfollowing its creator.
    """
    return or_(
        Challenge.visibility == Visibility.PUBLIC,
        Challenge.creator_id == user_id,
        and_(
            Challenge.visibility == Visibility.FRIENDS,
            Challenge.creator_id.in_(friend_ids(user_id)),
        ),
        Challenge.id.in_(
            select(Participation.challenge_id).where(Participation.user_id == user_id)
        ),
    )


def get_visible(db: Session, user: User, challenge_id: UUID) -> Challenge:
    challenge = db.scalar(
        select(Challenge).where(Challenge.id == challenge_id, visible_to(user.id))
    )
    if challenge is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Challenge not found")
    return challenge


def summaries(db: Session, challenges: Sequence[Challenge]) -> list[ChallengeSummary]:
    """Summaries in the same order, with participant counts and XP totals in three queries."""
    ids = [c.id for c in challenges]
    participants = dict(
        db.execute(
            select(Participation.challenge_id, func.count(distinct(Participation.user_id)))
            .where(Participation.challenge_id.in_(ids))
            .group_by(Participation.challenge_id)
        ).all()
    )
    task_xp = dict(
        db.execute(
            select(ChallengeTask.challenge_id, func.sum(ChallengeTask.xp))
            .where(ChallengeTask.challenge_id.in_(ids))
            .group_by(ChallengeTask.challenge_id)
        ).all()
    )
    creator_ids = [c.creator_id for c in challenges if c.creator_id]
    creators = {u.id: u for u in db.scalars(select(User).where(User.id.in_(creator_ids)))}
    return [
        ChallengeSummary(
            id=c.id,
            title=c.title,
            description=c.description,
            category=c.category,
            difficulty=c.difficulty,
            duration_days=c.duration_days,
            total_xp=task_xp.get(c.id, 0) + c.completion_xp,
            source=c.source,
            visibility=c.visibility,
            is_premium=c.is_premium,
            participant_count=participants.get(c.id, 0),
            creator=(UserSummary.model_validate(creators[c.creator_id]) if c.creator_id else None),
            created_at=c.created_at,
        )
        for c in challenges
    ]


def participation_out(participation: Participation) -> ParticipationOut:
    active = participation.status is ParticipationStatus.ACTIVE
    return ParticipationOut(
        id=participation.id,
        challenge_id=participation.challenge_id,
        status=participation.status,
        completed_tasks=participation.completed_tasks,
        total_tasks=participation.challenge.duration_days,
        xp_earned=participation.xp_earned,
        next_day_number=participation.completed_tasks + 1 if active else None,
        joined_at=participation.joined_at,
        last_progress_at=participation.last_progress_at,
        ended_at=participation.ended_at,
    )
