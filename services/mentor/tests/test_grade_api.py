"""Tests for grading the learner's own API.

The grader is tested against a real server on a real port, because that is
what it does in use — a test that stubbed HTTP would prove nothing about the
thing most likely to go wrong.
"""

import socket
import threading
import time

import pytest
import uvicorn
from fastapi import FastAPI

from app.db import reset
from app.grade_api import grade_api
from app.hospital import router as hospital_router


def free_port() -> int:
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        return probe.getsockname()[1]


class ServerThread(threading.Thread):
    def __init__(self, app: FastAPI, port: int) -> None:
        super().__init__(daemon=True)
        self.server = uvicorn.Server(
            uvicorn.Config(app, host="127.0.0.1", port=port, log_level="error")
        )

    def run(self) -> None:
        self.server.run()

    def wait_until_ready(self, timeout: float = 10.0) -> None:
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            if self.server.started:
                return
            time.sleep(0.05)
        raise TimeoutError("test server did not start")

    def shutdown(self) -> None:
        self.server.should_exit = True
        self.join(timeout=10)


@pytest.fixture
def correct_server():
    """A server that behaves exactly as Track 3 asks."""
    reset()
    app = FastAPI()
    app.include_router(hospital_router)
    port = free_port()
    thread = ServerThread(app, port)
    thread.start()
    thread.wait_until_ready()
    yield f"http://127.0.0.1:{port}/hospital"
    thread.shutdown()
    reset()


@pytest.fixture
def broken_server():
    """A server that returns 200 for everything, as a half-finished one does."""
    reset()
    app = FastAPI()

    @app.get("/patients")
    def list_patients():
        return []

    @app.get("/patients/{patient_id}")
    def get_patient(patient_id: int):
        return {"id": patient_id, "full_name": "Anyone"}

    @app.post("/patients")
    def create_patient(body: dict):
        return {"id": 1, **body}

    port = free_port()
    thread = ServerThread(app, port)
    thread.start()
    thread.wait_until_ready()
    yield f"http://127.0.0.1:{port}"
    thread.shutdown()


def test_grade_api_marks_every_criterion_when_the_learner_server_is_correct(correct_server):
    result = grade_api(correct_server, "hospital-crud")
    assert result["reachable"] is True
    failed = [c for c in result["checks"] if not c["passed"]]
    assert failed == [], failed
    assert len(result["checks"]) == 8


def test_grade_api_fails_a_server_that_returns_200_for_everything(broken_server):
    result = grade_api(broken_server, "hospital-crud")
    assert result["reachable"] is True
    assert any(not c["passed"] for c in result["checks"])


def test_a_broken_server_still_reports_which_criteria_did_pass(broken_server):
    result = grade_api(broken_server, "hospital-crud")
    assert any(c["passed"] for c in result["checks"])


def test_grade_api_returns_a_connection_check_failure_when_nothing_is_listening():
    result = grade_api(f"http://127.0.0.1:{free_port()}", "hospital-crud")
    assert result["reachable"] is False
    assert result["checks"][0]["id"] == "connection"
    assert "Start your server" in result["checks"][0]["detail"]


def test_grade_api_refuses_a_base_url_that_is_not_loopback():
    for url in (
        "http://example.com",
        "http://169.254.169.254",
        "http://10.0.0.5:8000",
        "https://conductor.example.org/api",
    ):
        result = grade_api(url, "hospital-crud")
        assert result["reachable"] is False
        assert result["checks"][0]["id"] == "address"


def test_grade_api_accepts_localhost_and_loopback_literals():
    # These do not answer, so they fail at the connection step rather than the
    # address step — which is the proof the address check let them through.
    for url in (f"http://localhost:{free_port()}", f"http://127.0.0.1:{free_port()}"):
        assert grade_api(url, "hospital-crud")["checks"][0]["id"] == "connection"


def test_grade_api_rejects_an_unknown_suite():
    result = grade_api("http://127.0.0.1:1", "not-a-real-suite")
    assert result["checks"][0]["id"] == "suite"


def test_grade_api_refuses_a_non_http_scheme():
    assert grade_api("file:///etc/passwd", "hospital-crud")["checks"][0]["id"] == "address"


def test_the_suite_registry_matches_the_shared_constant():
    """Pins the set of suites the TypeScript side believes exists.

    `API_SUITE_IDS` in packages/shared/src/ipc.ts carries the same list, and
    the content harness checks every `api-suite` grader against it. Adding a
    suite means changing both, and this test is the reminder.
    """
    from app.grade_api import SUITES

    assert set(SUITES) == {"hospital-crud"}
