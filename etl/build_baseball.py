"""Kannapolis Cannon Ballers 2027 schedule, transcribed from the team's printed schedule (an image PDF).

Checks: 132 games, 66 home / 66 away, one game per day, all inside the 2027 season,
and every home game has a start time."""
from __future__ import annotations

import csv
import datetime as dt
import json

from common import MANUAL, write_json


def main() -> None:
    info = json.loads((MANUAL / "cannonballers.json").read_text())
    with (MANUAL / "cannonballers_2027.csv").open(newline="") as f:
        games = list(csv.DictReader(f))
    dates = [g["date"] for g in games]
    home = [g for g in games if g["home"] == "home"]
    problems = []
    if len(games) != 132: problems.append(f"{len(games)} games (expected 132)")
    if len(home) != 66: problems.append(f"{len(home)} home games (expected 66)")
    if len(set(dates)) != len(dates): problems.append("two games on one date")
    if any(g["opponent"] not in info["teams"] for g in games): problems.append("unknown opponent code")
    if any(not g["time"] for g in home): problems.append("home game without a time")
    if not all(dt.date(2027, 4, 1) <= dt.date.fromisoformat(d) <= dt.date(2027, 9, 30) for d in dates): problems.append("date outside the season")
    if problems:
        raise ValueError("Cannon Ballers schedule: " + "; ".join(problems))
    write_json("baseball.json", {**info, "games": [{"date": g["date"], "home": g["home"] == "home", "opp": g["opponent"],
                                                     "time": g["time"] or None, "note": g["note"] or None} for g in games]})


if __name__ == "__main__":
    main()
