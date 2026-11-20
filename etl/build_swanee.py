"""The Swanee Theatre (downtown live-music venue): upcoming shows from the site's public
Events Calendar REST feed (WordPress "The Events Calendar": /wp-json/tribe/events/v1/events).
Weekly happenings and rental details are machine-parsed snapshots in data/manual/swanee.json."""
from __future__ import annotations

import datetime as dt
import html
import json
import re
import time
import urllib.parse
import urllib.request

from common import MANUAL, USER_AGENT, log, write_json

API = "https://swaneetheatre.com/wp-json/tribe/events/v1/events"


def get(url: str, retries: int = 3) -> dict:
    last: Exception | None = None
    for attempt in range(retries):
        if attempt:
            time.sleep(4 * attempt)
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"}), timeout=30) as r:
                return json.loads(r.read())
        except Exception as e:
            last = e
    raise RuntimeError(f"Swanee events feed failed: {last}")


def text(s: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", s or ""))).strip()


def main() -> None:
    info = json.loads((MANUAL / "swanee.json").read_text())
    params = {"per_page": 50, "start_date": dt.date.today().isoformat(), "end_date": (dt.date.today() + dt.timedelta(days=270)).isoformat()}
    url, events = f"{API}?{urllib.parse.urlencode(params)}", []
    while url:
        page = get(url)
        for e in page.get("events", []):
            desc = text(e.get("description"))
            doors = re.search(r"Doors open at ([0-9:]+\s*[ap]\.?m\.?)", desc, re.I)
            img = (e.get("image") or {})
            events.append({
                "title": text(e["title"]), "start": e["start_date"][:16].replace(" ", "T"), "end": (e.get("end_date") or "")[:16].replace(" ", "T") or None,
                "all_day": str(e.get("all_day")).lower() == "true", "url": e.get("url"), "tickets": e.get("website") or None,
                "cost": text(e.get("cost")) or None, "doors": doors.group(1) if doors else None,
                "summary": text(e.get("excerpt")) or None,
                "image": (img.get("sizes", {}).get("medium", {}) or {}).get("url") or img.get("url"),
            })
        url = page.get("next_rest_url")
    events.sort(key=lambda x: x["start"])
    log(f"swanee: {len(events)} upcoming events" + (f", next {events[0]['start']} {events[0]['title']}" if events else ""))
    write_json("swanee.json", {**info, "events": events})


if __name__ == "__main__":
    main()
