"""City of Kannapolis "Upcoming Events" calendar, from its public RSS feed (no key).

https://www.kannapolisnc.gov/DesktopModules/Events/EventRSS.aspx?mid=650&tabid=56

The feed lists every occurrence separately (a holiday light show is ~40 items), so repeats are
merged into one "series": same title, location and start time → one entry with all its dates.
Times in the feed are Kannapolis local time (EventTimeZoneId = Eastern).
"""
from __future__ import annotations

import datetime as dt
import json
import re
import time
import urllib.request
import xml.etree.ElementTree as ET

from common import MANUAL, USER_AGENT, log, write_json

FEED = "https://www.kannapolisnc.gov/DesktopModules/Events/EventRSS.aspx?mid=650&tabid=56"
CALENDAR = "https://www.kannapolisnc.gov/Community/Calendar"
UA = USER_AGENT  # the City site accepts an honest, identifying User-Agent (checked 2026-11-18)
NS = {"e": "https://www.dnnsoftware.com/dnnevents"}
MEETING_WORDS = re.compile(r"\b(council|commission|board|committee|meeting|hearing)\b", re.I)
MIN_SERIES = 3  # merge only real runs of 3+ identical events


def is_meeting(o: dict) -> bool:
    """Public meetings are never merged: each one has its own agenda and decisions."""
    return o["category"] == "Meetings" or bool(MEETING_WORDS.search(o["title"]))
TITLE_DATE = re.compile(r"\s+-\s+\d{1,2}/\d{1,2}/\d{4}(\s+\d{1,2}:\d{2}\s*[AP]M)?\s*$")


def fetch(retries: int = 3) -> bytes:
    last: Exception | None = None
    for attempt in range(retries):
        if attempt:
            time.sleep(5 * attempt)
        try:
            with urllib.request.urlopen(urllib.request.Request(FEED, headers={"User-Agent": UA}), timeout=30) as r:
                return r.read()
        except Exception as e:
            last = e
    raise RuntimeError(f"Events feed fetch failed: {last}")


def occurrences(xml: bytes) -> list[dict]:
    out = []
    for it in ET.fromstring(xml).iter("item"):
        g = lambda tag: (it.findtext(tag, namespaces=NS) or "").strip()  # noqa: E731
        begin = g("e:EventTimeBegin")
        if not begin:
            continue
        start = dt.datetime.strptime(begin, "%Y-%m-%d %H:%M:%S")
        out.append({
            "title": TITLE_DATE.sub("", g("title")).strip(),
            "category": g("e:Category") or None,
            "location": g("e:LocationName") or None,
            "start": start,
            "duration_min": int(g("e:Duration") or 0) or None,
            "all_day": g("e:AllDayEvent").lower() == "true",
            "canceled": g("e:Cancelled").lower() == "true",
            "url": g("link") or CALENDAR,
        })
    return out


def fmt_day(d: dt.date) -> str:
    return f"{d:%b} {d.day}"


def except_text(missing: list[dt.date]) -> str:
    """[Nov 26, Dec 24, Dec 25] -> 'Nov 26, Dec 24–25'."""
    runs: list[list[dt.date]] = []
    for d in missing:
        if runs and (d - runs[-1][-1]).days == 1:
            runs[-1].append(d)
        else:
            runs.append([d])
    parts = []
    for r in runs:
        if len(r) == 1:
            parts.append(fmt_day(r[0]))
        elif r[0].month == r[-1].month:
            parts.append(f"{fmt_day(r[0])}–{r[-1].day}")
        else:
            parts.append(f"{fmt_day(r[0])}–{fmt_day(r[-1])}")
    return ", ".join(parts)


def summarize(dates: list[dt.date], evening: bool) -> str:
    """Plain-language recurrence: 'Nightly, Nov 18 – Dec 30 (not Nov 26, Dec 24–25)'."""
    first, last = dates[0], dates[-1]
    span = f"{fmt_day(first)} – {fmt_day(last)}"
    gaps = [(b - a).days for a, b in zip(dates, dates[1:])]
    if all(g == 7 for g in gaps):
        return f"Every {first:%A}, {span}"
    every_day = [first + dt.timedelta(days=i) for i in range((last - first).days + 1)]
    missing = [d for d in every_day if d not in set(dates)]
    if len(missing) <= max(3, len(every_day) // 8):  # (almost) every day
        word = "Nightly" if evening else "Daily"
        return f"{word}, {span}" + (f" (not {except_text(missing)})" if missing else "")
    return f"{len(dates)} dates, {span}"


def main() -> None:
    occ = occurrences(fetch())
    if not occ:
        raise RuntimeError("Events feed had no items; the City's feed may have changed.")
    groups: dict[tuple, list[dict]] = {}
    for o in occ:
        key = (o["title"].lower(), (o["location"] or "").lower(), o["start"].strftime("%H:%M"), o["all_day"])
        groups.setdefault(key, []).append(o)

    # Split small groups back into single events.
    batches = []
    for items in groups.values():
        merge = len(items) >= MIN_SERIES and not any(is_meeting(o) for o in items)
        batches.extend([items] if merge else [[o] for o in items])

    events = []
    for items in batches:
        items.sort(key=lambda o: o["start"])
        live = [o for o in items if not o["canceled"]]
        first = items[0]
        dates = sorted({o["start"].date() for o in live})
        ev = {
            "title": first["title"],
            "category": next((o["category"] for o in items if o["category"]), None)
            or ("Meetings" if MEETING_WORDS.search(first["title"]) else "Events"),
            "location": next((o["location"] for o in items if o["location"]), None),
            "time": None if first["all_day"] else first["start"].strftime("%H:%M"),
            "duration_min": first["duration_min"],
            "start": first["start"].strftime("%Y-%m-%dT%H:%M"),
            "end": items[-1]["start"].strftime("%Y-%m-%dT%H:%M"),
            "dates": [d.isoformat() for d in dates],
            "count": len(dates),
            "canceled": not live,
            "url": first["url"],
        }
        if len(dates) > 1:
            ev["recurrence"] = summarize(dates, evening=first["start"].hour >= 17)
        events.append(ev)
    # Nights the City closed the Celebration of Lights for weather (data/manual/parks.json holiday.weather_closed):
    # the calendar feed isn't updated for these, so take them out of the series and say why.
    closed = json.loads((MANUAL / "parks.json").read_text()).get("holiday", {}).get("weather_closed", [])
    for ev in events:
        if closed and "celebration of lights" in ev["title"].lower():
            shut = [c for c in closed if c["date"] in ev["dates"]]
            if shut:
                ev["dates"] = [d for d in ev["dates"] if d not in {c["date"] for c in shut}]
                ev["count"] = len(ev["dates"])
                ev["weather_closed"] = [{"date": c["date"], "why": c["why"]} for c in shut]
                if len(ev["dates"]) > 1:
                    ev["recurrence"] = summarize([dt.date.fromisoformat(d) for d in ev["dates"]], evening=(ev["time"] or "") >= "17:00")
    events.sort(key=lambda e: e["start"])
    merged = sum(1 for e in events if e["count"] > 1)
    log(f"events: {len(occ)} feed items -> {len(events)} events ({merged} repeating series)")
    write_json("events.json", {"source": FEED, "calendar": CALENDAR, "feed_items": len(occ), "events": events})


if __name__ == "__main__":
    main()
