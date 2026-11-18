"""The mentor that needs no AI at all.

This is the default, and it is not a degraded mode — it is the guarantee that
makes the project's "no subscription, ever" promise true. Every exercise ships
three authored hints written for its specific confusion, which is frequently
better than what a general model produces for a beginner.

A model, when one is configured, answers free-form follow-ups the authored
hints cannot anticipate. It enriches. It is never required.
"""

from __future__ import annotations

from ..types import MentorReply, MentorRequest

FALLBACKS = {
    1: "Say out loud what this should do in one sentence. Then find the first line that does not match.",
    2: "Re-read the prompt and name the one idea it is testing. The lesson above it introduced that idea.",
    3: "Look back at the worked example in this lesson and change it one piece at a time until it fits.",
}


class ScriptedProvider:
    name = "authored"

    async def ask(self, request: MentorRequest) -> MentorReply:
        hints = request.authored_hints or []
        # Tiers are 1-based and there are always exactly three authored hints,
        # but an exercise reached from a deep link may arrive with none.
        index = min(max(request.tier, 1), len(hints)) - 1 if hints else -1
        answer = hints[index] if index >= 0 else FALLBACKS.get(request.tier, FALLBACKS[1])
        return MentorReply(answer=answer, tier=request.tier, provider=self.name, used_fallback=True)
