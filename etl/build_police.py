"""Kannapolis Police: contacts, services and quarterly crime statistics (hand-entered).

KPD publishes quarterly crime reports as PDFs (Power BI exports). Their Part 1 crime counts
are transcribed into data/manual/kpd_part1_crimes.csv; this step checks each quarter's crimes
add up to its printed "Total Incident Reports" before publishing them.
"""
from __future__ import annotations

import csv
import json

from common import MANUAL, write_json


def rows(name: str) -> list[dict]:
    with (MANUAL / name).open(newline="") as f:
        return list(csv.DictReader(f))


def main() -> None:
    info = json.loads((MANUAL / "kpd.json").read_text())
    crimes = [{**r, "count": int(r["count"])} for r in rows("kpd_part1_crimes.csv")]
    quarters: dict[str, dict] = {}
    for r in rows("kpd_quarterly.csv"):
        q = quarters.setdefault(r["quarter"], {"quarter": r["quarter"], "status": {}, "districts": {}, "source_url": r["source_url"]})
        v = int(r["value"])
        if r["metric"] == "total_reports":
            q["total_reports"] = v
        elif r["unit"] == "pct_of_reports_by_district":
            q["districts"][r["metric"]] = v
        else:
            q["status"][r["metric"]] = v
    for q in quarters.values():
        total = sum(c["count"] for c in crimes if c["quarter"] == q["quarter"])
        if total != q["total_reports"]:
            raise ValueError(f"{q['quarter']}: Part 1 crimes add to {total}, report says {q['total_reports']}")
        if abs(sum(q["status"].values()) - 100) > 1:  # printed shares are rounded (Q2 2026 adds to 101)
            raise ValueError(f"{q['quarter']}: case status shares add to {sum(q['status'].values())}%")
    write_json("police.json", {**info, "crimes": crimes, "quarters": sorted(quarters.values(), key=lambda q: q["quarter"])})


if __name__ == "__main__":
    main()
