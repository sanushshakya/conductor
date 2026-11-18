"""Shared request and reply shapes for the mentor."""

from __future__ import annotations

from pydantic import BaseModel, Field


class MentorRequest(BaseModel):
    question: str = Field(default="", max_length=4000)
    lesson_id: str | None = None
    exercise_id: str | None = None
    tier: int = 1
    learner_code: str | None = Field(default=None, max_length=20_000)
    authored_hints: list[str] | None = None
    #: The exercise's reference solution, sent so the tier contract can refuse
    #: a reply that has effectively leaked it. Never shown to the learner.
    solution: str | None = None


class MentorReply(BaseModel):
    answer: str
    tier: int
    provider: str
    used_fallback: bool
