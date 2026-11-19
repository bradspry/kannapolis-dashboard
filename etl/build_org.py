"""City staff org chart, from data/manual/org_chart.json (transcribed from the City's published chart).

Validates the reporting tree and attaches photo paths for people with a cropped headshot in site/photos/staff/.
"""
from __future__ import annotations

import json

from common import MANUAL, SITE, write_json

STAFF_DIR = SITE / "photos" / "staff"


def main() -> None:
    data = json.loads((MANUAL / "org_chart.json").read_text())
    ids = {p["id"] for p in data["people"]}
    for p in data["people"]:
        for key in ("reports_to", "dotted_to"):
            if p.get(key) and p[key] not in ids:
                raise ValueError(f"{p['id']}: {key} '{p[key]}' is not a known id")
        if (STAFF_DIR / f"{p['id']}.jpg").exists():
            p["photo"] = f"photos/staff/{p['id']}.jpg"
    write_json("org.json", data)


if __name__ == "__main__":
    main()
