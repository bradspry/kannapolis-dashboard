"""What-A-Burger #1 (1510 N Cannon Blvd): hours, menu and prices, machine-parsed into
data/manual/whataburger.json from the restaurant's online menu (what-a-burger1.com/order).
The menu there is drawn by JavaScript, so it's parsed from a rendered copy of the page; re-parse to update prices."""
from __future__ import annotations

import json

from common import MANUAL, SITE, write_json


def main() -> None:
    info = json.loads((MANUAL / "whataburger.json").read_text())
    items = {i["name"] for s in info["menu"] for i in s["items"]}
    for f in info["favorites"]:
        if f["name"] not in items:
            raise ValueError(f"whataburger.json: favorite {f['name']!r} is not on the menu")
    for s in info["menu"]:
        for i in s["items"]:
            if not (0 < i["price"] < 100):
                raise ValueError(f"whataburger.json: odd price for {i['name']}: {i['price']}")
    if not (SITE / info["logo"]).exists():
        raise ValueError(f"whataburger.json: missing logo site/{info['logo']}")
    write_json("whataburger.json", info)


if __name__ == "__main__":
    main()
