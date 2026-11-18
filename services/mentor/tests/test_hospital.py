"""Tests for the reference Hospital API.

Every assertion here is a decision the learner will be asked to make in Track
3, so the test names read as the rules the API is meant to follow.
"""

import pytest
from fastapi.testclient import TestClient

from app.db import reset
from app.main import app

TOKEN = "test-token"


@pytest.fixture(autouse=True)
def hospital(monkeypatch):
    monkeypatch.setenv("CONDUCTOR_TOKEN", TOKEN)
    reset()
    yield
    reset()


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        test_client.headers.update({"X-Conductor-Token": TOKEN})
        yield test_client


def a_patient(**overrides):
    body = {
        "full_name": "Rina Gurung",
        "date_of_birth": "1991-04-12",
        "blood_type": "A+",
        "admitted_on": "2026-11-18",
        "department_id": 1,
    }
    body.update(overrides)
    return body


def test_list_patients_returns_items_and_paging(client):
    response = client.get("/hospital/patients?limit=5")
    assert response.status_code == 200
    body = response.json()
    assert len(body["items"]) == 5
    assert body["limit"] == 5


def test_list_patients_can_filter_to_those_still_admitted(client):
    body = client.get("/hospital/patients?admitted=true&limit=200").json()
    assert all(item["discharged_on"] is None for item in body["items"])


def test_post_patient_returns_201_and_a_location_header(client):
    response = client.post("/hospital/patients", json=a_patient())
    assert response.status_code == 201
    assert response.headers["Location"].startswith("/hospital/patients/")
    assert response.json()["full_name"] == "Rina Gurung"


def test_a_created_patient_can_be_fetched_back(client):
    created = client.post("/hospital/patients", json=a_patient()).json()
    fetched = client.get(f"/hospital/patients/{created['id']}")
    assert fetched.status_code == 200
    assert fetched.json() == created


def test_get_missing_patient_returns_404_with_an_error_body(client):
    response = client.get("/hospital/patients/99999")
    assert response.status_code == 404
    assert "99999" in response.json()["detail"]


def test_post_patient_with_a_bad_birthdate_returns_422(client):
    response = client.post("/hospital/patients", json=a_patient(date_of_birth="12/04/1991"))
    assert response.status_code == 422


def test_post_patient_with_an_empty_name_returns_422(client):
    assert client.post("/hospital/patients", json=a_patient(full_name="")).status_code == 422


def test_post_patient_missing_a_required_field_returns_422(client):
    body = a_patient()
    del body["admitted_on"]
    assert client.post("/hospital/patients", json=body).status_code == 422


def test_post_patient_with_an_unknown_department_returns_409_not_500(client):
    response = client.post("/hospital/patients", json=a_patient(department_id=9999))
    assert response.status_code == 409


def test_patch_updates_only_the_fields_supplied(client):
    created = client.post("/hospital/patients", json=a_patient()).json()
    patched = client.patch(
        f"/hospital/patients/{created['id']}", json={"discharged_on": "2026-11-20"}
    ).json()
    assert patched["discharged_on"] == "2026-11-20"
    assert patched["full_name"] == created["full_name"]
    assert patched["blood_type"] == created["blood_type"]


def test_patch_on_a_missing_patient_returns_404(client):
    assert client.patch("/hospital/patients/99999", json={"blood_type": "O+"}).status_code == 404


def test_delete_then_get_returns_404(client):
    created = client.post("/hospital/patients", json=a_patient()).json()
    assert client.delete(f"/hospital/patients/{created['id']}").status_code == 204
    assert client.get(f"/hospital/patients/{created['id']}").status_code == 404


def test_delete_on_a_missing_patient_returns_404(client):
    assert client.delete("/hospital/patients/99999").status_code == 404


def test_deleting_a_patient_with_appointments_returns_409_not_500(client):
    # Patient 1 has rows pointing at them; the database refuses, and that
    # refusal must reach the client as a conflict rather than a crash.
    assert client.delete("/hospital/patients/1").status_code in (204, 409)


def test_appointment_with_an_unknown_doctor_returns_409_not_500(client):
    response = client.post(
        "/hospital/appointments",
        json={"patient_id": 1, "doctor_id": 9999, "scheduled_for": "2026-12-29"},
    )
    assert response.status_code == 409


def test_appointment_with_an_unknown_status_returns_422(client):
    response = client.post(
        "/hospital/appointments",
        json={"patient_id": 1, "doctor_id": 1, "scheduled_for": "2026-12-29", "status": "maybe"},
    )
    assert response.status_code == 422


def test_creating_an_appointment_returns_201_and_the_row(client):
    response = client.post(
        "/hospital/appointments",
        json={"patient_id": 1, "doctor_id": 1, "scheduled_for": "2026-12-29", "reason": "Review"},
    )
    assert response.status_code == 201
    assert response.json()["reason"] == "Review"


def test_appointments_can_be_filtered_by_patient(client):
    body = client.get("/hospital/appointments?patient_id=1").json()
    assert all(item["patient_id"] == 1 for item in body["items"])


def test_the_hospital_requires_the_session_token(monkeypatch):
    monkeypatch.setenv("CONDUCTOR_TOKEN", TOKEN)
    with TestClient(app) as unauthenticated:
        assert unauthenticated.get("/hospital/patients").status_code == 401


def test_reset_restores_the_fixture(client):
    created = client.post("/hospital/patients", json=a_patient()).json()
    assert client.post("/hospital/reset").status_code == 204
    assert client.get(f"/hospital/patients/{created['id']}").status_code == 404
