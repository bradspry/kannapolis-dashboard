"""Made in Kannapolis: local makers (machine-parsed from each maker's own website)."""
from __future__ import annotations

import json
import re

from common import MANUAL, SITE, write_json

HHMM = re.compile(r"^([01]\d|2[0-4]):[0-5]\d$")


def main() -> None:
    info = json.loads((MANUAL / "made.json").read_text())
    ids = {m["id"] for m in info["makers"]}
    if info["featured"] not in ids:
        raise ValueError("made.json: featured maker is not in makers")
    for m in info["makers"]:
        days = [d for row in m["hours"] for d in row["days"]]
        if sorted(days) != sorted(set(days)) or not all(0 <= d <= 6 for d in days):
            raise ValueError(f"made.json: {m['id']} hours list a day twice or a bad day number")
        for row in m["hours"]:
            if not (HHMM.match(row["open"]) and HHMM.match(row["close"]) and row["open"] < row["close"]):
                raise ValueError(f"made.json: {m['id']} has bad hours {row}")
        if m.get("image") and not (SITE / m["image"]).exists():
            raise ValueError(f"made.json: missing image site/{m['image']}")
    write_json("made.json", info)


if __name__ == "__main__":
    main()
