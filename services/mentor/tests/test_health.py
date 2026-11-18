import os

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_reports_ok_without_a_token():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["ok"] is True


def test_health_reports_a_version():
    assert response_version(client.get("/health").json())


def response_version(payload):
    return payload.get("version")


def test_an_authenticated_route_refuses_a_missing_token(monkeypatch):
    monkeypatch.setenv("CONDUCTOR_TOKEN", "secret-token")
    assert client.get("/whoami").status_code == 401


def test_an_authenticated_route_refuses_a_wrong_token(monkeypatch):
    monkeypatch.setenv("CONDUCTOR_TOKEN", "secret-token")
    response = client.get("/whoami", headers={"X-Conductor-Token": "wrong"})
    assert response.status_code == 401


def test_an_authenticated_route_accepts_the_right_token(monkeypatch):
    monkeypatch.setenv("CONDUCTOR_TOKEN", "secret-token")
    response = client.get("/whoami", headers={"X-Conductor-Token": "secret-token"})
    assert response.status_code == 200


def test_routes_are_refused_when_no_token_is_configured(monkeypatch):
    monkeypatch.delenv("CONDUCTOR_TOKEN", raising=False)
    assert client.get("/whoami", headers={"X-Conductor-Token": "anything"}).status_code == 503


def test_interactive_docs_are_not_exposed():
    assert client.get("/docs").status_code == 404


def test_run_python_endpoint_returns_200_for_a_crashing_program(monkeypatch):
    monkeypatch.setenv("CONDUCTOR_TOKEN", "secret-token")
    response = client.post(
        "/run/python",
        json={"code": "print(missing)"},
        headers={"X-Conductor-Token": "secret-token"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is False
    assert "NameError" in body["stderr"]


def test_run_python_endpoint_requires_the_token():
    assert client.post("/run/python", json={"code": "print(1)"}).status_code in (401, 503)


def test_run_python_endpoint_uses_camel_case_for_the_renderer(monkeypatch):
    monkeypatch.setenv("CONDUCTOR_TOKEN", "secret-token")
    body = client.post(
        "/run/python",
        json={"code": "print(1)"},
        headers={"X-Conductor-Token": "secret-token"},
    ).json()
    assert set(body) == {"ok", "stdout", "stderr", "exitCode", "durationMs", "truncated", "killedReason"}
