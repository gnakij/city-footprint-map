from ..db import get_db


def get_system_stats() -> dict[str, int]:
    with get_db() as conn:
        users = conn.execute("SELECT COUNT(*) AS count FROM users").fetchone()["count"]
        admins = conn.execute("SELECT COUNT(*) AS count FROM users WHERE is_admin = 1").fetchone()["count"]
        visits = conn.execute("SELECT COUNT(*) AS count FROM visits").fetchone()["count"]
    return {"totalUsers": users, "adminUsers": admins, "totalVisits": visits}
