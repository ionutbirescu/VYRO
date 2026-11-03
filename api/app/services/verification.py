"""AI verification of proof photos.

Placeholder until the vision model is connected: every photo passes. It reports no confidence and
model "auto-approve", so these proofs are easy to leave out of the RQ3 analysis.
"""

from dataclasses import dataclass

from app.enums import AiVerdict
from app.models import ChallengeTask


@dataclass(frozen=True)
class Result:
    verdict: AiVerdict
    confidence: float | None
    reason: str | None
    model: str


def verify(task: ChallengeTask, image_path: str, caption: str | None) -> Result:
    return Result(verdict=AiVerdict.PASS, confidence=None, reason=None, model="auto-approve")
