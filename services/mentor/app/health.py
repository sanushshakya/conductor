"""Liveness endpoint.

The supervisor polls this to decide when the sidecar is actually ready, as
opposed to merely spawned. It is the only route that does not require the
token, so that a mismatched token reports a clear failure rather than a
timeout that looks identical to a crash.
"""

from fastapi import APIRouter

from . import __version__

router = APIRouter()


@router.get("/health")
def health() -> dict[str, object]:
    return {"ok": True, "version": __version__}
