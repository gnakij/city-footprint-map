import json
from pathlib import Path
from typing import Any

_CITY_IDS_CACHE: set[str] | None = None


def load_cities() -> list[dict[str, Any]]:
    cities_file = Path(__file__).resolve().parents[1] / "src" / "data" / "cities.json"
    if not cities_file.exists():
        return []
    raw = json.loads(cities_file.read_text(encoding="utf-8"))
    if not isinstance(raw, list):
        raise RuntimeError("cities.json must contain a list")

    required = {"city_id", "city_name", "province", "region", "pinyin", "level"}
    cities: list[dict[str, Any]] = []
    for index, item in enumerate(raw):
        if not isinstance(item, dict):
            raise RuntimeError(f"cities.json row {index + 1} must be an object")
        missing = required - item.keys()
        if missing:
            raise RuntimeError(f"cities.json row {index + 1} missing fields: {', '.join(sorted(missing))}")
        cities.append(dict(item))
    return cities


def city_ids() -> set[str]:
    global _CITY_IDS_CACHE
    if _CITY_IDS_CACHE is None:
        _CITY_IDS_CACHE = {city["city_id"] for city in load_cities()}
    return _CITY_IDS_CACHE
