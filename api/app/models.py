"""SQLAlchemy ORM models. Alembic autogenerates migrations from this metadata."""

import uuid
from datetime import date, datetime
from enum import StrEnum
from typing import Any

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    Enum,
    ForeignKey,
    Identity,
    Index,
    MetaData,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from sqlalchemy.types import DateTime

from app.enums import (
    AcquiredVia,
    AiVerdict,
    Category,
    ChallengeSource,
    EventSource,
    ParticipationStatus,
    PriceVariant,
    ProofStatus,
    ReportTarget,
    StudyGroup,
    Visibility,
)

NAMING_CONVENTION = {
    "ix": "ix_%(table_name)s_%(column_0_N_name)s",
    "uq": "uq_%(table_name)s_%(column_0_N_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


def _enum(enum_cls: type[StrEnum], name: str) -> Enum:
    # VARCHAR + CHECK instead of a native Postgres ENUM: adding a value is a one-line migration.
    # Autogenerate renders these CHECKs twice (once unprefixed, once as ck_<table>_<name>) and
    # leaves create_constraint=True on the column type. In new migrations keep only the
    # op.f("ck_...") constraint and set create_constraint=False, as in the initial migration.
    return Enum(
        enum_cls,
        name=name,
        native_enum=False,
        create_constraint=True,
        length=32,
        values_callable=lambda members: [m.value for m in members],
        validate_strings=True,
    )


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING_CONVENTION)
    type_annotation_map = {  # noqa: RUF012
        datetime: DateTime(timezone=True),
        dict[str, Any]: JSONB,
    }


class CreatedAtMixin:
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())


class TimestampMixin(CreatedAtMixin):
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now())


# --- Users and social graph -------------------------------------------------------------------


class User(TimestampMixin, Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    firebase_uid: Mapped[str] = mapped_column(String(128), unique=True)
    username: Mapped[str] = mapped_column(String(32))
    display_name: Mapped[str] = mapped_column(String(64))
    bio: Mapped[str | None] = mapped_column(String(280))
    avatar_url: Mapped[str | None] = mapped_column(String(512))
    # IANA zone; streak days roll over at the user's local midnight.
    timezone: Mapped[str] = mapped_column(String(64), default="UTC", server_default="UTC")
    xp: Mapped[int] = mapped_column(default=0, server_default="0")
    level: Mapped[int] = mapped_column(default=1, server_default="1")
    current_streak: Mapped[int] = mapped_column(default=0, server_default="0")
    longest_streak: Mapped[int] = mapped_column(default=0, server_default="0")
    # Local date of the most recent approved proof; drives streak updates.
    last_active_on: Mapped[date | None]
    study_group: Mapped[StudyGroup] = mapped_column(_enum(StudyGroup, "study_group"))
    price_variant: Mapped[PriceVariant] = mapped_column(_enum(PriceVariant, "price_variant"))
    plus_until: Mapped[datetime | None]
    research_consent_at: Mapped[datetime | None]


Index("uq_users_username_lower", func.lower(User.username), unique=True)


class Follow(CreatedAtMixin, Base):
    __tablename__ = "follows"
    __table_args__ = (CheckConstraint("follower_id <> followee_id", name="no_self_follow"),)

    follower_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    followee_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True, index=True
    )


# --- Challenges -------------------------------------------------------------------------------


