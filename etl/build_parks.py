"""Kannapolis Parks & Recreation for residents (hand-entered from kannapolisnc.gov/parksandrec and its sub-pages).

Park map locations: U.S. Census geocoder (exact address matches), or Cabarrus County GIS for
Vietnam Veterans Park. Parks without a street address are listed but not mapped."""
from __future__ import annotations

import json

from common import MANUAL, write_json


def main() -> None:
    info = json.loads((MANUAL / "parks.json").read_text())
    for p in info["parks"]:
        if "lat" in p and not (35.40 < p["lat"] < 35.54 and -80.72 < p["lon"] < -80.57):  # Kannapolis area; catches e.g. a China Grove "N Main St" match
            raise ValueError(f"{p['name']}: map location is outside Kannapolis")
    write_json("parks.json", info)


if __name__ == "__main__":
    main()
