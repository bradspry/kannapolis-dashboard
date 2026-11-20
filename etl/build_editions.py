"""Editions Coffee Shop & Bookstore (217 S Main St): new book arrivals and this month's events,
read daily from editionsbookstore.com (a ChrisLands store site). The coffee menu, yarn, hours and
contact details are machine-parsed snapshots in data/manual/editions.json.

Politeness: the site's robots.txt allows these pages and asks for a 10-second crawl delay, so
requests are spaced 10+ seconds apart and identify themselves with the kdash User-Agent."""
from __future__ import annotations

import datetime as dt
import html
import json
import re
import time
import urllib.parse
import urllib.request

from common import MANUAL, USER_AGENT, log, write_json

BASE = "https://www.editionsbookstore.com"
CRAWL_DELAY = 11  # robots.txt: Crawl-delay: 10
MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"]
_last_fetch = 0.0


def get(path: str) -> str:
    global _last_fetch
    wait = _last_fetch + CRAWL_DELAY - time.time()
    if wait > 0:
        time.sleep(wait)
    url = urllib.parse.urljoin(BASE, path)
    try:
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "text/html"})
        with urllib.request.urlopen(req, timeout=30) as r:
            final = r.geturl()
            body = r.read().decode("utf-8", "replace")
    finally:
        _last_fetch = time.time()
    if "/blocked" in final:
        raise RuntimeError(f"Editions site refused {url} (redirected to {final}); not retrying")
    return body


