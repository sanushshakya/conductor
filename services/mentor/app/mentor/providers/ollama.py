"""A model running on the learner's own machine.

Preferred over any hosted API when it is there: it costs nothing, works
offline, and no code a beginner writes ever leaves their computer.
"""

from __future__ import annotations

import os

import httpx

from ..socratic import build_messages, enforce
from ..types import MentorReply, MentorRequest

DEFAULT_HOST = "http://127.0.0.1:11434"
DEFAULT_MODEL = "llama3.2"
TIMEOUT_SECONDS = 25.0


class OllamaProvider:
    name = "ollama"

    def __init__(self, host: str | None = None, model: str | None = None) -> None:
        self.host = (host or os.environ.get("CONDUCTOR_OLLAMA_HOST") or DEFAULT_HOST).rstrip("/")
        self.model = model or os.environ.get("CONDUCTOR_OLLAMA_MODEL") or DEFAULT_MODEL

    async def available(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=1.5) as client:
                return (await client.get(f"{self.host}/api/tags")).status_code == 200
        except httpx.RequestError:
            return False

    async def ask(self, request: MentorRequest) -> MentorReply:
        messages = build_messages(
            request.question, request.tier, request.learner_code, request.lesson_id
        )
        async with httpx.AsyncClient(timeout=TIMEOUT_SECONDS) as client:
            response = await client.post(
                f"{self.host}/api/chat",
                json={"model": self.model, "messages": messages, "stream": False},
            )
            response.raise_for_status()
            content = response.json().get("message", {}).get("content", "")

        return MentorReply(
            answer=enforce(content, request.tier, request.solution),
            tier=request.tier,
            provider=self.name,
            used_fallback=False,
        )
