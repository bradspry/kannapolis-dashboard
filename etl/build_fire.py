"""Kannapolis Fire: contacts, free programs, stations and forms (hand-entered from kannapolisnc.gov/kfd).

Station coordinates come from the U.S. Census Bureau geocoder (exact address matches)."""
from __future__ import annotations

import json

from common import MANUAL, write_json


def main() -> None:
    info = json.loads((MANUAL / "kfd.json").read_text())
    for s in info["stations"]:  # all five stations sit in/near Kannapolis
        if not (35.3 < s["lat"] < 35.6 and -80.8 < s["lon"] < -80.5):
            raise ValueError(f"{s['name']}: coordinates look wrong")
    write_json("fire.json", info)


if __name__ == "__main__":
    main()
