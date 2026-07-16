import os
import sqlite3
from typing import Any

from fastapi import Depends, FastAPI, HTTPException, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from .auth import admin_count, admin_user, create_access_token, current_user, verify_password
from .cities import load_cities
from .config import (
    DEFAULT_ALLOWED_ORIGINS,
    parse_allowed_origins,
)
from .db import get_db, initialize_database
from .serializers import row_to_user
from .services.achievements import list_achievements, unlock_user_achievement
from .services.data import clear_user_data, export_admin_data, export_user_data, import_admin_data, import_user_data
from .services.settings import get_user_settings, save_user_settings
from .services.stats import get_system_stats
from .services.users import create_user_record, delete_user_record, list_user_records, update_user_record
from .services.visits import create_visit_record, delete_visit_record, list_visit_records, update_visit_record
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
from .utils import now_iso

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
    return update_user_record(user["id"], payload, allow_admin_change=False)


@app.get("/api/users")
def list_users(_: sqlite3.Row = Depends(admin_user)) -> list[dict[str, Any]]:
    return list_user_records()


@app.post("/api/users", status_code=status.HTTP_201_CREATED)
def create_managed_user(payload: UserCreate, _: sqlite3.Row = Depends(admin_user)) -> dict[str, Any]:
    return create_user_record(payload.username, payload.password, payload.name, payload.is_admin)


@app.put("/api/users/{user_id}")
def update_user(user_id: str, payload: UserUpdate, _: sqlite3.Row = Depends(admin_user)) -> dict[str, Any]:
    return update_user_record(user_id, payload, allow_admin_change=True)


@app.delete("/api/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(user_id: str, admin: sqlite3.Row = Depends(admin_user)) -> Response:
    delete_user_record(user_id, admin["id"])
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ── 访问记录 ──────────────────────────────────────────────────────────────
@app.get("/api/visits")
def list_visits(user: sqlite3.Row = Depends(current_user)) -> list[dict[str, Any]]:
    """返回当前登录用户的所有访问记录，按最后停留日期倒序"""
    return list_visit_records(user["id"])


@app.post("/api/visits", status_code=status.HTTP_201_CREATED)
def create_visit(payload: VisitCreate, user: sqlite3.Row = Depends(current_user)) -> dict[str, Any]:
    """新增一条停留记录。不再校验日期区间重叠 —— 同一城市允许任意多条粗粒度记录。"""
    return create_visit_record(payload, user["id"])


@app.put("/api/visits/{visit_id}")
def update_visit(visit_id: str, payload: VisitUpdate, user: sqlite3.Row = Depends(current_user)) -> dict[str, Any]:
    return update_visit_record(visit_id, payload, user["id"])


@app.delete("/api/visits/{visit_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_visit(visit_id: str, user: sqlite3.Row = Depends(current_user)) -> Response:
    return delete_visit_record(visit_id, user["id"])


# ── 城市数据 ──────────────────────────────────────────────────────────────
@app.get("/api/cities")
def get_cities() -> list[dict[str, Any]]:
    return load_cities()


# ── 数据导出/导入/清空 ────────────────────────────────────────────────────
@app.post("/api/data/export")
def export_data(user: sqlite3.Row = Depends(current_user)) -> dict[str, Any]:
    return export_user_data(user)


@app.post("/api/data/import")
def import_data(payload: ImportPayload, user: sqlite3.Row = Depends(current_user)) -> dict[str, Any]:
    """导入使用 INSERT OR REPLACE，幂等安全。兼容旧版 arrival_date/departure_date 导出文件。"""
    return import_user_data(payload, user)


@app.post("/api/admin/data/export")
def admin_export_data(payload: AdminDataExportPayload, _: sqlite3.Row = Depends(admin_user)) -> dict[str, Any]:
    return export_admin_data(payload)


@app.post("/api/admin/data/import")
def admin_import_data(payload: AdminDataImportPayload, _: sqlite3.Row = Depends(admin_user)) -> dict[str, int]:
    return import_admin_data(payload)


@app.post("/api/data/clear", status_code=status.HTTP_204_NO_CONTENT)
def clear_data(user: sqlite3.Row = Depends(current_user)) -> Response:
    return clear_user_data(user["id"])


# ── 成就 ──────────────────────────────────────────────────────────────────
@app.get("/api/achievements")
def get_achievements(user: sqlite3.Row = Depends(current_user)) -> list[dict[str, Any]]:
    return list_achievements(user["id"])


@app.post("/api/achievements", status_code=status.HTTP_201_CREATED)
def unlock_achievement(payload: AchievementPayload, user: sqlite3.Row = Depends(current_user)) -> dict[str, Any]:
    return unlock_user_achievement(payload, user["id"])


# ── 设置 ──────────────────────────────────────────────────────────────────
@app.get("/api/settings")
def get_settings(user: sqlite3.Row = Depends(current_user)) -> dict[str, str]:
    return get_user_settings(user["id"])


@app.put("/api/settings")
def save_settings(payload: SettingsPayload, user: sqlite3.Row = Depends(current_user)) -> dict[str, str]:
    return save_user_settings(payload, user["id"])


# ── 管理统计 ──────────────────────────────────────────────────────────────
@app.get("/api/stats/system")
def system_stats(_: sqlite3.Row = Depends(admin_user)) -> dict[str, int]:
    return get_system_stats()


# ── 健康检查 ──────────────────────────────────────────────────────────────
@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "time": now_iso()}
