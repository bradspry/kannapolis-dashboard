"""Made in Kannapolis: local makers (machine-parsed from each maker's own website), plus each maker's
upcoming live music, read daily from the event calendar embedded on its site.

Old Armor's Weekly Schedule page (oldarmorbeer.net/events-1) embeds a BeatGig/Dusk venue calendar;
that page carries every booking as schema.org MusicEvent JSON-LD. Its times are the venue's clock
times written with a "Z" (the calendar itself shows 20:00Z as 8:00 PM), so the "Z" is dropped and
they're kept as local times."""
from __future__ import annotations

import datetime as dt
import json
import re
import time
import urllib.request

from common import MANUAL, OUT, SITE, USER_AGENT, log, write_json

HHMM = re.compile(r"^([01]\d|2[0-4]):[0-5]\d$")
NEXT_DATA = re.compile(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', re.S)
KEEP = 40  # upcoming shows kept per maker


def get(url: str, retries: int = 3) -> str:
    last: Exception | None = None
    for attempt in range(retries):
        if attempt:
            time.sleep(5 * attempt)
        try:
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.read().decode("utf-8", "replace")
        except Exception as e:  # noqa: BLE001
            last = e
    raise RuntimeError(f"{url} failed: {last}")


def local(ts: str) -> str:
    """'2026-11-25T20:00:00Z' -> '2026-11-25T20:00' (the venue's own clock time; see the module note)."""
    return dt.datetime.fromisoformat(ts.rstrip("Z")).strftime("%Y-%m-%dT%H:%M")


def live_music(feed: str) -> list[dict]:
    page = get(feed)
    m = NEXT_DATA.search(page)
    if not m:
        raise RuntimeError("no __NEXT_DATA__ on the calendar page; its layout may have changed")
    props = json.loads(m.group(1))["props"]["pageProps"]
    events = json.loads(props.get("bookingsJsonLdString") or "[]")
    today = dt.date.today().isoformat()
    out = []
    for e in events:
        if e.get("@type") != "MusicEvent" or not e.get("startDate") or e.get("eventStatus", "").endswith("Cancelled"):
            continue
        start = local(e["startDate"])
        if start[:10] < today:
            continue
        perf = e.get("performer") or {}
        out.append({"name": re.sub(r"\s+", " ", e.get("name") or perf.get("name") or "").strip(),
                    "start": start, "end": local(e["endDate"]) if e.get("endDate") else None,
                    "free": e.get("isAccessibleForFree"), "genre": perf.get("genre")})
    out.sort(key=lambda x: x["start"])
    return out[:KEEP]


def main() -> None:
    info = json.loads((MANUAL / "made.json").read_text())
    ids = {m["id"] for m in info["makers"]}
    if info["featured"] not in ids:
        raise ValueError("made.json: featured maker is not in makers")
    try:
        previous = {m["id"]: m for m in json.loads((OUT / "made.json").read_text())["makers"]}
    except Exception:  # noqa: BLE001
        previous = {}
    for m in info["makers"]:
        days = [d for row in m["hours"] for d in row["days"]]
        if sorted(days) != sorted(set(days)) or not all(0 <= d <= 6 for d in days):
            raise ValueError(f"made.json: {m['id']} hours list a day twice or a bad day number")
        for row in m["hours"]:
            if not (HHMM.match(row["open"]) and HHMM.match(row["close"]) and row["open"] < row["close"]):
                raise ValueError(f"made.json: {m['id']} has bad hours {row}")
        if m.get("image") and not (SITE / m["image"]).exists():
            raise ValueError(f"made.json: missing image site/{m['image']}")
        if m.get("events_feed"):
            try:
                m["events"] = live_music(m["events_feed"])
                m["events_read"] = dt.date.today().isoformat()
                log(f"made: {m['name']}: {len(m['events'])} upcoming shows")
            except Exception as e:  # noqa: BLE001 - keep the last good list rather than drop the shows
                old = previous.get(m["id"], {})
                m["events"], m["events_read"] = old.get("events", []), old.get("events_read")
                log(f"made: {m['name']}: calendar failed ({e}); keeping {len(m['events'])} shows from {m['events_read']}")
    write_json("made.json", info)


if __name__ == "__main__":
    main()
