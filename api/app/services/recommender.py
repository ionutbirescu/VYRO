"""Challenge recommendations (RQ1).

Control users get a random sample of the challenges they could join: the baseline. Treatment
users get content-based scoring on category, difficulty and history, with epsilon-greedy
exploration so they also see categories they haven't tried.

Every response is logged as a `recommendations_served` event with its id, and joins carry the id
back, so the analysis can compute completion rate, precision@5 and NDCG@5 per group.
"""

import math
import random
from collections import Counter
from dataclasses import dataclass
from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app.enums import Category, ParticipationStatus, StudyGroup
from app.models import Challenge, Participation, User
from app.schemas.recommendations import Recommendation, RecommendationList
from app.services import difficulty as adaptive
from app.services import events
from app.services.challenges import summaries, visible_to

# Newest candidates considered per request; plenty for a pilot-sized catalogue.
CANDIDATE_POOL = 500
# Chance that each slot after the first goes to an untried category instead of the best score.
EPSILON = 0.2
WEIGHTS = {"affinity": 0.45, "difficulty": 0.30, "popularity": 0.15, "completion": 0.10}
# How much each past participation says about liking its category.
INTEREST = {
    ParticipationStatus.COMPLETED: 2.0,
    ParticipationStatus.ACTIVE: 1.0,
    ParticipationStatus.ABANDONED: 0.5,
    ParticipationStatus.FAILED: 0.5,
}


@dataclass
class Candidate:
    challenge: Challenge
    participants: int
    completions: int
    score: float = 0.0
    explore: bool = False
    reason: str | None = None


def _candidates(db: Session, user: User, now: datetime) -> list[Candidate]:
    """Challenges the user can see and join: not their own, not ones they already took on, and
    premium ones only with VYRO+."""
    taken = select(Participation.challenge_id).where(Participation.user_id == user.id)
    stmt = (
        select(Challenge)
        .where(
            visible_to(user.id),
            Challenge.id.not_in(taken),
            Challenge.creator_id.is_distinct_from(user.id),
        )
        .order_by(Challenge.created_at.desc(), Challenge.id)
        .limit(CANDIDATE_POOL)
    )
    if not (user.plus_until and user.plus_until > now):
        stmt = stmt.where(Challenge.is_premium.is_(False))
    challenges = list(db.scalars(stmt))
    stats = {
        challenge_id: (participants, completions)
        for challenge_id, participants, completions in db.execute(
            select(
                Participation.challenge_id,
                func.count(func.distinct(Participation.user_id)),
                func.count(case((Participation.status == ParticipationStatus.COMPLETED, 1))),
            )
            .where(Participation.challenge_id.in_([c.id for c in challenges]))
            .group_by(Participation.challenge_id)
        )
    }
    return [Candidate(c, *stats.get(c.id, (0, 0))) for c in challenges]


def _history(db: Session, user: User) -> tuple[dict[Category, float], Counter[Category]]:
    """Interest per category (shares summing to 1) and completed challenges per category."""
    rows = db.execute(
        select(Challenge.category, Participation.status)
        .join(Participation, Participation.challenge_id == Challenge.id)
        .where(Participation.user_id == user.id)
    ).all()
    interest: Counter[Category] = Counter()
    completed: Counter[Category] = Counter()
    for category, state in rows:
        interest[category] += INTEREST[state]
        if state is ParticipationStatus.COMPLETED:
            completed[category] += 1
    total = sum(interest.values())
    return {c: weight / total for c, weight in interest.items()} if total else {}, completed


def _label(category: Category) -> str:
    return category.value.replace("_", " ")


def _score(candidates: list[Candidate], affinity: dict[Category, float], target: int) -> None:
    most_popular = max((c.participants for c in candidates), default=0)
    for candidate in candidates:
        challenge = candidate.challenge
        features = {
            "affinity": affinity.get(challenge.category, 0.0),
            "difficulty": 1 - abs(challenge.difficulty - target) / 4,
            "popularity": (
                math.log1p(candidate.participants) / math.log1p(most_popular) if most_popular else 0
            ),
            # Smoothed share of participants who finished: favours challenges people complete.
            "completion": (candidate.completions + 1) / (candidate.participants + 2),
        }
        candidate.score = sum(WEIGHTS[name] * value for name, value in features.items())


def _reason(
    candidate: Candidate, affinity: dict[Category, float], completed: Counter[Category], target: int
) -> str:
    if candidate.explore:
        return "Something new to try"
    category = candidate.challenge.category
    if finished := completed[category]:
        plural = "challenge" if finished == 1 else "challenges"
        return f"Because you finished {finished} {_label(category)} {plural}"
    if affinity.get(category):
        return f"You've been into {_label(category)} lately"
    if affinity and candidate.challenge.difficulty == target:
        return "Matches your level"
    if candidate.participants:
        return "Popular with other VYRO users"
    return "New on VYRO"


def _personalized(
    candidates: list[Candidate],
    affinity: dict[Category, float],
    completed: Counter[Category],
    target: int,
    limit: int,
    rng: random.Random,
) -> list[Candidate]:
    _score(candidates, affinity, target)
    ranked = sorted(candidates, key=lambda c: c.score, reverse=True)
    picked: list[Candidate] = []
    for slot in range(min(limit, len(ranked))):
        untried = [c for c in ranked if c.challenge.category not in affinity]
        if slot > 0 and untried and rng.random() < EPSILON:
            choice = rng.choice(untried)
            choice.explore = True
        else:
            choice = ranked[0]
        ranked.remove(choice)
        picked.append(choice)
    for candidate in picked:
        candidate.reason = _reason(candidate, affinity, completed, target)
    return picked


def recommend(
    db: Session, user: User, limit: int, now: datetime, rng: random.Random | None = None
) -> RecommendationList:
    rng = rng or random.Random()
    candidates = _candidates(db, user, now)
    if user.study_group is StudyGroup.CONTROL:
        strategy = "random"
        target = None
        picked = rng.sample(candidates, min(limit, len(candidates)))
    else:
        strategy = "content_epsilon_greedy"
        target = adaptive.target(db, user, now)
        affinity, completed = _history(db, user)
        picked = _personalized(candidates, affinity, completed, target, limit, rng)

    recommendation_id: UUID = uuid4()
    events.log(
        db,
        user,
        "recommendations_served",
        recommendation_id=recommendation_id,
        strategy=strategy,
        target_difficulty=target,
        candidates=len(candidates),
        items=[
            {
                "rank": rank,
                "challenge_id": c.challenge.id,
                "score": round(c.score, 4),
                "explore": c.explore,
            }
            for rank, c in enumerate(picked, start=1)
        ],
    )
    return RecommendationList(
        recommendation_id=recommendation_id,
        items=[
            Recommendation(rank=rank, challenge=summary, reason=c.reason)
            for rank, (c, summary) in enumerate(
                zip(picked, summaries(db, [c.challenge for c in picked]), strict=True), start=1
            )
        ],
    )
