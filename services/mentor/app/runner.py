"""Runs the learner's Python in a throwaway subprocess.

The parent's job is the things a child cannot do for itself: a wall clock that
holds even if the child wedges, an output cap that holds even if the child
floods, and a clean directory per run so one program cannot see another's
files.
"""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
import tempfile
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field

#: Output beyond this is dropped. A beginner's runaway `print` in a loop can
#: produce hundreds of megabytes in seconds, and no lesson needs more than this
#: to make its point.
MAX_OUTPUT_BYTES = 256 * 1024

DEFAULT_TIMEOUT_MS = 5_000
MAX_TIMEOUT_MS = 15_000

KilledReason = Literal["timeout", "memory", "output"]


@dataclass
class RunResult:
    ok: bool
    stdout: str
    stderr: str
    exit_code: int | None
    duration_ms: int
    truncated: bool
    killed_reason: KilledReason | None = None


class RunRequest(BaseModel):
    code: str = Field(default="", max_length=200_000)
    stdin: str | None = None
    timeout_ms: int | None = None


def _truncate(text: str) -> tuple[str, bool]:
    encoded = text.encode("utf-8", errors="replace")
    if len(encoded) <= MAX_OUTPUT_BYTES:
        return text, False
    return encoded[:MAX_OUTPUT_BYTES].decode("utf-8", errors="ignore"), True


def _sandbox_source() -> str:
    return (Path(__file__).parent / "sandbox.py").read_text(encoding="utf-8")


class _StreamReader(threading.Thread):
    """Drains one pipe into a capped buffer, discarding the overflow.

    Discarding rather than stopping matters: a reader that stops reading leaves
    the child blocked on a full pipe forever, which turns a noisy program into
    a hung one.
    """

    def __init__(self, stream) -> None:
        super().__init__(daemon=True)
        self._stream = stream
        self._chunks: list[str] = []
        self._size = 0
        self.truncated = False

    def run(self) -> None:
        try:
            while True:
                chunk = self._stream.read(8192)
                if not chunk:
                    break
                remaining = MAX_OUTPUT_BYTES - self._size
                if remaining > 0:
                    self._chunks.append(chunk[:remaining])
                    self._size += len(chunk[:remaining])
                if len(chunk) > remaining:
                    self.truncated = True
        except (ValueError, OSError):
            # The pipe was closed under us by the kill. Whatever arrived
            # before that is still worth showing.
            pass

    def text(self) -> str:
        return "".join(self._chunks)


def run_python(
    code: str,
    stdin: str | None = None,
    timeout_ms: int | None = None,
) -> RunResult:
    """Executes `code` and returns what happened.

    Never raises for anything the learner did: a crash, a hang, and a flood of
    output are all ordinary results here, described in `stderr` in words a
    beginner can act on.
    """
    timeout_ms = min(timeout_ms or DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS)
    workspace = tempfile.mkdtemp(prefix="conductor-run-")
    started = time.monotonic()

    try:
        code_path = os.path.join(workspace, "program.py")
        Path(code_path).write_text(code, encoding="utf-8")
        runner_path = os.path.join(workspace, "_conductor_sandbox.py")
        Path(runner_path).write_text(_sandbox_source(), encoding="utf-8")

        environment = {
            key: value
            for key, value in os.environ.items()
            # The session token authenticates the sidecar's own routes. Learner
            # code has no business seeing it, and it is removed again inside the
            # sandbox as a second line of defence.
            if key not in {"CONDUCTOR_TOKEN"}
        }
        environment["PYTHONUNBUFFERED"] = "1"
        environment["PYTHONDONTWRITEBYTECODE"] = "1"

        process = subprocess.Popen(
            # -I isolates: no PYTHONPATH, no user site-packages, no implicit
            # imports from the learner's directory shadowing the stdlib.
            # -u and -B are passed as FLAGS, not environment variables: -I
            # implies -E, which ignores every PYTHON* variable. Without the
            # explicit -u, stdout is block-buffered, and a program that prints
            # and then hangs loses its output when the timeout kills it — the
            # exact program a beginner writes by accident.
            [sys.executable, "-I", "-u", "-B", runner_path, code_path],
            cwd=workspace,
            env=environment,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            errors="replace",
        )

        # Pipes are drained by background readers rather than by
        # `communicate(timeout=...)`. Two reasons, both of which showed up as
        # failing tests: `communicate` discards whatever it had already read
        # when it raises TimeoutExpired, so a program that printed something
        # and then hung returned nothing — exactly the program a beginner
        # writes; and a program printing without pause fills the pipe buffer
        # and blocks, so the cap has to be applied while it runs, not after.
        stdout_reader = _StreamReader(process.stdout)
        stderr_reader = _StreamReader(process.stderr)
        stdout_reader.start()
        stderr_reader.start()

        if stdin:
            try:
                process.stdin.write(stdin)
            except (BrokenPipeError, ValueError):
                pass
        try:
            process.stdin.close()
        except (BrokenPipeError, ValueError):
            pass

        killed: KilledReason | None = None
        try:
            process.wait(timeout=timeout_ms / 1000)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()
            killed = "timeout"

        stdout_reader.join(timeout=2)
        stderr_reader.join(timeout=2)

        duration_ms = int((time.monotonic() - started) * 1000)

        stdout = stdout_reader.text()
        stderr = stderr_reader.text()
        stdout_truncated = stdout_reader.truncated

        if killed == "timeout":
            stderr = (
                f"{stderr}\nThis program took too long and was stopped after "
                f"{timeout_ms / 1000:.0f} seconds. A loop that never ends is the usual cause."
            ).strip()

        if stdout_truncated:
            stderr = (
                f"{stderr}\nThe output was truncated — this program printed more than a lesson shows."
            ).strip()

        if process.returncode not in (0, None) and "MemoryError" in stderr:
            killed = "memory"

        return RunResult(
            ok=killed is None and process.returncode == 0,
            stdout=stdout,
            stderr=stderr,
            exit_code=process.returncode,
            duration_ms=duration_ms,
            truncated=stdout_truncated,
            killed_reason=killed,
        )
    finally:
        # Each run starts from nothing, so a file written by one program is
        # never visible to the next.
        shutil.rmtree(workspace, ignore_errors=True)
