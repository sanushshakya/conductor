"""Request authentication for the sidecar.

The token is generated fresh by the Electron main process on every launch,
passed in through the environment, and never written to disk. Any other local
process would have to guess 48 hex characters to reach these routes.
"""

import os
import secrets

from fastapi import Header, HTTPException, status

TOKEN_HEADER = "X-Conductor-Token"


def expected_token() -> str:
    return os.environ.get("CONDUCTOR_TOKEN", "")


def require_token(x_conductor_token: str = Header(default="")) -> None:
    expected = expected_token()
    if not expected:
        # No token configured means the sidecar was started outside the app.
        # Refusing is the safe default: an unauthenticated code-execution
        # endpoint is not something to leave open by accident.
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The Python engine was started without a session token.",
        )
    # Constant-time comparison: this is a secret, and timing differences on a
    # shared machine are a real way to recover one.
    if not secrets.compare_digest(x_conductor_token, expected):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid session token.",
        )
