import pytest
from pydantic import ValidationError

from app.schemas.challenges import ChallengeDraft
from app.schemas.users import MeCreate


def _draft(duration_days: int, days: list[int]) -> dict:
    return {
        "title": "Morning walk",
        "description": "Walk outside every morning.",
        "category": "outdoors",
        "difficulty": 2,
        "duration_days": duration_days,
        "tasks": [
            {
                "day_number": day,
                "title": f"Walk day {day}",
                "instructions": "Walk 20 minutes.",
                "proof_hint": "A photo taken outdoors",
            }
            for day in days
        ],
    }


def test_draft_accepts_one_task_per_day() -> None:
    draft = ChallengeDraft.model_validate(_draft(7, [3, 1, 2, 4, 5, 6, 7]))
    assert len(draft.tasks) == 7


@pytest.mark.parametrize(
    ("duration", "days"),
    [(7, [1, 2, 3]), (1, [1, 1]), (1, [2]), (7, [1, 2, 3, 4, 5, 6, 8])],
)
def test_draft_rejects_gaps_and_duplicates(duration: int, days: list[int]) -> None:
    with pytest.raises(ValidationError):
        ChallengeDraft.model_validate(_draft(duration, days))


def test_draft_rejects_unsupported_duration() -> None:
    with pytest.raises(ValidationError):
        ChallengeDraft.model_validate(_draft(3, [1, 2, 3]))


def test_me_create_requires_adult_and_valid_timezone() -> None:
    base = {"username": "ionut", "display_name": "Ionut", "research_consent": True}
    MeCreate.model_validate({**base, "confirms_adult": True, "timezone": "Europe/Bucharest"})
    with pytest.raises(ValidationError):
        MeCreate.model_validate({**base, "confirms_adult": False})
    with pytest.raises(ValidationError):
        MeCreate.model_validate({**base, "confirms_adult": True, "timezone": "Mars/Olympus"})
