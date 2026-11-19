"""The Gem Theatre (Kannapolis's historic single-screen cinema): what's showing and coming soon.

Adapted from kannapolis-movies (github.com/bradspry/kannapolis-movies, movies_combined.py), which
used Playwright; the Gem's pages are plain HTML, so this uses only the standard library.

Primary source: gem-theatre.com/Tickets, which lists every film as
  <h3><img src="poster"> November 19 - December 2 | Title (PG-13)</h3> <p>description…</p>
Fallback: the Now-Playing page ("Now Showing: Title (PG-13)", or the older
"Title (PG-13) is Now Showing at The Gem") plus Coming-Soon (same h3 format as Tickets).
Daily showtimes live in a third-party ticketing app, so the dashboard links there instead.
"""
from __future__ import annotations

import datetime as dt
import html
import json
import re
import time
import urllib.request

from common import MANUAL, USER_AGENT, log, write_json

BASE = "https://gem-theatre.com"
PAGES = {"tickets": f"{BASE}/Tickets", "now": f"{BASE}/Movies/Now-Playing", "soon": f"{BASE}/Movies/Coming-Soon"}
MONTHS = {m: i for i, m in enumerate(["january", "february", "march", "april", "may", "june", "july", "august",
                                       "september", "october", "november", "december"], 1)}


def fetch(url: str, retries: int = 3) -> str:
    last: Exception | None = None
    for attempt in range(retries):
        if attempt:
            time.sleep(4 * attempt)
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": USER_AGENT}), timeout=30) as r:
                return r.read().decode("utf-8", errors="replace")
        except Exception as e:
            last = e
    raise RuntimeError(f"Gem Theatre fetch failed ({url}): {last}")


def text(fragment: str) -> str:
    fragment = re.sub(r"<br\s*/?>", "\n", fragment, flags=re.I)
    clean = html.unescape(re.sub(r"<[^>]+>", " ", fragment)).replace("\u200b", "").replace("\xa0", " ")  # zero-width and non-breaking spaces
    return "\n".join(line.strip() for line in clean.splitlines() if line.strip()).replace("  ", " ")


def parse_range(raw: str, today: dt.date) -> tuple[str | None, str | None]:
    """'November 19 - December 2' / 'December 3-16' -> ISO dates, choosing the year nearest today."""
    m = re.match(r"\s*([A-Za-z]+)\.?\s+(\d{1,2})\s*[-–]\s*(?:([A-Za-z]+)\.?\s+)?(\d{1,2})", raw)
    if not m or m.group(1).lower() not in MONTHS:
        return None, None
    m1, d1 = MONTHS[m.group(1).lower()], int(m.group(2))
    m2 = MONTHS.get((m.group(3) or m.group(1)).lower(), m1)
    d2 = int(m.group(4))

    def nearest(month: int, day: int) -> dt.date:
        cands = [dt.date(today.year + k, month, day) for k in (-1, 0, 1)]
        return min(cands, key=lambda d: abs((d - today).days))
    start = nearest(m1, d1)
    end = dt.date(start.year + (1 if m2 < m1 else 0), m2, d2)
    return start.isoformat(), end.isoformat()


def split_title(raw: str) -> tuple[str, str | None]:
    m = re.match(r"^(?P<title>.+?)\s*\((?P<rating>(?:G|PG|PG-13|R|NC-17|NR|Not Rated|Unrated))\)\s*$", raw.strip())
    return (m.group("title").strip(), m.group("rating")) if m else (raw.strip(), None)


def parse_listings(page: str, today: dt.date) -> list[dict]:
    """Every <h3>"dates | Title (Rating)"</h3> with its poster and the paragraphs after it."""
    blocks = re.split(r"(?=<h3[\s>])", page, flags=re.I)
    films = []
    for b in blocks[1:]:
        hm = re.match(r"<h3[^>]*>(.*?)</h3>(.*)", b, flags=re.S | re.I)
        if not hm:
            continue
        head = text(hm.group(1)).replace("\n", " ")
        if "|" not in head:
            continue
        dates, title_part = head.split("|", 1)
        title, rating = split_title(title_part)
        start, end = parse_range(dates, today)
        poster = re.search(r'<img[^>]+src="([^"]+)"', hm.group(1))
        body = re.split(r"<h3[\s>]|Movies and movie times are subject to change", hm.group(2), maxsplit=1, flags=re.I)[0]
        lines = [l for l in text(body).splitlines() if l]
        note = next((l for l in lines if l.lower().startswith("please note")), None)
        desc = [l for l in lines if l != note]
        films.append({
            "title": title, "rating": rating, "dates": dates.strip(), "start": start, "end": end,
            "description": " ".join(desc) if desc else None,
            "schedule": [l for l in desc if re.match(r"^\d{1,2}(:\d\d)?\s*[ap]\.?m\.?", l, re.I)] or None,
            "note": note.replace("Please note:", "").strip() if note else None,
            "poster": (poster.group(1) if poster.group(1).startswith("http") else BASE + poster.group(1)) if poster else None,
        })
    return films


def now_showing_fallback(page: str) -> dict | None:
    """kannapolis-movies' Now-Playing parse, accepting both heading formats the Gem has used."""
    for raw in re.findall(r'<span[^>]*class="Head"[^>]*>(.*?)</span>', page, flags=re.S):
        raw = text(raw).replace("\n", " ")
        m = (re.match(r"^Now Showing:\s*(?P<t>.+)$", raw) or re.match(r"^(?P<t>.+?)\s*is Now Showing at The Gem$", raw))
        if m:
            title, rating = split_title(m.group("t"))
            return {"title": title, "rating": rating, "dates": None, "start": None, "end": None, "description": None,
                    "schedule": None, "note": None, "poster": None}
    return None


def main() -> None:
    today = dt.date.today()
    info = json.loads((MANUAL / "gem.json").read_text())
    films = parse_listings(fetch(PAGES["tickets"]), today)
    used = PAGES["tickets"]
    if not films:  # page layout changed: fall back to the two movie pages
        films = parse_listings(fetch(PAGES["soon"]), today)
        now = now_showing_fallback(fetch(PAGES["now"]))
        if now:
            films.insert(0, now)
        used = f"{PAGES['now']} + {PAGES['soon']}"
    if not films:
        raise RuntimeError("No films found on gem-theatre.com; the site layout may have changed.")
    log(f"gem: {len(films)} listings from {used}: " + "; ".join(f"{f['title']} ({f['dates']})" for f in films))
    write_json("gem.json", {**info, "films": films, "listing_source": used})


if __name__ == "__main__":
    main()
