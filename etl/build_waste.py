"""Waste collection (Garbage, Recycling & Yard Waste): services, set-out rules, holiday delays, the
loose-leaf season and how to report a missed pickup. Machine-parsed from the City's Garbage page and
"What's My Day?" page into data/manual/waste.json. Pickup days themselves come from the City's
CARTology lookup and app (ReCollect), which the widget links to."""
from __future__ import annotations

import datetime as dt
import json

from common import MANUAL, SITE, write_json


def main() -> None:
    info = json.loads((MANUAL / "waste.json").read_text())
    for key in ("delay_holidays", "yard_holidays"):
        for h in info[key]:
            dt.date.fromisoformat(h["date"])  # raises on a bad date
    ls = info["leaf_season"]
    if dt.date.fromisoformat(ls["start"]) >= dt.date.fromisoformat(ls["end"]):
        raise ValueError("waste.json: leaf season ends before it starts")
    if "@" not in info["missed"]["email"] or not info["missed"]["phone"]:
        raise ValueError("waste.json: missed-pickup contact is incomplete")
    photo = info.get("director", {}).get("photo")
    if photo and not (SITE / photo).exists():
        raise ValueError(f"waste.json: missing photo site/{photo}")
    write_json("waste.json", info)


if __name__ == "__main__":
    main()
