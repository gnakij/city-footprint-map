import os
import sqlite3
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import Depends, FastAPI, HTTPException, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from .auth import admin_count, admin_user, create_access_token, current_user, get_user_by_id, hash_password, verify_password
from .cities import load_cities
from .config import (
    DEFAULT_ALLOWED_ORIGINS,
    parse_allowed_origins,
)
from .db import get_db, initialize_database
from .serializers import row_to_user, row_to_visit
from .schemas import (
    AchievementPayload,
    AdminDataExportPayload,
    AdminDataImportPayload,
    BootstrapStatusPayload,
    ImportPayload,
    LoginPayload,
    SettingsPayload,
    UserCreate,
    UserUpdate,
    VisitCreate,
    VisitUpdate,
)
from .validation import normalize_import_visit, validate_theme


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


# ── 用户创建辅助 ──────────────────────────────────────────────────────────
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


# ── DB 初始化 ─────────────────────────────────────────────────────────────
def init_db() -> None:
    admins = initialize_database()
    if admins == 0:
        username = os.getenv("CITYPRINT_ADMIN_USERNAME", "").strip()
        password = os.getenv("CITYPRINT_ADMIN_PASSWORD", "")
        name = os.getenv("CITYPRINT_ADMIN_NAME", "管理员").strip() or "管理员"
        if username and password:
            create_user_record(username, password, name, True)
            print("INFO: Initial admin created from CITYPRINT_ADMIN_USERNAME/CITYPRINT_ADMIN_PASSWORD.")
        elif username or password:
            raise RuntimeError(
                "CITYPRINT_ADMIN_USERNAME and CITYPRINT_ADMIN_PASSWORD must be set together "
                "to initialize an admin from environment variables."
            )
        else:
            print("INFO: No users found. Use POST /api/bootstrap/admin to create the first admin.")


# ── FastAPI App ───────────────────────────────────────────────────────────
app = FastAPI(title="City Footprint API")

# Rate limiting
limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS 配置：生产环境限制为实际域名
ALLOWED_ORIGINS = parse_allowed_origins(os.getenv("CITYPRINT_ALLOWED_ORIGINS"))

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup() -> None:
    init_db()


init_db()


# ── 认证 ──────────────────────────────────────────────────────────────────
@app.get("/api/bootstrap/status")
def bootstrap_status() -> BootstrapStatusPayload:
    return BootstrapStatusPayload(requires_admin_setup=admin_count() == 0)


@app.post("/api/bootstrap/admin", status_code=status.HTTP_201_CREATED)
@limiter.limit("5/minute")
def bootstrap_admin(request: Request, payload: UserCreate) -> dict[str, Any]:
    if admin_count() > 0:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Admin already initialized")
    return create_user_record(payload.username, payload.password, payload.name, True)


@app.post("/api/auth/register", status_code=status.HTTP_201_CREATED)
@limiter.limit("5/minute")
def register(request: Request, payload: UserCreate) -> dict[str, Any]:
    return create_user_record(payload.username, payload.password, payload.name, False)


@app.post("/api/auth/login")
@limiter.limit("10/minute")
def login(request: Request, payload: LoginPayload) -> dict[str, Any]:
    with get_db() as conn:
        user = conn.execute("SELECT * FROM users WHERE username = ?", (payload.username.strip(),)).fetchone()
    if not user or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or password")
    return {"access_token": create_access_token(user["id"]), "token_type": "bearer", "user": row_to_user(user)}


# ── 用户管理 ──────────────────────────────────────────────────────────────
@app.get("/api/users/me")
def users_me(user: sqlite3.Row = Depends(current_user)) -> dict[str, Any]:
    return row_to_user(user)


@app.put("/api/users/me")
def update_me(payload: UserUpdate, user: sqlite3.Row = Depends(current_user)) -> dict[str, Any]:
    return _update_user_record(user["id"], payload, allow_admin_change=False)


@app.get("/api/users")
def list_users(_: sqlite3.Row = Depends(admin_user)) -> list[dict[str, Any]]:
    with get_db() as conn:
        rows = conn.execute("SELECT * FROM users ORDER BY is_admin DESC, created_at ASC").fetchall()
    return [row_to_user(row) for row in rows]


@app.post("/api/users", status_code=status.HTTP_201_CREATED)
def create_managed_user(payload: UserCreate, _: sqlite3.Row = Depends(admin_user)) -> dict[str, Any]:
    return create_user_record(payload.username, payload.password, payload.name, payload.is_admin)


@app.put("/api/users/{user_id}")
def update_user(user_id: str, payload: UserUpdate, _: sqlite3.Row = Depends(admin_user)) -> dict[str, Any]:
    return _update_user_record(user_id, payload, allow_admin_change=True)


def _update_user_record(user_id: str, payload: UserUpdate, allow_admin_change: bool) -> dict[str, Any]:
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


@app.delete("/api/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(user_id: str, admin: sqlite3.Row = Depends(admin_user)) -> Response:
    if user_id == admin["id"]:
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
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ── 访问记录 ──────────────────────────────────────────────────────────────
@app.get("/api/visits")
def list_visits(user: sqlite3.Row = Depends(current_user)) -> list[dict[str, Any]]:
    """返回当前登录用户的所有访问记录，按最后停留日期倒序"""
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM visits WHERE user_id = ? ORDER BY last_stay_date DESC, created_at DESC",
            (user["id"],),
        ).fetchall()
    return [row_to_visit(row) for row in rows]


