"""Mentor selection and the public ask() entry point."""

from __future__ import annotations

import logging

import httpx

from .providers.ollama import OllamaProvider
from .providers.openai_compat import OpenAICompatProvider
from .providers.scripted import ScriptedProvider
from .types import MentorReply, MentorRequest

logger = logging.getLogger("conductor.mentor")


async def select_provider():
    """Chooses the best mentor currently available.

    Order is local model, then a configured free API, then the authored hints.
    Local first because it costs nothing and keeps the learner's code on their
    own machine; authored last because it always works.
    """
    ollama = OllamaProvider()
    if await ollama.available():
        return ollama

    api = OpenAICompatProvider()
    if api.configured():
        return api

    return ScriptedProvider()


async def ask(request: MentorRequest) -> MentorReply:
    """Answers the learner, falling back rather than failing.

    A mentor that errors is worse than a mentor that is merely less clever: the
    learner asked for help and got a dialog. Any provider failure falls through
    to the authored hints, which were written for this exact exercise.
    """
    provider = await select_provider()

    if isinstance(provider, ScriptedProvider):
        return await provider.ask(request)

    try:
        return await provider.ask(request)
    except (httpx.RequestError, httpx.HTTPStatusError, KeyError, ValueError) as error:
        # Logged WITHOUT the exception's string form: an HTTP error from an
        # OpenAI-compatible endpoint can echo the request, and the request
        # carries the API key.
        logger.warning("mentor provider %s failed (%s); using authored hints",
                       provider.name, type(error).__name__)
        return await ScriptedProvider().ask(request)
