import sqlite3
import uuid
from typing import Any

from fastapi import HTTPException, status

from ..auth import get_user_by_id, hash_password
from ..db import get_db
from ..schemas import UserUpdate
from ..serializers import row_to_user
from ..utils import now_iso


def create_user_record(username: str, password: str, name: str, is_admin: bool) -> dict[str, Any]:
    user_id = str(uuid.uuid4())
    timestamp = now_iso()
    password_hash = hash_password(password)
    try:
        with get_db() as conn:
            conn.execute(
                "INSERT INTO users (id, username, password_hash, name, is_admin, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                (user_id, username.strip(), password_hash, name.strip(), int(is_admin), timestamp),
            )
            conn.execute("INSERT INTO settings (user_id, theme) VALUES (?, ?)", (user_id, "rose"))
    except sqlite3.IntegrityError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username already exists") from exc
    user = get_user_by_id(user_id)
    assert user is not None
    return row_to_user(user)


def list_user_records() -> list[dict[str, Any]]:
    with get_db() as conn:
        rows = conn.execute("SELECT * FROM users ORDER BY is_admin DESC, created_at ASC").fetchall()
    return [row_to_user(row) for row in rows]


def update_user_record(user_id: str, payload: UserUpdate, allow_admin_change: bool) -> dict[str, Any]:
    user = get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    username = payload.username.strip() if payload.username is not None else user["username"]
    name = payload.name.strip() if payload.name is not None else user["name"]
    is_admin = int(payload.is_admin) if allow_admin_change and payload.is_admin is not None else user["is_admin"]
    password_hash = hash_password(payload.password) if payload.password else user["password_hash"]
    try:
        with get_db() as conn:
            conn.execute(
                "UPDATE users SET username = ?, name = ?, is_admin = ?, password_hash = ? WHERE id = ?",
                (username, name, is_admin, password_hash, user_id),
            )
    except sqlite3.IntegrityError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username already exists") from exc
    updated = get_user_by_id(user_id)
    assert updated is not None
    return row_to_user(updated)


def delete_user_record(user_id: str, admin_id: str) -> None:
    if user_id == admin_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot delete yourself")
    with get_db() as conn:
        target = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        if not target:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
        if target["is_admin"]:
            admin_count = conn.execute("SELECT COUNT(*) AS count FROM users WHERE is_admin = 1").fetchone()["count"]
            if admin_count <= 1:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="At least one admin is required")
        conn.execute("DELETE FROM users WHERE id = ?", (user_id,))