@app.post("/api/visits", status_code=status.HTTP_201_CREATED)
def create_visit(payload: VisitCreate, user: sqlite3.Row = Depends(current_user)) -> dict[str, Any]:
    """新增一条停留记录。不再校验日期区间重叠 —— 同一城市允许任意多条粗粒度记录。"""
    timestamp = now_iso()
    visit_id = str(uuid.uuid4())
    with get_db() as conn:
        conn.execute(
            "INSERT INTO visits (id, user_id, city_id, duration_days, last_stay_date, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (visit_id, user["id"], payload.city_id, payload.duration_days, payload.last_stay_date,
             payload.notes, timestamp, timestamp),
        )
        row = conn.execute("SELECT * FROM visits WHERE id = ?", (visit_id,)).fetchone()
    return row_to_visit(row)


@app.put("/api/visits/{visit_id}")
def update_visit(visit_id: str, payload: VisitUpdate, user: sqlite3.Row = Depends(current_user)) -> dict[str, Any]:
    with get_db() as conn:
        existing = conn.execute(
            "SELECT * FROM visits WHERE id = ? AND user_id = ?", (visit_id, user["id"])
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
             now_iso(), visit_id, user["id"]),
        )
        row = conn.execute("SELECT * FROM visits WHERE id = ? AND user_id = ?", (visit_id, user["id"])).fetchone()
    return row_to_visit(row)


@app.delete("/api/visits/{visit_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_visit(visit_id: str, user: sqlite3.Row = Depends(current_user)) -> Response:
    with get_db() as conn:
        existing = conn.execute(
            "SELECT id FROM visits WHERE id = ? AND user_id = ?", (visit_id, user["id"])
        ).fetchone()
        if not existing:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Visit not found")
        conn.execute("DELETE FROM visits WHERE id = ? AND user_id = ?", (visit_id, user["id"]))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ── 城市数据 ──────────────────────────────────────────────────────────────
@app.get("/api/cities")
def get_cities() -> list[dict[str, Any]]:
    return load_cities()


# ── 数据导出/导入/清空 ────────────────────────────────────────────────────
@app.post("/api/data/export")
def export_data(user: sqlite3.Row = Depends(current_user)) -> dict[str, Any]:
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


@app.post("/api/data/import")
def import_data(payload: ImportPayload, user: sqlite3.Row = Depends(current_user)) -> dict[str, Any]:
    """导入使用 INSERT OR REPLACE，幂等安全。兼容旧版 arrival_date/departure_date 导出文件。"""
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
    return export_data(user)


@app.post("/api/admin/data/export")
def admin_export_data(payload: AdminDataExportPayload, _: sqlite3.Row = Depends(admin_user)) -> dict[str, Any]:
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


@app.post("/api/admin/data/import")
def admin_import_data(payload: AdminDataImportPayload, _: sqlite3.Row = Depends(admin_user)) -> dict[str, int]:
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


@app.post("/api/data/clear", status_code=status.HTTP_204_NO_CONTENT)
def clear_data(user: sqlite3.Row = Depends(current_user)) -> Response:
    with get_db() as conn:
        conn.execute("DELETE FROM visits WHERE user_id = ?", (user["id"],))
        conn.execute("DELETE FROM achievements WHERE user_id = ?", (user["id"],))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ── 成就 ──────────────────────────────────────────────────────────────────
@app.get("/api/achievements")
def get_achievements(user: sqlite3.Row = Depends(current_user)) -> list[dict[str, Any]]:
    with get_db() as conn:
        rows = conn.execute("SELECT * FROM achievements WHERE user_id = ?", (user["id"],)).fetchall()
    return [dict(row) for row in rows]


@app.post("/api/achievements", status_code=status.HTTP_201_CREATED)
def unlock_achievement(payload: AchievementPayload, user: sqlite3.Row = Depends(current_user)) -> dict[str, Any]:
    with get_db() as conn:
        conn.execute(
            "INSERT OR IGNORE INTO achievements (id, user_id, achievement_id, unlocked_at) VALUES (?, ?, ?, ?)",
            (str(uuid.uuid4()), user["id"], payload.achievement_id, now_iso()),
        )
        row = conn.execute(
            "SELECT * FROM achievements WHERE user_id = ? AND achievement_id = ?",
            (user["id"], payload.achievement_id),
        ).fetchone()
    return dict(row)


# ── 设置 ──────────────────────────────────────────────────────────────────
@app.get("/api/settings")
def get_settings(user: sqlite3.Row = Depends(current_user)) -> dict[str, str]:
    with get_db() as conn:
        row = conn.execute("SELECT theme FROM settings WHERE user_id = ?", (user["id"],)).fetchone()
    return {"theme": row["theme"] if row else "rose"}


@app.put("/api/settings")
def save_settings(payload: SettingsPayload, user: sqlite3.Row = Depends(current_user)) -> dict[str, str]:
    with get_db() as conn:
        conn.execute("INSERT OR REPLACE INTO settings (user_id, theme) VALUES (?, ?)", (user["id"], payload.theme))
    return {"theme": payload.theme}


# ── 管理统计 ──────────────────────────────────────────────────────────────
@app.get("/api/stats/system")
def system_stats(_: sqlite3.Row = Depends(admin_user)) -> dict[str, int]:
    with get_db() as conn:
        users = conn.execute("SELECT COUNT(*) AS count FROM users").fetchone()["count"]
        admins = conn.execute("SELECT COUNT(*) AS count FROM users WHERE is_admin = 1").fetchone()["count"]
        visits = conn.execute("SELECT COUNT(*) AS count FROM visits").fetchone()["count"]
    return {"totalUsers": users, "adminUsers": admins, "totalVisits": visits}


# ── 健康检查 ──────────────────────────────────────────────────────────────
@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "time": now_iso()}
