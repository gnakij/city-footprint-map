import sqlite3
import uuid
from typing import Any

from fastapi import HTTPException, Response, status

from ..db import get_db
from ..schemas import AdminDataExportPayload, AdminDataImportPayload, ImportPayload
from ..serializers import row_to_visit
from ..utils import now_iso
from ..validation import normalize_import_visit, validate_theme


def export_user_data(user: sqlite3.Row) -> dict[str, Any]:
    with get_db() as conn:
        visits = [row_to_visit(row) for row in conn.execute(
            "SELECT * FROM visits WHERE user_id = ? ORDER BY last_stay_date DESC", (user["id"],)
        ).fetchall()]
        achievements = [
            row["achievement_id"]
            for row in conn.execute("SELECT achievement_id FROM achievements WHERE user_id = ?", (user["id"],)).fetchall()
        ]
        settings = conn.execute("SELECT theme FROM settings WHERE user_id = ?", (user["id"],)).fetchone()
    return {
        "version": "3.0.0",
        "exported_at": now_iso(),
        "visits": visits,
        "achievements": achievements,
        "settings": {"theme": settings["theme"] if settings else "rose"},
    }


def import_user_data(payload: ImportPayload, user: sqlite3.Row) -> dict[str, Any]:
    normalized_visits = [normalize_import_visit(visit, index) for index, visit in enumerate(payload.visits)]
    try:
        theme = validate_theme(payload.settings.get("theme", "rose") if isinstance(payload.settings, dict) else "rose")
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc

    with get_db() as conn:
        for visit in normalized_visits:
            timestamp = now_iso()
            conn.execute(
                "INSERT OR REPLACE INTO visits (id, user_id, city_id, duration_days, last_stay_date, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (visit["id"], user["id"], visit["city_id"],
                 visit["duration_days"], visit["last_stay_date"], visit["notes"],
                 visit.get("created_at") or timestamp, visit.get("updated_at") or timestamp),
            )
        for achievement_id in payload.achievements:
            conn.execute(
                "INSERT OR IGNORE INTO achievements (id, user_id, achievement_id, unlocked_at) VALUES (?, ?, ?, ?)",
                (str(uuid.uuid4()), user["id"], achievement_id, now_iso()),
            )
        conn.execute("INSERT OR REPLACE INTO settings (user_id, theme) VALUES (?, ?)", (user["id"], theme))
    return export_user_data(user)


def export_admin_data(payload: AdminDataExportPayload) -> dict[str, Any]:
    if not payload.user_ids:
        return {"visits": []}

    placeholders = ",".join("?" for _ in payload.user_ids)
    with get_db() as conn:
        rows = conn.execute(
            f"""
            SELECT visits.*, users.username, users.name
            FROM visits
            JOIN users ON users.id = visits.user_id
            WHERE visits.user_id IN ({placeholders})
            ORDER BY users.username ASC, visits.last_stay_date DESC, visits.created_at DESC
            """,
            tuple(payload.user_ids),
        ).fetchall()

    visits = []
    for row in rows:
        visit = row_to_visit(row)
        visit["user_id"] = row["user_id"]
        visit["username"] = row["username"]
        visit["name"] = row["name"]
        visits.append(visit)
    return {"visits": visits}


def import_admin_data(payload: AdminDataImportPayload) -> dict[str, int]:
    timestamp = now_iso()
    with get_db() as conn:
        target = conn.execute("SELECT id FROM users WHERE id = ?", (payload.user_id,)).fetchone()
        if not target:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
        for visit in payload.visits:
            conn.execute(
                "INSERT OR REPLACE INTO visits (id, user_id, city_id, duration_days, last_stay_date, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    str(uuid.uuid4()),
                    payload.user_id,
                    visit.city_id,
                    visit.duration_days,
                    visit.last_stay_date,
                    visit.notes.strip() if visit.notes else None,
                    timestamp,
                    timestamp,
                ),
            )
    return {"inserted_count": len(payload.visits)}


def clear_user_data(user_id: str) -> Response:
    with get_db() as conn:
        conn.execute("DELETE FROM visits WHERE user_id = ?", (user_id,))
        conn.execute("DELETE FROM achievements WHERE user_id = ?", (user_id,))
    return Response(status_code=status.HTTP_204_NO_CONTENT)
