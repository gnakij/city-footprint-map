import os
import re
import sqlite3
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from fastapi import Depends, FastAPI, HTTPException, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel, ConfigDict, Field, field_validator
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

DEFAULT_DB_PATH = Path(__file__).resolve().parent / "data" / "cityprint.db"

# ── 安全配置：从环境变量读取，无默认值（启动时强制要求） ──────────────
_raw_secret = os.getenv("CITYPRINT_SECRET_KEY", "")
if not _raw_secret or _raw_secret in ("change-this-cityprint-secret", "dev-cityprint-secret"):
    import secrets as _secrets
    _raw_secret = _secrets.token_hex(32)
    print(
        "WARNING: CITYPRINT_SECRET_KEY not set or uses default value. "
        "A random key has been generated for this session. "
        "Set CITYPRINT_SECRET_KEY in your environment to persist sessions across restarts."
    )
SECRET_KEY = _raw_secret

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_DAYS = 30
VALID_THEMES = {"rose", "stripe", "amber", "turquoise", "azure"}
MAX_IMPORT_VISITS = 2000
MAX_NOTES_LENGTH = 500
_CITY_IDS_CACHE: set[str] | None = None
DEFAULT_ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:5173",
    "https://www.gnakij.top",
    "https://gnakij.top",
]

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
bearer = HTTPBearer()


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def db_path() -> Path:
    return Path(os.getenv("CITYPRINT_DB_PATH", str(DEFAULT_DB_PATH)))


def parse_allowed_origins(raw_value: str | None) -> list[str]:
    origins = [item.strip() for item in (raw_value or "").split(",") if item.strip()]
    return origins or DEFAULT_ALLOWED_ORIGINS


def get_db() -> sqlite3.Connection:
    path = db_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    return conn


def city_ids() -> set[str]:
    global _CITY_IDS_CACHE
    if _CITY_IDS_CACHE is None:
        _CITY_IDS_CACHE = {city["city_id"] for city in load_cities()}
    return _CITY_IDS_CACHE


def validate_city_id(value: str) -> str:
    if value not in city_ids():
        raise ValueError("Unknown city_id")
    return value


def validate_date_text(value: str) -> str:
    try:
        parsed = datetime.strptime(value, "%Y-%m-%d")
    except (TypeError, ValueError) as exc:
        raise ValueError("Date must use YYYY-MM-DD format") from exc
    if parsed.strftime("%Y-%m-%d") != value:
        raise ValueError("Date must use YYYY-MM-DD format")
    return value


def validate_theme(value: str) -> str:
    if value not in VALID_THEMES:
        raise ValueError("Unknown theme")
    return value


