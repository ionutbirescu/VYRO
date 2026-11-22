from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import Field, StringConstraints

from app.enums import InterventionKind, InterventionStatus
from app.schemas.common import Schema


class CoachMessageIn(Schema):
    text: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)]


class CoachDecision(Schema):
    approve: bool


class CoachMessage(Schema):
    role: Literal["user", "coach"]
    text: str
    tools_used: list[str] = Field(
        description="What the coach looked up or did before this reply, e.g. 'Checked your "
        "challenges'. Empty for user messages."
    )


class PendingAction(Schema):
    question: str = Field(examples=["Join “Morning run”?"])


class CoachConversation(Schema):
    id: UUID
    messages: list[CoachMessage]
    pending_action: PendingAction | None = Field(
        description="An action the coach wants to take. Answer it with POST .../decision; "
        "sending a new message declines it."
    )
    error: str | None = Field(
        default=None,
        description="Set when the coach failed to reply. POST .../retry to try again.",
    )
    updated_at: datetime


class LighterTask(Schema):
    title: str
    instructions: str
    proof_hint: str


class RescueOffer(Schema):
    """Today's streak rescue suggestion. The app shows it on Home while `status` is open."""

    id: UUID
    kind: InterventionKind
    status: InterventionStatus
    message: str = Field(description="What the coach says, one or two sentences")
    accept_label: str = Field(examples=["Use the lighter version"])
    challenge_id: UUID | None = Field(
        description="The challenge it's about; open it after accepting"
    )
    lighter_task: LighterTask | None = Field(
        description="For task_swap: what accepting turns today's task into"
    )
    chosen_by: Literal["agent", "rules"] = Field(
        description="agent: Gemini picked it. rules: the fallback without AI"
    )
    created_at: datetime
