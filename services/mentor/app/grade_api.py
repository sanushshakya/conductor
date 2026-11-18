"""Grades the learner's own API by making real HTTP requests to it.

Track 3's boss is not "write code that looks like an API". It is "run a server
that behaves correctly", and the only honest way to check that is to be a
client: connect over TCP, send real requests, read real responses. Everything
this module asserts is something a real caller of their API would experience.

The suites are sequences rather than independent checks because CRUD is a
sequence — you cannot test that a delete works without having created
something first — and because the learner should see their criteria complete
in the order the lessons taught them.
"""

from __future__ import annotations

import ipaddress
from dataclasses import dataclass, field
from typing import Any, Callable
from urllib.parse import urlparse

import httpx
from pydantic import BaseModel

REQUEST_TIMEOUT_SECONDS = 5.0


class GradeApiRequest(BaseModel):
    base_url: str
    suite_id: str


@dataclass
class Step:
    id: str
    label: str
    method: str
    path: str
    expect_status: int | tuple[int, ...]
    json_body: dict[str, Any] | None = None
    #: Receives the decoded response and the running context. Returns an error
    #: string, or None when the step is satisfied.
    check: Callable[[httpx.Response, dict[str, Any]], str | None] | None = None
    #: Stores something from the response for later steps to use.
    capture: Callable[[httpx.Response, dict[str, Any]], None] | None = None
    headers: dict[str, str] = field(default_factory=dict)


class CheckResult(BaseModel):
    id: str
    label: str
    passed: bool
    detail: str | None = None


def _is_loopback(url: str) -> bool:
    """True only for a URL pointing at this machine.

    The grader makes arbitrary requests to whatever it is handed. Pointed at a
    public address it would be a request forger running inside the learner's
    app, so the check is a security boundary rather than a convenience.
    """
    try:
        parsed = urlparse(url)
    except ValueError:
        return False
    if parsed.scheme not in ("http", "https"):
        return False
    host = parsed.hostname
    if host is None:
        return False
    if host == "localhost":
        return True
    try:
        return ipaddress.ip_address(host).is_loopback
    except ValueError:
        return False


def _expect_created_patient(response: httpx.Response, context: dict[str, Any]) -> str | None:
    body = response.json()
    if body.get("full_name") != context["new_name"]:
        return f"The created patient came back with full_name {body.get('full_name')!r}."
    if "id" not in body:
        return "The response has no id, so the client cannot refer to the patient it just made."
    return None


def _capture_patient_id(response: httpx.Response, context: dict[str, Any]) -> None:
    context["patient_id"] = response.json().get("id")


def _expect_list_shape(response: httpx.Response, _context: dict[str, Any]) -> str | None:
    body = response.json()
    if isinstance(body, list):
        return None
    if isinstance(body, dict) and isinstance(body.get("items"), list):
        return None
    return "Expected a list of patients, or an object with an 'items' list."


def _expect_patched(response: httpx.Response, _context: dict[str, Any]) -> str | None:
    body = response.json()
    if body.get("blood_type") != "O-":
        return f"blood_type is {body.get('blood_type')!r} after the update."
    if body.get("full_name") in (None, ""):
        return "full_name was lost by the update — a PATCH must leave untouched fields alone."
    return None


