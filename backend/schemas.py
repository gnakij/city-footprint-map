from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator

from .config import MAX_IMPORT_VISITS
from .validation import normalize_notes, validate_city_id, validate_date_text, validate_theme


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
