import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from .config import DEFAULT_ALLOWED_ORIGINS, parse_allowed_origins
from .db import initialize_database
from .rate_limit import limiter, reset_rate_limits
from .routers.api import router as api_router
from .services.users import create_user_record


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


app = FastAPI(title="City Footprint API")
reset_rate_limits()
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

ALLOWED_ORIGINS = parse_allowed_origins(os.getenv("CITYPRINT_ALLOWED_ORIGINS"))

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)
init_db()