def hospital_crud_suite() -> list[Step]:
    return [
        Step(
            id="list",
            label="GET /patients returns a list",
            method="GET",
            path="/patients",
            expect_status=200,
            check=_expect_list_shape,
        ),
        Step(
            id="create",
            label="POST /patients creates a patient and returns 201",
            method="POST",
            path="/patients",
            json_body={
                "full_name": "Grader Test Patient",
                "date_of_birth": "1990-01-01",
                "blood_type": "A+",
                "admitted_on": "2026-11-18",
                "department_id": 1,
            },
            expect_status=201,
            check=_expect_created_patient,
            capture=_capture_patient_id,
        ),
        Step(
            id="read-back",
            label="GET /patients/{id} returns the patient just created",
            method="GET",
            path="/patients/{patient_id}",
            expect_status=200,
            check=_expect_created_patient,
        ),
        Step(
            id="missing",
            label="GET a patient that does not exist returns 404",
            method="GET",
            path="/patients/999999",
            expect_status=404,
        ),
        Step(
            id="validation",
            label="POST with an invalid date returns 422",
            method="POST",
            path="/patients",
            json_body={
                "full_name": "Bad Date",
                "date_of_birth": "01/01/1990",
                "admitted_on": "2026-11-18",
            },
            expect_status=422,
        ),
        Step(
            id="update",
            label="PATCH /patients/{id} changes only what was sent",
            method="PATCH",
            path="/patients/{patient_id}",
            json_body={"blood_type": "O-"},
            expect_status=200,
            check=_expect_patched,
        ),
        Step(
            id="delete",
            label="DELETE /patients/{id} removes the patient",
            method="DELETE",
            path="/patients/{patient_id}",
            expect_status=(200, 204),
        ),
        Step(
            id="gone",
            label="GET after DELETE returns 404",
            method="GET",
            path="/patients/{patient_id}",
            expect_status=404,
        ),
    ]


SUITES: dict[str, Callable[[], list[Step]]] = {
    "hospital-crud": hospital_crud_suite,
}


def grade_api(base_url: str, suite_id: str) -> dict[str, Any]:
    """Runs a suite against the learner's server and reports what happened."""
    if not _is_loopback(base_url):
        return {
            "reachable": False,
            "checks": [
                CheckResult(
                    id="address",
                    label="The server address is on this machine",
                    passed=False,
                    detail="Grading only talks to a server running on your own computer.",
                ).model_dump()
            ],
        }

    suite_factory = SUITES.get(suite_id)
    if suite_factory is None:
        return {
            "reachable": False,
            "checks": [
                CheckResult(
                    id="suite",
                    label="Known exercise",
                    passed=False,
                    detail=f"There is no grading suite called {suite_id!r}.",
                ).model_dump()
            ],
        }

    base = base_url.rstrip("/")
    context: dict[str, Any] = {"new_name": "Grader Test Patient"}
    checks: list[CheckResult] = []

    with httpx.Client(timeout=REQUEST_TIMEOUT_SECONDS) as client:
        try:
            client.get(f"{base}/patients")
        except httpx.RequestError:
            return {
                "reachable": False,
                "checks": [
                    CheckResult(
                        id="connection",
                        label="Your server is running and accepting requests",
                        passed=False,
                        detail=(
                            f"Nothing answered at {base}. Start your server, then check the "
                            "address and port match what you told the grader."
                        ),
                    ).model_dump()
                ],
            }

        for step in suite_factory():
            try:
                path = step.path.format(**{k: v for k, v in context.items()})
            except KeyError:
                checks.append(
                    CheckResult(
                        id=step.id,
                        label=step.label,
                        passed=False,
                        detail="An earlier step did not produce an id for this one to use.",
                    )
                )
                continue

            try:
                response = client.request(
                    step.method,
                    f"{base}{path}",
                    json=step.json_body,
                    headers=step.headers or None,
                )
            except httpx.RequestError as error:
                checks.append(
                    CheckResult(
                        id=step.id,
                        label=step.label,
                        passed=False,
                        detail=f"The request could not be completed: {error.__class__.__name__}.",
                    )
                )
                continue

            expected = (
                step.expect_status
                if isinstance(step.expect_status, tuple)
                else (step.expect_status,)
            )
            if response.status_code not in expected:
                checks.append(
                    CheckResult(
                        id=step.id,
                        label=step.label,
                        passed=False,
                        detail=(
                            f"Expected status {' or '.join(str(s) for s in expected)}, "
                            f"got {response.status_code}."
                        ),
                    )
                )
                continue

            problem: str | None = None
            if step.check is not None:
                try:
                    problem = step.check(response, context)
                except Exception:  # noqa: BLE001 - a body that will not decode is the finding
                    problem = "The response body was not the JSON this step expected."

            if problem is None and step.capture is not None:
                try:
                    step.capture(response, context)
                except Exception:  # noqa: BLE001
                    problem = "The response did not contain the id this step needed."

            checks.append(
                CheckResult(id=step.id, label=step.label, passed=problem is None, detail=problem)
            )

    return {"reachable": True, "checks": [c.model_dump() for c in checks]}
