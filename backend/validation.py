import uuid
from datetime import datetime
from typing import Any

from fastapi import HTTPException, status

from .cities import city_ids
from .config import MAX_NOTES_LENGTH, VALID_THEMES


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
