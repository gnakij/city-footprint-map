import uuid
from typing import Any

from ..db import get_db
from ..schemas import AchievementPayload
from ..utils import now_iso


def list_achievements(user_id: str) -> list[dict[str, Any]]:
    with get_db() as conn:
        rows = conn.execute("SELECT * FROM achievements WHERE user_id = ?", (user_id,)).fetchall()
    return [dict(row) for row in rows]


def unlock_user_achievement(payload: AchievementPayload, user_id: str) -> dict[str, Any]:
    with get_db() as conn:
        conn.execute(
            "INSERT OR IGNORE INTO achievements (id, user_id, achievement_id, unlocked_at) VALUES (?, ?, ?, ?)",
            (str(uuid.uuid4()), user_id, payload.achievement_id, now_iso()),
        )
        row = conn.execute(
            "SELECT * FROM achievements WHERE user_id = ? AND achievement_id = ?",
            (user_id, payload.achievement_id),
        ).fetchone()
    return dict(row)
