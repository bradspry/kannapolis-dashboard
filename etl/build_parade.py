"""Kannapolis Christmas Parade (machine-parsed from kannapolisnc.gov/christmasparade and the City's parade
parking map): date, route, road closures, parking. The route line follows OpenStreetMap street lines
(data/manual/parade.json path, staging)."""
from __future__ import annotations

import json

from common import MANUAL, log, write_json


def main() -> None:
    info = json.loads((MANUAL / "parade.json").read_text())
    for name in ("path", "staging"):
        for lon, lat in info[name]:
            if not (35.48 < lat < 35.51 and -80.64 < lon < -80.61):  # downtown Kannapolis
                raise ValueError(f"parade {name}: point {lon},{lat} is outside downtown Kannapolis")
    log(f"parade: {info['date']} {info['time']}, route of {len(info['path'])} points")
    write_json("parade.json", info)


if __name__ == "__main__":
    main()
