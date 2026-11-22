"""The coach's agent loop. The model picks tools until it can answer; tools that change data
pause the loop until the user approves or declines them in the app.

A conversation's `contents` is the Gemini history, stored as the model returned it (thought
signatures included), so a turn can resume later from the database.
"""

from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session

from app.coach.tools import TOOLS, run_tool
from app.config import get_settings
from app.models import CoachConversation, User
from app.services import events, vertex

# Model calls per user message. Most answers need 1-3; this stops a loop that goes nowhere.
MAX_STEPS = 8
DECLINED = {"error": "The user declined this action. Don't retry it unless they ask again."}
GAVE_UP = "Sorry, I couldn't work that out. Could you ask in a simpler way?"

SYSTEM = """\
You are the coach inside VYRO, a habit app where people join day-by-day challenges, upload a \
photo as proof each day, earn XP and keep streaks.

How to help:
- Look things up with the tools before answering questions about the user's progress, \
challenges or options. Never invent challenges, ids, numbers or progress.
- Be specific and brief: a few short sentences or a short list. No headings, no emoji.
- When the user wants to start something, suggest one or two concrete challenges that fit \
their level and what they already do, and say why in one line.
- If they're behind on a challenge, look at its tasks and suggest how to catch up today.
- To join, leave, draft or publish, just call the tool when the user wants it. The app asks them \
to approve, so don't ask "should I?" first. If they decline, accept it and move on.
- Write drafts only when nothing existing fits. After a draft, show its title and first days, \
then offer to publish it.
- You only know what the tools return. For anything outside VYRO, say it's outside what you can \
help with here.
- Reply in the language the user writes in.

The user is {name}. Their local time is {now}."""


def _system(user: User, now: datetime) -> str:
    local = now.astimezone(ZoneInfo(user.timezone))
    return SYSTEM.format(name=user.display_name, now=local.strftime("%A %d %B %Y, %H:%M"))


def _user_turn(contents: list[dict[str, Any]], parts: list[dict[str, Any]]):
    """Append user parts, merging into the last turn if it is already the user's."""
    if contents and contents[-1]["role"] == "user":
        return [*contents[:-1], {"role": "user", "parts": [*contents[-1]["parts"], *parts]}]
    return [*contents, {"role": "user", "parts": parts}]


def _response_part(call: dict[str, Any], response: dict[str, Any]) -> dict[str, Any]:
    part: dict[str, Any] = {"name": call["name"], "response": response}
    if "id" in call:
        part["id"] = call["id"]
    return {"functionResponse": part}


def _needs_approval(call: dict[str, Any]) -> bool:
    tool = TOOLS.get(call["name"])
    return tool is not None and tool.confirm is not None


def _answer_calls(
    db: Session, user: User, calls: list[dict[str, Any]], approved: bool
) -> list[dict[str, Any]]:
    return [
        _response_part(
            call,
            run_tool(db, user, call["name"], call.get("args") or {})
            if approved or not _needs_approval(call)
            else DECLINED,
        )
        for call in calls
    ]


def run(db: Session, user: User, conversation: CoachConversation, now: datetime) -> None:
    """Continue the conversation until the coach answers or asks for approval.

    Raises vertex.AiError if the model fails; what happened before that stays saved.
    """
    model = get_settings().ai_coach_model
    declarations = [tool.declaration() for tool in TOOLS.values()]
    system = _system(user, now)
    for _ in range(MAX_STEPS):
        turn = vertex.chat(model, system, conversation.contents, declarations)
        contents = [*conversation.contents, turn.content]
        calls = turn.function_calls
        if not calls:
            conversation.contents = contents
            db.commit()
            return
        if any(_needs_approval(call) for call in calls):
            conversation.contents = contents
            conversation.pending = {"calls": calls}
            db.commit()
            return
        conversation.contents = contents
        db.commit()
        responses = _answer_calls(db, user, calls, approved=True)
        conversation.contents = _user_turn(contents, responses)
        db.commit()
    conversation.contents = [
        *conversation.contents,
        {"role": "model", "parts": [{"text": GAVE_UP}]},
    ]
    db.commit()


def add_message(
    db: Session, user: User, conversation: CoachConversation, text: str, now: datetime
) -> None:
    """Add the user's message and let the coach answer. A message sent while an action waits
    for approval declines that action."""
    parts: list[dict[str, Any]] = []
    if conversation.pending:
        parts = _answer_calls(db, user, conversation.pending["calls"], approved=False)
        conversation.pending = None
    conversation.contents = _user_turn(conversation.contents, [*parts, {"text": text}])
    events.log(db, user, "coach_message_sent", conversation_id=conversation.id)
    db.commit()
    run(db, user, conversation, now)


def resolve_pending(
    db: Session, user: User, conversation: CoachConversation, approve: bool, now: datetime
) -> None:
    """Run (or decline) the actions waiting for approval, then let the coach continue."""
    calls = conversation.pending["calls"] if conversation.pending else []
    conversation.pending = None
    db.commit()
    responses = _answer_calls(db, user, calls, approved=approve)
    conversation.contents = _user_turn(conversation.contents, responses)
    events.log(
        db,
        user,
        "coach_action_resolved",
        conversation_id=conversation.id,
        tools=[call["name"] for call in calls if _needs_approval(call)],
        approved=approve,
    )
    db.commit()
    run(db, user, conversation, now)


def pending_summary(db: Session, user: User, conversation: CoachConversation) -> str | None:
    if not conversation.pending:
        return None
    questions = [
        TOOLS[call["name"]].confirm(db, user, call.get("args") or {})  # type: ignore[misc]
        for call in conversation.pending["calls"]
        if _needs_approval(call)
    ]
    return " ".join(questions)


def messages(conversation: CoachConversation) -> list[dict[str, Any]]:
    """The conversation as the app shows it: user and coach text, and what the coach did."""
    shown: list[dict[str, Any]] = []
    used: list[str] = []
    for content in conversation.contents:
        parts = content["parts"]
        if content["role"] == "user":
            for part in parts:
                answer = part.get("functionResponse")
                tool = TOOLS.get(answer["name"]) if answer else None
                # An action that was declined or failed didn't happen; don't list it.
                if tool and tool.confirm and "error" in answer["response"] and tool.label in used:
                    used.remove(tool.label)
                if "text" in part:
                    shown.append({"role": "user", "text": part["text"], "tools_used": []})
            continue
        for part in parts:
            call = part.get("functionCall")
            if call and call["name"] in TOOLS and TOOLS[call["name"]].label not in used:
                used.append(TOOLS[call["name"]].label)
        text = "".join(p.get("text", "") for p in parts if not p.get("thought")).strip()
        if text:
            shown.append({"role": "coach", "text": text, "tools_used": used})
            used = []
    return shown
