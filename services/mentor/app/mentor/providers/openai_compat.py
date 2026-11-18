"""Any OpenAI-compatible endpoint with a free tier.

Deliberately generic rather than tied to one vendor: free tiers move, and the
spec's anti-goal A3 is this course rotting because a provider changed. Host,
model and key all come from configuration, so pointing it somewhere else is a
settings change rather than a code change.
"""

from __future__ import annotations

import os

import httpx

from ..socratic import build_messages, enforce
from ..types import MentorReply, MentorRequest

TIMEOUT_SECONDS = 25.0


class OpenAICompatProvider:
    name = "api"

    def __init__(
        self,
        base_url: str | None = None,
        api_key: str | None = None,
        model: str | None = None,
    ) -> None:
        self.base_url = (base_url or os.environ.get("CONDUCTOR_API_BASE", "")).rstrip("/")
        self.api_key = api_key or os.environ.get("CONDUCTOR_API_KEY", "")
        self.model = model or os.environ.get("CONDUCTOR_API_MODEL", "")

    def configured(self) -> bool:
        return bool(self.base_url and self.api_key and self.model)

    async def ask(self, request: MentorRequest) -> MentorReply:
        messages = build_messages(
            request.question, request.tier, request.learner_code, request.lesson_id
        )
        async with httpx.AsyncClient(timeout=TIMEOUT_SECONDS) as client:
            response = await client.post(
                f"{self.base_url}/chat/completions",
                headers={"Authorization": f"Bearer {self.api_key}"},
                json={"model": self.model, "messages": messages, "max_tokens": 400},
            )
            response.raise_for_status()
            content = response.json()["choices"][0]["message"]["content"]

        return MentorReply(
            answer=enforce(content, request.tier, request.solution),
            tier=request.tier,
            provider=self.name,
            used_fallback=False,
        )
