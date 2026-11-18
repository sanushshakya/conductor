"""The hospital database, for the reference API.

Track 3 is about putting a database on the internet, so the API here is backed
by the *same* schema and the *same* rows the learner spent Track 2 querying.
The continuity is the point: by lesson 3.4 they recognise every column, and
the only new idea is HTTP.

Each process gets its own private copy, built in a temp file from the shared
fixture, so a learner who deletes every patient through the API is one restart
away from a clean hospital — and never affects Track 2's SQL playground, which
runs its own SQLite in the renderer.
"""

from __future__ import annotations

import os
import sqlite3
import tempfile
from pathlib import Path

_FIXTURE_NAME = "hospital.sql"
_connection: sqlite3.Connection | None = None
_db_path: str | None = None


def content_dir() -> Path:
    """Locates the curriculum directory.

    Electron passes it explicitly; when the sidecar is run directly (tests,
    development) it is found by walking up from this file.
    """
    from_env = os.environ.get("CONDUCTOR_CONTENT_DIR")
    if from_env and (Path(from_env) / "fixtures" / _FIXTURE_NAME).exists():
        return Path(from_env)

    here = Path(__file__).resolve()
    for parent in here.parents:
        candidate = parent / "content"
        if (candidate / "fixtures" / _FIXTURE_NAME).exists():
            return candidate

    raise FileNotFoundError("could not locate the content directory")


def _build() -> sqlite3.Connection:
    global _db_path

    fixture = (content_dir() / "fixtures" / _FIXTURE_NAME).read_text(encoding="utf-8")
    handle, path = tempfile.mkstemp(prefix="conductor-hospital-", suffix=".db")
    os.close(handle)
    _db_path = path

    connection = sqlite3.connect(path, check_same_thread=False)
    connection.row_factory = sqlite3.Row
    # Foreign keys are off by default in SQLite and must be enabled per
    # connection. Track 2 taught that constraints protect the data; an API that
    # quietly skipped them would contradict the lesson directly.
    connection.execute("PRAGMA foreign_keys = ON")
    connection.executescript(fixture)
    connection.commit()
    return connection


def get_connection() -> sqlite3.Connection:
    global _connection
    if _connection is None:
        _connection = _build()
    return _connection


def reset() -> None:
    """Rebuilds the database from the fixture."""
    global _connection
    if _connection is not None:
        _connection.close()
        _connection = None
    if _db_path and os.path.exists(_db_path):
        os.unlink(_db_path)
    get_connection()


def rows_to_dicts(rows) -> list[dict]:
    return [dict(row) for row in rows]
