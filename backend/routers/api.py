import sqlite3
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status

from ..auth import admin_count, admin_user, create_access_token, current_user, verify_password
from ..cities import load_cities
from ..db import get_db
from ..rate_limit import limiter
from ..schemas import (
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
from ..serializers import row_to_user
from ..services.achievements import list_achievements, unlock_user_achievement
from ..services.data import clear_user_data, export_admin_data, export_user_data, import_admin_data, import_user_data
from ..services.settings import get_user_settings, save_user_settings
from ..services.stats import get_system_stats
from ..services.users import create_user_record, delete_user_record, list_user_records, update_user_record
from ..services.visits import create_visit_record, delete_visit_record, list_visit_records, update_visit_record
from ..utils import now_iso

router = APIRouter(prefix="/api")


@router.get("/bootstrap/status")
def bootstrap_status() -> BootstrapStatusPayload:
    return BootstrapStatusPayload(requires_admin_setup=admin_count() == 0)


@router.post("/bootstrap/admin", status_code=status.HTTP_201_CREATED)
@limiter.limit("5/minute")
def bootstrap_admin(request: Request, payload: UserCreate) -> dict[str, Any]:
    if admin_count() > 0:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Admin already initialized")
    return create_user_record(payload.username, payload.password, payload.name, True)


@router.post("/auth/register", status_code=status.HTTP_201_CREATED)
@limiter.limit("5/minute")
def register(request: Request, payload: UserCreate) -> dict[str, Any]:
    return create_user_record(payload.username, payload.password, payload.name, False)


@router.post("/auth/login")
@limiter.limit("10/minute")
def login(request: Request, payload: LoginPayload) -> dict[str, Any]:
    with get_db() as conn:
        user = conn.execute("SELECT * FROM users WHERE username = ?", (payload.username.strip(),)).fetchone()
    if not user or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or password")
    return {"access_token": create_access_token(user["id"]), "token_type": "bearer", "user": row_to_user(user)}


@router.get("/users/me")
def users_me(user: sqlite3.Row = Depends(current_user)) -> dict[str, Any]:
    return row_to_user(user)


@router.put("/users/me")
def update_me(payload: UserUpdate, user: sqlite3.Row = Depends(current_user)) -> dict[str, Any]:
    return update_user_record(user["id"], payload, allow_admin_change=False)


@router.get("/users")
def list_users(_: sqlite3.Row = Depends(admin_user)) -> list[dict[str, Any]]:
    return list_user_records()


@router.post("/users", status_code=status.HTTP_201_CREATED)
def create_managed_user(payload: UserCreate, _: sqlite3.Row = Depends(admin_user)) -> dict[str, Any]:
    return create_user_record(payload.username, payload.password, payload.name, payload.is_admin)


@router.put("/users/{user_id}")
def update_user(user_id: str, payload: UserUpdate, _: sqlite3.Row = Depends(admin_user)) -> dict[str, Any]:
    return update_user_record(user_id, payload, allow_admin_change=True)


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(user_id: str, admin: sqlite3.Row = Depends(admin_user)) -> Response:
    delete_user_record(user_id, admin["id"])
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/visits")
def list_visits(user: sqlite3.Row = Depends(current_user)) -> list[dict[str, Any]]:
    """返回当前登录用户的所有访问记录，按最后停留日期倒序"""
    return list_visit_records(user["id"])


@router.post("/visits", status_code=status.HTTP_201_CREATED)
def create_visit(payload: VisitCreate, user: sqlite3.Row = Depends(current_user)) -> dict[str, Any]:
    """新增一条停留记录。不再校验日期区间重叠 —— 同一城市允许任意多条粗粒度记录。"""
    return create_visit_record(payload, user["id"])


@router.put("/visits/{visit_id}")
def update_visit(visit_id: str, payload: VisitUpdate, user: sqlite3.Row = Depends(current_user)) -> dict[str, Any]:
    return update_visit_record(visit_id, payload, user["id"])


@router.delete("/visits/{visit_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_visit(visit_id: str, user: sqlite3.Row = Depends(current_user)) -> Response:
    return delete_visit_record(visit_id, user["id"])


@router.get("/cities")
def get_cities() -> list[dict[str, Any]]:
    return load_cities()


@router.post("/data/export")
def export_data(user: sqlite3.Row = Depends(current_user)) -> dict[str, Any]:
    return export_user_data(user)


@router.post("/data/import")
def import_data(payload: ImportPayload, user: sqlite3.Row = Depends(current_user)) -> dict[str, Any]:
    """导入使用 INSERT OR REPLACE，幂等安全。兼容旧版 arrival_date/departure_date 导出文件。"""
    return import_user_data(payload, user)


@router.post("/admin/data/export")
def admin_export_data(payload: AdminDataExportPayload, _: sqlite3.Row = Depends(admin_user)) -> dict[str, Any]:
    return export_admin_data(payload)


@router.post("/admin/data/import")
def admin_import_data(payload: AdminDataImportPayload, _: sqlite3.Row = Depends(admin_user)) -> dict[str, int]:
    return import_admin_data(payload)


@router.post("/data/clear", status_code=status.HTTP_204_NO_CONTENT)
def clear_data(user: sqlite3.Row = Depends(current_user)) -> Response:
    return clear_user_data(user["id"])


@router.get("/achievements")
def get_achievements(user: sqlite3.Row = Depends(current_user)) -> list[dict[str, Any]]:
    return list_achievements(user["id"])


@router.post("/achievements", status_code=status.HTTP_201_CREATED)
def unlock_achievement(payload: AchievementPayload, user: sqlite3.Row = Depends(current_user)) -> dict[str, Any]:
    return unlock_user_achievement(payload, user["id"])


@router.get("/settings")
def get_settings(user: sqlite3.Row = Depends(current_user)) -> dict[str, str]:
    return get_user_settings(user["id"])


@router.put("/settings")
def save_settings(payload: SettingsPayload, user: sqlite3.Row = Depends(current_user)) -> dict[str, str]:
    return save_user_settings(payload, user["id"])


@router.get("/stats/system")
def system_stats(_: sqlite3.Row = Depends(admin_user)) -> dict[str, int]:
    return get_system_stats()


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "time": now_iso()}
