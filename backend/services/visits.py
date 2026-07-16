import sqlite3
import uuid
from typing import Any

from fastapi import HTTPException, Response, status

from ..db import get_db
from ..schemas import VisitCreate, VisitUpdate
from ..serializers import row_to_visit
from ..utils import now_iso


def list_visit_records(user_id: str) -> list[dict[str, Any]]:
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM visits WHERE user_id = ? ORDER BY last_stay_date DESC, created_at DESC",
            (user_id,),
        ).fetchall()
    return [row_to_visit(row) for row in rows]


def create_visit_record(payload: VisitCreate, user_id: str) -> dict[str, Any]:
    timestamp = now_iso()
    visit_id = str(uuid.uuid4())
    with get_db() as conn:
        conn.execute(
            "INSERT INTO visits (id, user_id, city_id, duration_days, last_stay_date, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (visit_id, user_id, payload.city_id, payload.duration_days, payload.last_stay_date,
             payload.notes, timestamp, timestamp),
        )
        row = conn.execute("SELECT * FROM visits WHERE id = ?", (visit_id,)).fetchone()
    return row_to_visit(row)


def update_visit_record(visit_id: str, payload: VisitUpdate, user_id: str) -> dict[str, Any]:
    with get_db() as conn:
        existing = conn.execute(
            "SELECT * FROM visits WHERE id = ? AND user_id = ?", (visit_id, user_id)
        ).fetchone()
        if not existing:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Visit not found")
        duration = payload.duration_days if payload.duration_days is not None else existing["duration_days"]
        last_stay = payload.last_stay_date if payload.last_stay_date is not None else existing["last_stay_date"]
        notes = payload.notes if "notes" in payload.model_fields_set else existing["notes"]
        conn.execute(
            "UPDATE visits SET city_id = ?, duration_days = ?, last_stay_date = ?, notes = ?, updated_at = ? WHERE id = ? AND user_id = ?",
            (payload.city_id or existing["city_id"], duration, last_stay,
             notes,
             now_iso(), visit_id, user_id),
        )
        row = conn.execute("SELECT * FROM visits WHERE id = ? AND user_id = ?", (visit_id, user_id)).fetchone()
    return row_to_visit(row)


def delete_visit_record(visit_id: str, user_id: str) -> Response:
    with get_db() as conn:
        existing = conn.execute(
            "SELECT id FROM visits WHERE id = ? AND user_id = ?", (visit_id, user_id)
        ).fetchone()
        if not existing:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Visit not found")
        conn.execute("DELETE FROM visits WHERE id = ? AND user_id = ?", (visit_id, user_id))
    return Response(status_code=status.HTTP_204_NO_CONTENT)
