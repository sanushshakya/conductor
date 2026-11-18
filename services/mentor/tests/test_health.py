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