def text(s: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", s or ""))).strip()


def absurl(u: str) -> str:
    return urllib.parse.urljoin(BASE + "/", html.unescape(u))


# ---------- new arrivals ----------

def parse_books(page: str) -> list[dict]:
    books = []
    for block in page.split('<div class="featured-item">')[1:]:
        a = re.search(r'<h4><a[^>]*href="([^"]+)"[^>]*>(.*?)</a>', block, re.S)
        if not a:
            continue
        img = re.search(r'<img[^>]*src="([^"]+)"', block)
        author = re.search(r'featured-item-author">(.*?)</div>', block, re.S)
        price = re.search(r'class="price">([^<]+)<', block)
        cover = absurl(img.group(1)) if img else None
        if cover and "noimage" in cover:
            cover = None
        books.append({
            "title": text(a.group(2)), "url": absurl(a.group(1)), "cover": cover,
            "author": pretty_authors(text(author.group(1)).removeprefix("By:").strip()) if author else None,
            "price": text(price.group(1)) if price else None,
        })
    return books


def pretty_authors(s: str) -> str | None:
    """'Adjei-Brenyah, Nana Kwame' -> 'Nana Kwame Adjei-Brenyah'; long lists become 'X and N others'."""
    parts = [p.strip() for p in s.split(",") if p.strip()]
    if not parts:
        return None
    names = [f"{parts[i + 1]} {parts[i]}" if i + 1 < len(parts) else parts[i] for i in range(0, len(parts), 2)]
    names = [re.sub(r"\b([A-Z])\b(?!\.)", r"\1.", n) for n in names]  # 'V E Schwab' -> 'V. E. Schwab'
    if len(names) > 2:
        return f"{names[0]} and {len(names) - 1} others"
    return " and ".join(names)


# ---------- events ----------

DATE_RE = re.compile(r"(?:(?:mon|tues|wednes|thurs|fri|satur|sun)day,?\s+)?(" + "|".join(MONTHS) + r")\s+(\d{1,2})"
                     r"(?:\s*[-–]\s*(?:(?:mon|tues|wednes|thurs|fri|satur|sun)day,?\s+)?(?:(" + "|".join(MONTHS) + r")\s+)?(\d{1,2}))?", re.I)
TIME_RE = re.compile(r"^\d{1,2}(?::\d\d)?\s*(?:[-–]\s*\d{1,2}(?::\d\d)?\s*)?[ap]\.?m\.?$", re.I)
RECUR_RE = re.compile(r"^(?:every\s+)?(mon|tues|wednes|thurs|fri|satur|sun)day(?:s| evenings?| mornings?| afternoons?| nights?)$", re.I)
PLACE_RE = re.compile(r"^(?:at\s+)?editions$", re.I)


def event_date(month: str, day: str, today: dt.date) -> dt.date:
    d = dt.date(today.year, MONTHS.index(month.lower()) + 1, int(day))
    return d.replace(year=d.year + 1) if d < today - dt.timedelta(days=120) else d


def parse_events(page: str, today: dt.date) -> tuple[list[dict], str | None]:
    body = page.split('id="custom-page"', 1)[-1].split("<footer", 1)[0]
    cal = re.search(r'<img[^>]*src="([^"]*calendar[^"]*)"', body, re.I)
    heads = list(re.finditer(r'<p[^>]*>\s*<span[^>]*font-size:\s*18pt[^>]*>(.*?)</span>\s*</p>', body, re.S))
    events = []
    for i, m in enumerate(heads):
        chunk = body[m.end(): heads[i + 1].start() if i + 1 < len(heads) else len(body)]
        parts = [p.strip() for p in text(m.group(1)).split("|") if p.strip()]
        start = end = time_ = recurring = None
        title_bits = []
        for p in parts:
            dm = DATE_RE.fullmatch(p.strip(" ,"))
            if dm:
                start = event_date(dm.group(1), dm.group(2), today)
                if dm.group(4):
                    end = event_date(dm.group(3) or dm.group(1), dm.group(4), today)
            elif TIME_RE.match(p):
                time_ = p.replace(" ", " ")
            elif RECUR_RE.match(p):
                recurring = p
            elif not PLACE_RE.match(p):
                title_bits.append(p)
        bold = re.match(r'\s*(?:<p[^>]*>\s*(?:&nbsp;|\s)*</p>\s*)*<p[^>]*>\s*<strong>(.*?)</strong>\s*</p>', chunk, re.S)
        title = " · ".join(title_bits) or (text(bold.group(1)) if bold else "")
        if not title:
            continue
        details, links = [], []
        for li in re.findall(r"<li[^>]*>(.*?)</li>", chunk, re.S):
            t = text(li)
            for href, label in re.findall(r'<a[^>]*href="([^"]+)"[^>]*>(.*?)</a>', li, re.S):
                lbl = text(label)
                if re.fullmatch(r"click here", lbl, re.I):
                    lbl = re.sub(r"(?i)^click here\s*(for\s+)?", "", t).rstrip(". !") or "More info"
                    lbl = lbl[:1].upper() + lbl[1:]
                links.append({"label": lbl, "url": absurl(href)})
                t = "" if text(label) == t or re.match(r"(?i)click here", t) else t
            if t:
                details.append(t)
        if not (start or recurring):
            continue
        if start and (end or start) < today:
            continue
        events.append({
            "title": title, "date": start.isoformat() if start else None, "end": end.isoformat() if end else None,
            "time": time_, "recurring": recurring, "closed": bool(re.search(r"\bclos(ed|ure|ing)\b", title, re.I)),
            "details": details, "links": links,
        })
    events.sort(key=lambda e: (e["date"] is None, e["date"] or ""))
    return events, absurl(cal.group(1)) if cal else None


def monthly_menu(home: str) -> str | None:
    sec = re.search(r"Monthly Drink Specials(.*?)Book Club", home, re.S | re.I)
    img = re.search(r'<img[^>]*src="([^"]+)"', sec.group(1)) if sec else None
    return absurl(img.group(1)) if img else None


def main() -> None:
    info = json.loads((MANUAL / "editions.json").read_text())
    today = dt.date.today()
    books = parse_books(get("/page/NewArrivals"))
    if len(books) < 4:
        raise RuntimeError(f"Editions new arrivals: only {len(books)} books parsed; page layout may have changed")
    events, calendar = parse_events(get("/page/events"), today)
    try:
        specials = monthly_menu(get("/"))
    except Exception as e:  # noqa: BLE001 - the monthly menu link is a nice-to-have
        log(f"editions: monthly menu not found ({e})")
        specials = None
    log(f"editions: {len(books)} new arrivals, {len(events)} events" + (f", next {events[0]['title']}" if events else ""))
    write_json("editions.json", {**info, "books": books, "events": events, "calendar_image": calendar, "monthly_menu": specials})


if __name__ == "__main__":
    main()