class Challenge(TimestampMixin, Base):
    __tablename__ = "challenges"
    __table_args__ = (
        CheckConstraint("difficulty BETWEEN 1 AND 5", name="difficulty_range"),
        CheckConstraint("duration_days IN (1, 7, 14, 30)", name="duration_allowed"),
        Index("ix_challenges_browse", "visibility", "category", "difficulty"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    title: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(Text)
    category: Mapped[Category] = mapped_column(_enum(Category, "category"))
    difficulty: Mapped[int] = mapped_column(SmallInteger)
    duration_days: Mapped[int] = mapped_column(SmallInteger)
    # Bonus XP for finishing every task; per-task XP lives on ChallengeTask. Both are computed
    # server-side from difficulty so user-created challenges cannot farm XP.
    completion_xp: Mapped[int]
    source: Mapped[ChallengeSource] = mapped_column(_enum(ChallengeSource, "challenge_source"))
    visibility: Mapped[Visibility] = mapped_column(_enum(Visibility, "visibility"))
    # Paid content such as the 30-Day Challenge Pack.
    is_premium: Mapped[bool] = mapped_column(default=False, server_default="false")
    # NULL for system templates.
    creator_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    generation_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("ai_generations.id", ondelete="SET NULL")
    )

    creator: Mapped[User | None] = relationship()
    tasks: Mapped[list["ChallengeTask"]] = relationship(
        back_populates="challenge",
        order_by="ChallengeTask.day_number",
        cascade="all, delete-orphan",
    )


class ChallengeTask(Base):
    __tablename__ = "challenge_tasks"
    __table_args__ = (
        UniqueConstraint("challenge_id", "day_number"),
        CheckConstraint("day_number >= 1", name="day_number_positive"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    challenge_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("challenges.id", ondelete="CASCADE"))
    day_number: Mapped[int] = mapped_column(SmallInteger)
    title: Mapped[str] = mapped_column(String(120))
    instructions: Mapped[str] = mapped_column(Text)
    # What the proof photo should show; passed to the verification model.
    proof_hint: Mapped[str] = mapped_column(String(280))
    xp: Mapped[int]

    challenge: Mapped[Challenge] = relationship(back_populates="tasks")


class Participation(Base):
    __tablename__ = "participations"
    __table_args__ = (
        Index(
            "uq_participations_active_user_challenge",
            "user_id",
            "challenge_id",
            unique=True,
            postgresql_where=text("status = 'active'"),
        ),
        Index("ix_participations_leaderboard", "challenge_id", "completed_tasks"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    challenge_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("challenges.id", ondelete="CASCADE"))
    status: Mapped[ParticipationStatus] = mapped_column(
        _enum(ParticipationStatus, "participation_status"),
        default=ParticipationStatus.ACTIVE,
        server_default=ParticipationStatus.ACTIVE.value,
    )
    # Denormalized progress so progress and leaderboard reads do not aggregate proofs.
    completed_tasks: Mapped[int] = mapped_column(default=0, server_default="0")
    xp_earned: Mapped[int] = mapped_column(default=0, server_default="0")
    # The user's adaptive target difficulty when they joined (RQ2 analysis).
    target_difficulty_at_join: Mapped[int | None] = mapped_column(SmallInteger)
    # The recommendation response that surfaced this challenge, if any (RQ1 attribution).
    recommendation_id: Mapped[uuid.UUID | None]
    joined_at: Mapped[datetime] = mapped_column(server_default=func.now())
    last_progress_at: Mapped[datetime | None]
    ended_at: Mapped[datetime | None]

    challenge: Mapped[Challenge] = relationship()


# --- Proofs and verification ------------------------------------------------------------------


class Proof(Base):
    __tablename__ = "proofs"
    __table_args__ = (
        Index(
            "uq_proofs_approved_participation_task",
            "participation_id",
            "task_id",
            unique=True,
            postgresql_where=text("status = 'approved'"),
        ),
        CheckConstraint(
            "ai_confidence IS NULL OR (ai_confidence >= 0 AND ai_confidence <= 1)",
            name="ai_confidence_range",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    participation_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("participations.id", ondelete="CASCADE"), index=True
    )
    task_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("challenge_tasks.id", ondelete="CASCADE"))
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    # Cloud Storage object path, not a URL; clients get short-lived signed URLs.
    image_path: Mapped[str] = mapped_column(String(512))
    caption: Mapped[str | None] = mapped_column(String(280))
    status: Mapped[ProofStatus] = mapped_column(
        _enum(ProofStatus, "proof_status"),
        default=ProofStatus.PENDING,
        server_default=ProofStatus.PENDING.value,
    )
    ai_verdict: Mapped[AiVerdict | None] = mapped_column(_enum(AiVerdict, "ai_verdict"))
    ai_confidence: Mapped[float | None]
    ai_reason: Mapped[str | None] = mapped_column(Text)
    ai_model: Mapped[str | None] = mapped_column(String(128))
    ai_latency_ms: Mapped[int | None]
    xp_awarded: Mapped[int] = mapped_column(default=0, server_default="0")
    dispute_reason: Mapped[str | None] = mapped_column(String(500))
    disputed_at: Mapped[datetime | None]
    submitted_at: Mapped[datetime] = mapped_column(server_default=func.now())
    verified_at: Mapped[datetime | None]


class ProofLabel(CreatedAtMixin, Base):
    """Human rater judgement of a proof; ground truth for RQ3 (agreement and calibration)."""

    __tablename__ = "proof_labels"

    proof_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("proofs.id", ondelete="CASCADE"), primary_key=True
    )
    # Pseudonymous rater id, e.g. "rater1".
    rater: Mapped[str] = mapped_column(String(64), primary_key=True)
    is_valid: Mapped[bool]


# --- Gamification -----------------------------------------------------------------------------


class UserAchievement(Base):
    __tablename__ = "user_achievements"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    # Achievement definitions live in code; this table only records unlocks.
    code: Mapped[str] = mapped_column(String(64), primary_key=True)
    unlocked_at: Mapped[datetime] = mapped_column(server_default=func.now())


# --- AI generation ----------------------------------------------------------------------------


class AiGeneration(CreatedAtMixin, Base):
    """One call to the challenge generator, kept for quotas and generation metrics."""

    __tablename__ = "ai_generations"
    __table_args__ = (
        CheckConstraint("rating IS NULL OR rating BETWEEN 1 AND 5", name="rating_range"),
        Index("ix_ai_generations_user_created", "user_id", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    request: Mapped[dict[str, Any]]
    output: Mapped[dict[str, Any] | None]
    model: Mapped[str] = mapped_column(String(128))
    schema_valid: Mapped[bool]
    error: Mapped[str | None] = mapped_column(Text)
    latency_ms: Mapped[int | None]
    input_tokens: Mapped[int | None]
    output_tokens: Mapped[int | None]
    rating: Mapped[int | None] = mapped_column(SmallInteger)
    published_at: Mapped[datetime | None]
    # Whether the user changed the draft before publishing it (edit-rate metric).
    edited_before_publish: Mapped[bool | None]


# --- Analytics --------------------------------------------------------------------------------


class Event(Base):
    __tablename__ = "events"
    __table_args__ = (
        Index("ix_events_name_created", "name", "created_at"),
        Index("ix_events_user_created", "user_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    name: Mapped[str] = mapped_column(String(64))
    source: Mapped[EventSource] = mapped_column(_enum(EventSource, "event_source"))
    properties: Mapped[dict[str, Any]] = mapped_column(
        default=dict, server_default=text("'{}'::jsonb")
    )
    client_ts: Mapped[datetime | None]
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())


# --- Sandbox monetization ---------------------------------------------------------------------


class Purchase(CreatedAtMixin, Base):
    __tablename__ = "purchases"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    # Product definitions live in code.
    product_code: Mapped[str] = mapped_column(String(64))
    price_cents: Mapped[int]
    currency: Mapped[str] = mapped_column(String(3), default="USD", server_default="USD")
    price_variant: Mapped[PriceVariant] = mapped_column(_enum(PriceVariant, "price_variant"))
    # Always true for this project: the checkout is fake and no money moves.
    sandbox: Mapped[bool] = mapped_column(default=True, server_default="true")


class UserCosmetic(Base):
    __tablename__ = "user_cosmetics"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    cosmetic_code: Mapped[str] = mapped_column(String(64), primary_key=True)
    acquired_via: Mapped[AcquiredVia] = mapped_column(_enum(AcquiredVia, "acquired_via"))
    equipped: Mapped[bool] = mapped_column(default=False, server_default="false")
    acquired_at: Mapped[datetime] = mapped_column(server_default=func.now())


# --- Moderation -------------------------------------------------------------------------------


class Report(CreatedAtMixin, Base):
    __tablename__ = "reports"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    reporter_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    target_type: Mapped[ReportTarget] = mapped_column(_enum(ReportTarget, "report_target"))
    # A UUID for users/challenges/proofs; a Firestore document id for chat messages.
    target_id: Mapped[str] = mapped_column(String(128))
    reason: Mapped[str] = mapped_column(String(500))
