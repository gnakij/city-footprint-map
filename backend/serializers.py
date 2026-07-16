import sqlite3
from typing import Any


def row_to_user(row: sqlite3.Row) -> dict[str, Any]:
    """返回用户信息，不包含 password_hash"""
    return {
        "id": row["id"],
        "username": row["username"],
        "name": row["name"],
        "is_admin": bool(row["is_admin"]),
        "created_at": row["created_at"],
    }


def row_to_visit(row: sqlite3.Row) -> dict[str, Any]:
    """只返回新模型字段，旧的 arrival_date/departure_date 不再对外暴露"""
    result = {
        "id": row["id"],
        "city_id": row["city_id"],
        "duration_days": row["duration_days"],
        "last_stay_date": row["last_stay_date"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }
    notes = row["notes"] if "notes" in row.keys() else None
    if notes:
        result["notes"] = notes
    return result
