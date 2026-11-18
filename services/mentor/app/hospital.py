"""The reference Hospital API.

This is the API the learner builds in Track 3, written out properly, so the
lessons have something real to compare against and the grader has a known-good
implementation to describe. Every choice here is one the learner will be asked
to make and defend:

  * 201 with a Location header on create, not 200 with a body and a shrug
  * 404 for a row that is not there, 422 for a body that is malformed
  * 409 when a foreign key refuses, because that is the client's mistake, not
    a server fault — and a 500 would tell them the opposite
"""

from __future__ import annotations

import sqlite3
from datetime import date

from fastapi import APIRouter, HTTPException, Response, status
from pydantic import BaseModel, Field, field_validator

from .db import get_connection, reset, rows_to_dicts

router = APIRouter(prefix="/hospital")


def _iso_date(value: str, field: str) -> str:
    try:
        date.fromisoformat(value)
    except ValueError as error:
        raise ValueError(f"{field} must be a date like 2026-11-18") from error
    return value


class PatientIn(BaseModel):
    full_name: str = Field(min_length=1, max_length=120)
    date_of_birth: str
    blood_type: str | None = Field(default=None, max_length=3)
    admitted_on: str
    discharged_on: str | None = None
    department_id: int | None = None

    @field_validator("date_of_birth", "admitted_on")
    @classmethod
    def _valid_required_date(cls, value: str) -> str:
        return _iso_date(value, "date")

    @field_validator("discharged_on")
    @classmethod
    def _valid_optional_date(cls, value: str | None) -> str | None:
        return None if value is None else _iso_date(value, "discharged_on")


class PatientPatch(BaseModel):
    full_name: str | None = Field(default=None, min_length=1, max_length=120)
    blood_type: str | None = Field(default=None, max_length=3)
    discharged_on: str | None = None
    department_id: int | None = None


class AppointmentIn(BaseModel):
    patient_id: int
    doctor_id: int
    scheduled_for: str
    status: str = "booked"
    reason: str | None = None

    @field_validator("scheduled_for")
    @classmethod
    def _valid_date(cls, value: str) -> str:
        return _iso_date(value, "scheduled_for")

    @field_validator("status")
    @classmethod
    def _known_status(cls, value: str) -> str:
        allowed = {"booked", "attended", "missed", "cancelled"}
        if value not in allowed:
            raise ValueError(f"status must be one of {sorted(allowed)}")
        return value


def _not_found(what: str, identifier: int) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f"No {what} with id {identifier}.",
    )


# ── patients ──────────────────────────────────────────────────────────────


@router.get("/patients")
def list_patients(limit: int = 50, offset: int = 0, admitted: bool | None = None) -> dict:
    connection = get_connection()
    query = "SELECT * FROM patients"
    params: list[object] = []
    if admitted is True:
        query += " WHERE discharged_on IS NULL"
    elif admitted is False:
        query += " WHERE discharged_on IS NOT NULL"
    query += " ORDER BY id LIMIT ? OFFSET ?"
    params.extend([max(1, min(limit, 200)), max(0, offset)])

    rows = connection.execute(query, params).fetchall()
    return {"items": rows_to_dicts(rows), "limit": limit, "offset": offset}


@router.get("/patients/{patient_id}")
def get_patient(patient_id: int) -> dict:
    row = get_connection().execute(
        "SELECT * FROM patients WHERE id = ?", (patient_id,)
    ).fetchone()
    if row is None:
        raise _not_found("patient", patient_id)
    return dict(row)