def normalize_notes(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = value.strip()
    if not stripped:
        return None
    if len(stripped) > MAX_NOTES_LENGTH:
        raise ValueError(f"notes must be {MAX_NOTES_LENGTH} characters or fewer")
    return stripped


def import_error(index: int, message: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail=f"Invalid import visit at row {index + 1}: {message}",
    )


def normalize_import_visit(visit: dict[str, Any], index: int) -> dict[str, Any]:
    if not isinstance(visit, dict):
        raise import_error(index, "visit must be an object")

    try:
        city_id = validate_city_id(visit["city_id"])
    except KeyError as exc:
        raise import_error(index, "city_id is required") from exc
    except ValueError as exc:
        raise import_error(index, str(exc)) from exc

    if "duration_days" in visit and "last_stay_date" in visit:
        duration = visit["duration_days"]
        last_stay = visit["last_stay_date"]
    elif "arrival_date" in visit and "departure_date" in visit:
        try:
            start = datetime.strptime(visit["arrival_date"], "%Y-%m-%d")
            end = datetime.strptime(visit["departure_date"], "%Y-%m-%d")
            duration = max((end - start).days + 1, 1)
            last_stay = visit["departure_date"]
        except (TypeError, ValueError) as exc:
            raise import_error(index, "arrival_date/departure_date must use YYYY-MM-DD format") from exc
    else:
        raise import_error(index, "duration_days and last_stay_date are required")

    if not isinstance(duration, int) or duration < 1:
        raise import_error(index, "duration_days must be a positive integer")
    try:
        last_stay = validate_date_text(last_stay)
        notes = normalize_notes(visit.get("notes"))
    except ValueError as exc:
        raise import_error(index, str(exc)) from exc

    return {
        "id": visit.get("id") or str(uuid.uuid4()),
        "city_id": city_id,
        "duration_days": duration,
        "last_stay_date": last_stay,
        "notes": notes,
        "created_at": visit.get("created_at"),
        "updated_at": visit.get("updated_at"),
    }


# ── Pydantic 模型 ─────────────────────────────────────────────────────────
class UserCreate(BaseModel):
    username: str = Field(min_length=1)
    password: str = Field(min_length=6)
    name: str = Field(min_length=1)
    is_admin: bool = False


class LoginPayload(BaseModel):
    username: str
    password: str


class UserUpdate(BaseModel):
    username: str | None = None
    password: str | None = Field(default=None, min_length=6)
    name: str | None = None
    is_admin: bool | None = None


class BootstrapStatusPayload(BaseModel):
    requires_admin_setup: bool


# ── 访问记录模型：改为「时长 + 最后停留日期」，不再要求精确到达日期 ────────
class VisitCreate(BaseModel):
    city_id: str
    duration_days: int = Field(ge=1, description="估算停留天数，无需精确")
    last_stay_date: str = Field(description="最后一次停留的日期 YYYY-MM-DD")
    notes: str | None = None

    @field_validator("city_id")
    @classmethod
    def city_id_exists(cls, value: str) -> str:
        return validate_city_id(value)

    @field_validator("last_stay_date")
    @classmethod
    def last_stay_date_is_date(cls, value: str) -> str:
        return validate_date_text(value)

    @field_validator("notes")
    @classmethod
    def notes_are_reasonable(cls, value: str | None) -> str | None:
        return normalize_notes(value)


class VisitUpdate(BaseModel):
    city_id: str | None = None
    duration_days: int | None = Field(default=None, ge=1)
    last_stay_date: str | None = None
    notes: str | None = None

    @field_validator("city_id")
    @classmethod
    def city_id_exists(cls, value: str | None) -> str | None:
        return validate_city_id(value) if value is not None else None

    @field_validator("last_stay_date")
    @classmethod
    def last_stay_date_is_date(cls, value: str | None) -> str | None:
        return validate_date_text(value) if value is not None else None

    @field_validator("notes")
    @classmethod
    def notes_are_reasonable(cls, value: str | None) -> str | None:
        return normalize_notes(value)


class SettingsPayload(BaseModel):
    theme: str = "rose"

    @field_validator("theme")
    @classmethod
    def theme_is_supported(cls, value: str) -> str:
        return validate_theme(value)


class AchievementPayload(BaseModel):
    achievement_id: str


class ImportPayload(BaseModel):
    model_config = ConfigDict(extra="allow")

    version: str | None = None
    exported_at: str | None = None
    visits: list[dict[str, Any]] = Field(default_factory=list)
    achievements: list[str] = Field(default_factory=list)
    settings: dict[str, Any] = Field(default_factory=lambda: {"theme": "rose"})

    @field_validator("visits")
    @classmethod
    def import_size_is_reasonable(cls, value: list[dict[str, Any]]) -> list[dict[str, Any]]:
        if len(value) > MAX_IMPORT_VISITS:
            raise ValueError(f"visits may contain at most {MAX_IMPORT_VISITS} records")
        return value


class AdminDataExportPayload(BaseModel):
    user_ids: list[str]


class AdminDataImportPayload(BaseModel):
    user_id: str
    visits: list[VisitCreate]

    @field_validator("visits")
    @classmethod
    def import_size_is_reasonable(cls, value: list[VisitCreate]) -> list[VisitCreate]:
        if len(value) > MAX_IMPORT_VISITS:
            raise ValueError(f"visits may contain at most {MAX_IMPORT_VISITS} records")
        return value


# ── 数据转换 ──────────────────────────────────────────────────────────────
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


# ── JWT ───────────────────────────────────────────────────────────────────
def create_access_token(user_id: str) -> str:
    expires = datetime.now(timezone.utc) + timedelta(days=ACCESS_TOKEN_EXPIRE_DAYS)
    return jwt.encode({"sub": user_id, "exp": expires}, SECRET_KEY, algorithm=ALGORITHM)


def get_user_by_id(user_id: str) -> sqlite3.Row | None:
    with get_db() as conn:
        return conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()


def admin_count() -> int:
    with get_db() as conn:
        return int(conn.execute("SELECT COUNT(*) AS count FROM users WHERE is_admin = 1").fetchone()["count"])


def current_user(credentials: HTTPAuthorizationCredentials = Depends(bearer)) -> sqlite3.Row:
    """验证 JWT 并返回当前登录用户"""
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
    except JWTError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token") from exc
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    user = get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user


def admin_user(user: sqlite3.Row = Depends(current_user)) -> sqlite3.Row:
    if not user["is_admin"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin required")
    return user


# ── 用户创建辅助 ──────────────────────────────────────────────────────────
def create_user_record(username: str, password: str, name: str, is_admin: bool) -> dict[str, Any]:
    user_id = str(uuid.uuid4())
    timestamp = now_iso()
    password_hash = pwd_context.hash(password)
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
        # 兼容旧库：补充新列（已通过迁移脚本处理过的库会跳过）
        cols = [row[1] for row in conn.execute("PRAGMA table_info(visits)").fetchall()]
        if "duration_days" not in cols:
            conn.execute("ALTER TABLE visits ADD COLUMN duration_days INTEGER NOT NULL DEFAULT 1")
        if "last_stay_date" not in cols:
            conn.execute("ALTER TABLE visits ADD COLUMN last_stay_date TEXT NOT NULL DEFAULT (date('now'))")
        admins = conn.execute("SELECT COUNT(*) AS count FROM users WHERE is_admin = 1").fetchone()["count"]
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


def load_cities() -> list[dict[str, Any]]:
    cities_file = Path(__file__).resolve().parents[1] / "src" / "data" / "cities.ts"
    if not cities_file.exists():
        return []
    text = cities_file.read_text(encoding="utf-8")
    cities: list[dict[str, Any]] = []
    for match in re.finditer(
        r"\{\s*city_id:\s*'([^']+)'.*?city_name:\s*'([^']+)'.*?province:\s*'([^']+)'.*?region:\s*'([^']+)'.*?pinyin:\s*'([^']+)'.*?level:\s*'([^']+)'",
        text,
        re.DOTALL,
    ):
        cities.append({
            "city_id": match.group(1),
            "city_name": match.group(2),
            "province": match.group(3),
            "region": match.group(4),
            "pinyin": match.group(5),
            "level": match.group(6),
        })
    return cities


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
    if not user or not pwd_context.verify(payload.password, user["password_hash"]):
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
    password_hash = pwd_context.hash(payload.password) if payload.password else user["password_hash"]
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
