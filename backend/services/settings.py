from ..db import get_db
from ..schemas import SettingsPayload


def get_user_settings(user_id: str) -> dict[str, str]:
    with get_db() as conn:
        row = conn.execute("SELECT theme FROM settings WHERE user_id = ?", (user_id,)).fetchone()
    return {"theme": row["theme"] if row else "rose"}


def save_user_settings(payload: SettingsPayload, user_id: str) -> dict[str, str]:
    with get_db() as conn:
        conn.execute("INSERT OR REPLACE INTO settings (user_id, theme) VALUES (?, ?)", (user_id, payload.theme))
    return {"theme": payload.theme}
