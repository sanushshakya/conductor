"""Sidecar application entry point."""

from fastapi import Depends, FastAPI

from .health import router as health_router
from .security import require_token

app = FastAPI(
    title="Conductor sidecar",
    version="0.1.0",
    # No docs UI: this is an internal component of a desktop app, and the
    # learner meets FastAPI's docs on their OWN server in Track 3, which is
    # where that moment belongs.
    docs_url=None,
    redoc_url=None,
)

app.include_router(health_router)


@app.get("/whoami", dependencies=[Depends(require_token)])
def whoami() -> dict[str, str]:
    """Trivial authenticated route, used to prove the token gate works."""
    return {"service": "conductor-sidecar"}
