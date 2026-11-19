"""Mayor & City Council contacts, from data/manual/council.csv (transcribed from the City's website)."""
from __future__ import annotations

import csv

from common import MANUAL, write_json

SOURCE = "https://www.kannapolisnc.gov/citycouncil"
GROUP_EMAIL = "citycouncil@kannapolisnc.gov"


def main() -> None:
    with (MANUAL / "council.csv").open(newline="") as f:
        members = sorted(csv.DictReader(f), key=lambda r: int(r["order"]))
    write_json("council.json", {
        "source": SOURCE,
        "group_email": GROUP_EMAIL,
        "group_note": "Reaches the Mayor, Mayor Pro Tem, City Council Members, City Manager and City Attorney.",
        "photo_credit": "Photos: City of Kannapolis",
        "members": [{k: r.get(k) or None for k in ("name", "role", "email", "phone", "photo")} for r in members],
    })


if __name__ == "__main__":
    main()
