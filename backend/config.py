import os
import secrets
from pathlib import Path

DEFAULT_DB_PATH = Path(__file__).resolve().parent / "data" / "cityprint.db"

_raw_secret = os.getenv("CITYPRINT_SECRET_KEY", "")
if not _raw_secret or _raw_secret in ("change-this-cityprint-secret", "dev-cityprint-secret"):
    _raw_secret = secrets.token_hex(32)
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
DEFAULT_ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:5173",
]


def db_path() -> Path:
    return Path(os.getenv("CITYPRINT_DB_PATH", str(DEFAULT_DB_PATH)))


def parse_allowed_origins(raw_value: str | None) -> list[str]:
    origins = [item.strip() for item in (raw_value or "").split(",") if item.strip()]
    return origins or DEFAULT_ALLOWED_ORIGINS
