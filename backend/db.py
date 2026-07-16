import sqlite3

from .config import db_path


def get_db() -> sqlite3.Connection:
    path = db_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    return conn


def initialize_database() -> int:
    with get_db() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
              id TEXT PRIMARY KEY,
              username TEXT NOT NULL UNIQUE,
              password_hash TEXT NOT NULL,
              name TEXT NOT NULL,
              is_admin INTEGER NOT NULL DEFAULT 0,
              created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS visits (
              id TEXT PRIMARY KEY,
              user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
              city_id TEXT NOT NULL,
              duration_days INTEGER NOT NULL DEFAULT 1,
              last_stay_date TEXT NOT NULL DEFAULT (date('now')),
              notes TEXT,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_visits_user_id ON visits(user_id);
            CREATE INDEX IF NOT EXISTS idx_visits_last_stay ON visits(last_stay_date);
            CREATE TABLE IF NOT EXISTS achievements (
              id TEXT PRIMARY KEY,
              user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
              achievement_id TEXT NOT NULL,
              unlocked_at TEXT NOT NULL,
              UNIQUE(user_id, achievement_id)
            );
            CREATE INDEX IF NOT EXISTS idx_achievements_user_id ON achievements(user_id);
            CREATE TABLE IF NOT EXISTS settings (
              user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
              theme TEXT NOT NULL DEFAULT 'rose'
            );
            """
        )
        cols = [row[1] for row in conn.execute("PRAGMA table_info(visits)").fetchall()]
        if "duration_days" not in cols:
            conn.execute("ALTER TABLE visits ADD COLUMN duration_days INTEGER NOT NULL DEFAULT 1")
        if "last_stay_date" not in cols:
            conn.execute("ALTER TABLE visits ADD COLUMN last_stay_date TEXT NOT NULL DEFAULT (date('now'))")
        return int(conn.execute("SELECT COUNT(*) AS count FROM users WHERE is_admin = 1").fetchone()["count"])
