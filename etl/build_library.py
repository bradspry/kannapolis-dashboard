"""Cabarrus County Public Library: upcoming events at every branch, from the library's public events
calendar (The Events Calendar for WordPress, REST API, no key), with Kannapolis's two branches
(KAN = Kannapolis Library, AFT = Library and Active Living Center at Afton Ridge) flagged.

https://cabarrus-cep.bc.sirsidynix.net/wp-json/tribe/events/v1/events
robots.txt allows everything but /wp-admin/ (checked 2026-11-20). The catalog
(cabarrus.ent.sirsi.net) disallows all robots, so the ETL never touches it: the dashboard's search
box only sends a visitor's own search there.
Branch names, addresses and links are machine-parsed into data/manual/library.json."""
from __future__ import annotations

import datetime as dt
import html
import json
import re
import time
import urllib.parse
import urllib.request

from common import MANUAL, USER_AGENT, log, write_json

API = "https://cabarrus-cep.bc.sirsidynix.net/wp-json/tribe/events/v1/events"
DAYS = 28
PER_PAGE = 50
CODE = re.compile(r"\s*\((KAN|AFT|CON|HAR|MID|MTP)\)\s*$")
# Audience, from the calendar's categories (an event can be for several).
AUDIENCES = [
    ("kids", "Kids", {"Children", "Babies (Ages 0-Walking)", "Toddlers (Walking to 3 years)", "Preschool", "Ages 3-5",
                      "Ages 4-11", "Ages 6-11", "Ages 7-11", "Ages 7-12", "Ages 8-12", "Ages 9-13", "Story Time"}),
    ("teens", "Teens", {"Teens", "Tweens", "Teen and up (12+)", "Preteen and up (10+)"}),
    ("adults", "Adults", {"Adults", "Adult Literacy", "Job and Career", "Book Club"}),
    ("family", "All ages", {"All Ages", "Family"}),
]


def get(url: str, retries: int = 5) -> dict:  # the calendar sometimes returns a one-off 500
    last: Exception | None = None
    for attempt in range(retries):
        if attempt:
            time.sleep(5 * attempt)
        try:
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=40) as r:
                return json.loads(r.read())
        except Exception as e:  # noqa: BLE001
            last = e
    raise RuntimeError(f"{url} failed: {last}")


def text(s: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", s or ""))).strip()


def branch_of(ev: dict, branches: dict) -> str | None:
    m = CODE.search(html.unescape(ev["title"]))
    if m:
        return m.group(1)
    venue = ev.get("venue") or {}
    vid = venue.get("id") if isinstance(venue, dict) else None
    for code, b in branches.items():
        if vid in b.get("venue_ids", []):
            return code
    return None


def main() -> None:
    info = json.loads((MANUAL / "library.json").read_text())
    branches = info["branches"]
    today = dt.date.today()
    q = urllib.parse.urlencode({"start_date": today.isoformat(), "end_date": (today + dt.timedelta(days=DAYS)).isoformat(),
                                "per_page": PER_PAGE, "status": "publish"})
    url, raw = f"{API}?{q}", []
    while url:
        page = get(url)
        raw += page.get("events", [])
        url = page.get("next_rest_url")
        if url:
            time.sleep(2)  # be polite between pages
    events = []
    for ev in raw:
        if ev.get("hide_from_listings") or ev.get("status") != "publish":
            continue
        cats = {html.unescape(c["name"]) for c in ev.get("categories", [])}
        venue = ev.get("venue") if isinstance(ev.get("venue"), dict) else {}
        code = branch_of(ev, branches)
        events.append({
            "title": CODE.sub("", text(ev["title"])),
            "branch": code,
            "venue": text(venue.get("venue", "")) if venue else "",
            "start": ev["start_date"][:16].replace(" ", "T"),
            "end": ev["end_date"][:16].replace(" ", "T"),
            "all_day": bool(ev.get("all_day")),
            "audience": [k for k, _, names in AUDIENCES if cats & names],
            "special": bool({"Special Events", "Special Presenter"} & cats) or bool(ev.get("featured")),
            # "ALL LIBRARIES CLOSED", "ALL LIBRARIES CLOSE AT 5PM": shown as notices, not programs.
            "closure": bool(re.search(r"\bCLOS(ED|E|ING)\b", ev["title"], re.I)) and not cats - {"Special Events"},
            "summary": text(ev.get("excerpt") or ev.get("description"))[:220],
            "url": ev["url"],
        })
    events.sort(key=lambda e: (e["start"], e["title"]))
    local = [e for e in events if e["branch"] in info["kannapolis_branches"]]
    if not events:
        raise RuntimeError("library: the events calendar returned no upcoming events")
    log(f"library: {len(events)} events in the next {DAYS} days, {len(local)} at Kannapolis branches "
        f"({sum(e['branch'] == 'KAN' for e in events)} KAN, {sum(e['branch'] == 'AFT' for e in events)} AFT)")
    write_json("library.json", {**info, "audiences": [{"key": k, "label": l} for k, l, _ in AUDIENCES],
                                "days": DAYS, "events": events})


if __name__ == "__main__":
    main()
