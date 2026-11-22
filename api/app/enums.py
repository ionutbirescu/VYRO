"""Enumerations shared by the database models and the API schemas."""

from enum import StrEnum


class Category(StrEnum):
    FITNESS = "fitness"
    NUTRITION = "nutrition"
    MINDFULNESS = "mindfulness"
    SLEEP = "sleep"
    LEARNING = "learning"
    READING = "reading"
    CREATIVITY = "creativity"
    PRODUCTIVITY = "productivity"
    SOCIAL = "social"
    OUTDOORS = "outdoors"
    SUSTAINABILITY = "sustainability"
    FINANCE = "finance"
    DIGITAL_DETOX = "digital_detox"


class ChallengeSource(StrEnum):
    TEMPLATE = "template"
    AI = "ai"
    USER = "user"


class Visibility(StrEnum):
    PUBLIC = "public"
    FRIENDS = "friends"
    PRIVATE = "private"


class ParticipationStatus(StrEnum):
    ACTIVE = "active"
    COMPLETED = "completed"
    ABANDONED = "abandoned"
    FAILED = "failed"


class ProofStatus(StrEnum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    DISPUTED = "disputed"


class AiVerdict(StrEnum):
    PASS = "pass"
    FAIL = "fail"
    UNSURE = "unsure"


class StudyGroup(StrEnum):
    # Random recommendations, fixed difficulty.
    CONTROL = "control"
    # Personalized recommendations, adaptive difficulty.
    TREATMENT = "treatment"


class PriceVariant(StrEnum):
    # Paywall A/B test arm: A shows $0.99, B shows $1.99.
    A = "a"
    B = "b"


class EventSource(StrEnum):
    CLIENT = "client"
    SERVER = "server"


class ReportTarget(StrEnum):
    USER = "user"
    CHALLENGE = "challenge"
    PROOF = "proof"
    MESSAGE = "message"
    COMMENT = "comment"


class ProductKind(StrEnum):
    SUBSCRIPTION = "subscription"
    ONE_TIME = "one_time"
    COSMETIC = "cosmetic"


class AcquiredVia(StrEnum):
    EARNED = "earned"
    PURCHASED = "purchased"


class InterventionKind(StrEnum):
    """What the streak rescue coach offered."""

    # A lighter version of today's task that still counts.
    TASK_SWAP = "task_swap"
    # Why today's photo was rejected and how to retake it.
    PROOF_RETAKE = "proof_retake"
    # A friend is in the same challenge.
    BUDDY = "buddy"
    # The next challenge to join after one ended.
    NEXT_CHALLENGE = "next_challenge"


class InterventionStatus(StrEnum):
    OPEN = "open"
    ACCEPTED = "accepted"
    DISMISSED = "dismissed"


ALLOWED_DURATIONS = (1, 7, 14, 30)
