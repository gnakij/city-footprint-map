"""一次性迁移脚本：把 arrival_date/departure_date 转换为 duration_days/last_stay_date

旧模型：每条记录有精确的到达/离开日期
新模型：每条记录只有「时长（天）」+「最后停留日期」，不要求精确区间

迁移规则：
  duration_days = departure_date - arrival_date + 1（与原 visitDays 计算一致）
  last_stay_date = departure_date（离开日期即视为最后停留日期）
"""
import sqlite3
from datetime import datetime
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent / "data" / "cityprint.db"


def main() -> None:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row

    cols = [row[1] for row in conn.execute("PRAGMA table_info(visits)").fetchall()]
    print(f"现有列: {cols}")

    if "duration_days" not in cols:
        conn.execute("ALTER TABLE visits ADD COLUMN duration_days INTEGER")
        print("✓ 已添加列 duration_days")
    if "last_stay_date" not in cols:
        conn.execute("ALTER TABLE visits ADD COLUMN last_stay_date TEXT")
        print("✓ 已添加列 last_stay_date")
    conn.commit()

    rows = conn.execute("SELECT id, arrival_date, departure_date FROM visits").fetchall()
    print(f"待迁移记录数: {len(rows)}")

    migrated = 0
    for row in rows:
        try:
            start = datetime.strptime(row["arrival_date"], "%Y-%m-%d")
            end = datetime.strptime(row["departure_date"], "%Y-%m-%d")
            days = max((end - start).days + 1, 1)
        except (ValueError, TypeError):
            days = 1
        last_stay = row["departure_date"] or row["arrival_date"]
        conn.execute(
            "UPDATE visits SET duration_days = ?, last_stay_date = ? WHERE id = ?",
            (days, last_stay, row["id"]),
        )
        migrated += 1

    conn.commit()
    print(f"✓ 已迁移 {migrated} 条记录")

    # 校验
    sample = conn.execute(
        "SELECT id, arrival_date, departure_date, duration_days, last_stay_date FROM visits LIMIT 5"
    ).fetchall()
    for s in sample:
        print(dict(s))

    conn.close()


if __name__ == "__main__":
    main()
