"""Gemini on Vertex AI, over its REST API: text and images in, schema-shaped JSON out.

Calls authenticate as the service's Google account (on Cloud Run, vyro-api, which has
roles/aiplatform.user). Locally, `gcloud auth application-default login` provides one.
"""

import base64
import json
from dataclasses import dataclass
from functools import cache
from typing import Any

import google.auth
import requests
from google.auth.exceptions import GoogleAuthError
from google.auth.transport.requests import AuthorizedSession

from app.config import get_settings

SCOPE = "https://www.googleapis.com/auth/cloud-platform"
TIMEOUT_SECONDS = 60


class AiError(Exception):
    """The model could not give a usable answer. Carries the token counts it still billed."""

    def __init__(
        self, message: str, input_tokens: int | None = None, output_tokens: int | None = None
    ) -> None:
        super().__init__(message)
        self.input_tokens = input_tokens
        self.output_tokens = output_tokens


@dataclass(frozen=True)
class Reply:
    data: Any
    model: str
    input_tokens: int | None
    output_tokens: int | None


def enabled() -> bool:
    return bool(get_settings().ai_project)


def text_part(text: str) -> dict[str, Any]:
    return {"text": text}


def image_part(data: bytes, mime_type: str) -> dict[str, Any]:
    return {"inlineData": {"mimeType": mime_type, "data": base64.b64encode(data).decode()}}


@cache
def _session() -> AuthorizedSession:
    credentials, _ = google.auth.default(scopes=[SCOPE])
    return AuthorizedSession(credentials)


def _url(model: str) -> str:
    settings = get_settings()
    location = settings.ai_location
    host = "aiplatform.googleapis.com"
    if location != "global":
        host = f"{location}-{host}"
    return (
        f"https://{host}/v1/projects/{settings.ai_project}/locations/{location}"
        f"/publishers/google/models/{model}:generateContent"
    )


def _token_counts(payload: dict[str, Any]) -> tuple[int | None, int | None]:
    usage = payload.get("usageMetadata") or {}
    output = usage.get("candidatesTokenCount", 0) + usage.get("thoughtsTokenCount", 0)
    return usage.get("promptTokenCount"), output or None


def generate_json(
    model: str,
    system: str,
    parts: list[dict[str, Any]],
    schema: dict[str, Any],
    *,
    max_output_tokens: int = 8192,
    temperature: float = 1.0,
) -> Reply:
    """Ask `model` for JSON matching `schema` (JSON Schema). Raises AiError on any failure.

    The caller still validates the result: the schema guides the model but doesn't bind it to
    every rule (exact lengths, cross-field checks).
    """
    if not enabled():
        raise AiError("AI is not configured (VYRO_AI_PROJECT is unset)")
    body = {
        "systemInstruction": {"parts": [text_part(system)]},
        "contents": [{"role": "user", "parts": parts}],
        "generationConfig": {
            "responseMimeType": "application/json",
            "responseJsonSchema": schema,
            "maxOutputTokens": max_output_tokens,
            "temperature": temperature,
            # Thinking tokens count against maxOutputTokens and add latency; these tasks are
            # simple enough without much of it.
            "thinkingConfig": {"thinkingLevel": "LOW"},
        },
    }
    try:
        response = _session().post(_url(model), json=body, timeout=TIMEOUT_SECONDS)
    except (requests.RequestException, GoogleAuthError) as error:
        raise AiError(f"Vertex AI is unreachable: {error}") from error
    if response.status_code != 200:
        raise AiError(f"Vertex AI answered {response.status_code}: {response.text[:500]}")

    payload = response.json()
    input_tokens, output_tokens = _token_counts(payload)
    candidates = payload.get("candidates") or []
    if not candidates:
        feedback = payload.get("promptFeedback", {}).get("blockReason", "no candidates")
        raise AiError(f"The model gave no answer: {feedback}", input_tokens, output_tokens)
    candidate = candidates[0]
    finish = candidate.get("finishReason", "STOP")
    if finish != "STOP":
        raise AiError(f"The answer was cut short: {finish}", input_tokens, output_tokens)
    text = "".join(
        part.get("text", "")
        for part in candidate.get("content", {}).get("parts", [])
        if not part.get("thought")
    )
    try:
        data = json.loads(text)
    except json.JSONDecodeError as error:
        raise AiError(
            f"The answer is not JSON: {text[:200]}", input_tokens, output_tokens
        ) from error
    return Reply(data, payload.get("modelVersion", model), input_tokens, output_tokens)