@router.post("/patients", status_code=status.HTTP_201_CREATED)
def create_patient(patient: PatientIn, response: Response) -> dict:
    connection = get_connection()
    try:
        cursor = connection.execute(
            """
            INSERT INTO patients
                (full_name, date_of_birth, blood_type, admitted_on, discharged_on, department_id)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                patient.full_name,
                patient.date_of_birth,
                patient.blood_type,
                patient.admitted_on,
                patient.discharged_on,
                patient.department_id,
            ),
        )
        connection.commit()
    except sqlite3.IntegrityError as error:
        # The client pointed at a department that does not exist. That is a
        # conflict with the current state, not a server fault.
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(error)) from error

    # Location tells the client where the thing it just made now lives, so it
    # does not have to guess the URL.
    response.headers["Location"] = f"/hospital/patients/{cursor.lastrowid}"
    return get_patient(int(cursor.lastrowid))


@router.patch("/patients/{patient_id}")
def update_patient(patient_id: int, patch: PatientPatch) -> dict:
    connection = get_connection()
    existing = connection.execute(
        "SELECT * FROM patients WHERE id = ?", (patient_id,)
    ).fetchone()
    if existing is None:
        raise _not_found("patient", patient_id)

    # Only fields actually present in the request are touched: a PATCH that
    # silently blanked everything the client left out would be a data-loss bug.
    fields = patch.model_dump(exclude_unset=True)
    if not fields:
        return dict(existing)

    assignments = ", ".join(f"{name} = ?" for name in fields)
    try:
        connection.execute(
            f"UPDATE patients SET {assignments} WHERE id = ?",
            [*fields.values(), patient_id],
        )
        connection.commit()
    except sqlite3.IntegrityError as error:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(error)) from error

    return get_patient(patient_id)


@router.delete("/patients/{patient_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_patient(patient_id: int) -> Response:
    connection = get_connection()
    existing = connection.execute(
        "SELECT id FROM patients WHERE id = ?", (patient_id,)
    ).fetchone()
    if existing is None:
        raise _not_found("patient", patient_id)

    try:
        connection.execute("DELETE FROM patients WHERE id = ?", (patient_id,))
        connection.commit()
    except sqlite3.IntegrityError as error:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This patient still has appointments or prescriptions pointing at them.",
        ) from error

    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ── doctors and departments ───────────────────────────────────────────────


@router.get("/doctors")
def list_doctors() -> dict:
    rows = get_connection().execute("SELECT * FROM doctors ORDER BY id").fetchall()
    return {"items": rows_to_dicts(rows)}


@router.get("/doctors/{doctor_id}")
def get_doctor(doctor_id: int) -> dict:
    row = get_connection().execute("SELECT * FROM doctors WHERE id = ?", (doctor_id,)).fetchone()
    if row is None:
        raise _not_found("doctor", doctor_id)
    return dict(row)


@router.get("/departments")
def list_departments() -> dict:
    rows = get_connection().execute("SELECT * FROM departments ORDER BY id").fetchall()
    return {"items": rows_to_dicts(rows)}


# ── appointments ──────────────────────────────────────────────────────────


@router.get("/appointments")
def list_appointments(patient_id: int | None = None, status_filter: str | None = None) -> dict:
    query = "SELECT * FROM appointments"
    clauses: list[str] = []
    params: list[object] = []
    if patient_id is not None:
        clauses.append("patient_id = ?")
        params.append(patient_id)
    if status_filter is not None:
        clauses.append("status = ?")
        params.append(status_filter)
    if clauses:
        query += " WHERE " + " AND ".join(clauses)
    query += " ORDER BY id"

    rows = get_connection().execute(query, params).fetchall()
    return {"items": rows_to_dicts(rows)}


@router.post("/appointments", status_code=status.HTTP_201_CREATED)
def create_appointment(appointment: AppointmentIn, response: Response) -> dict:
    connection = get_connection()
    try:
        cursor = connection.execute(
            """
            INSERT INTO appointments (patient_id, doctor_id, scheduled_for, status, reason)
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                appointment.patient_id,
                appointment.doctor_id,
                appointment.scheduled_for,
                appointment.status,
                appointment.reason,
            ),
        )
        connection.commit()
    except sqlite3.IntegrityError as error:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="That patient or doctor does not exist.",
        ) from error

    response.headers["Location"] = f"/hospital/appointments/{cursor.lastrowid}"
    row = connection.execute(
        "SELECT * FROM appointments WHERE id = ?", (cursor.lastrowid,)
    ).fetchone()
    return dict(row)


@router.post("/reset", status_code=status.HTTP_204_NO_CONTENT)
def reset_hospital() -> Response:
    """Rebuilds the hospital. The learner is meant to break things."""
    reset()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
