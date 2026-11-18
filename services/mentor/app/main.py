"""Sidecar application entry point."""

from fastapi import Depends, FastAPI

from .health import router as health_router
from .runner import RunRequest, run_python
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


@app.post("/run/python", dependencies=[Depends(require_token)])
def run(request: RunRequest) -> dict[str, object]:
    """Runs the learner's program.

    Always 200. A program that crashed, hung, or flooded its output is an
    ordinary thing for a beginner to write, and reporting it as an HTTP error
    would turn the lesson's output panel into a failure dialog.
    """
    result = run_python(request.code, request.stdin, request.timeout_ms)
    return {
        "ok": result.ok,
        "stdout": result.stdout,
        "stderr": result.stderr,
        "exitCode": result.exit_code,
        "durationMs": result.duration_ms,
        "truncated": result.truncated,
        "killedReason": result.killed_reason,
    }
