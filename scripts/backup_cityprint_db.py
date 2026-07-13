#!/usr/bin/env python3
"""Create and prune consistent SQLite backups for City Footprint Map."""

from __future__ import annotations

import argparse
import os
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DB_PATH = PROJECT_ROOT / "backend" / "data" / "cityprint.db"
DEFAULT_BACKUP_DIR = PROJECT_ROOT / "backend" / "backups"


def positive_int(value: str) -> int:
    parsed = int(value)
    if parsed < 1:
        raise argparse.ArgumentTypeError("must be a positive integer")
    return parsed


def backup_database(db_path: Path, backup_dir: Path) -> Path:
    if not db_path.exists():
        raise FileNotFoundError(f"database not found: {db_path}")

    backup_dir.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    target = backup_dir / f"cityprint-{timestamp}.db"
    temp_target = target.with_suffix(".db.tmp")

    with sqlite3.connect(str(db_path)) as source, sqlite3.connect(str(temp_target)) as destination:
        source.backup(destination)

    temp_target.replace(target)
    return target


def prune_backups(backup_dir: Path, retention_days: int) -> list[Path]:
    if not backup_dir.exists():
        return []

    cutoff = datetime.now(timezone.utc) - timedelta(days=retention_days)
    removed: list[Path] = []
    for backup in backup_dir.glob("cityprint-*.db"):
        modified_at = datetime.fromtimestamp(backup.stat().st_mtime, timezone.utc)
        if modified_at < cutoff:
            backup.unlink()
            removed.append(backup)
    return removed


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Back up the City Footprint SQLite database.")
    parser.add_argument(
        "--db",
        default=os.getenv("CITYPRINT_DB_PATH", str(DEFAULT_DB_PATH)),
        help="SQLite database path. Defaults to CITYPRINT_DB_PATH or backend/data/cityprint.db.",
    )
    parser.add_argument(
        "--backup-dir",
        default=os.getenv("CITYPRINT_BACKUP_DIR", str(DEFAULT_BACKUP_DIR)),
        help="Directory for backup files. Defaults to CITYPRINT_BACKUP_DIR or backend/backups.",
    )
    parser.add_argument(
        "--retention-days",
        type=positive_int,
        default=positive_int(os.getenv("CITYPRINT_BACKUP_RETENTION_DAYS", "30")),
        help="Delete backups older than this many days. Defaults to 30.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    db_path = Path(args.db).expanduser().resolve()
    backup_dir = Path(args.backup_dir).expanduser().resolve()

    backup = backup_database(db_path, backup_dir)
    removed = prune_backups(backup_dir, args.retention_days)

    print(f"backup={backup}")
    print(f"removed={len(removed)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
