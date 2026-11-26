"""Provisions on Main Market & Deli (1111 S Main St, Midway): its events and deli menu, read daily from
provisionsonmain.com (a Wix site whose pages carry their text). Hours, drink specials, sides, charcuterie, the
founders' story and photos are a machine-parsed snapshot in data/manual/provisions.json; the home page's posted
hours are checked against it and a change is logged.

Politeness: two requests a day (the home page and the Deli Menu page; robots.txt allows both), with the kdash
User-Agent. If a page can't be read, the last events or menu are kept."""
from __future__ import annotations

import datetime as dt
import html
import json
import re
import urllib.request

from common import MANUAL, OUT, USER_AGENT, log, write_json

SITE = "https://www.provisionsonmain.com"
POSTED_HOURS = "Sunday and Monday 11 am to 8 pm Wednesday and Thursday 11 am to 8 pm Friday and Saturday 11 am to 9 pm"


def text(page: str) -> str:
    page = re.sub(r"<(script|style|svg)\b.*?</\1>", " ", page, flags=re.S | re.I)
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", page))).replace("​", "").strip()


def fetch(path: str) -> str:
    req = urllib.request.Request(SITE + path, headers={"User-Agent": USER_AGENT, "Accept": "text/html"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode("utf-8", "replace")


def clock24(s: str) -> str:
    m = re.match(r"(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m", s.strip(), re.I)
    return f"{int(m.group(1)) % 12 + (12 if m.group(3).lower() == 'p' else 0):02d}:{int(m.group(2) or 0):02d}"


def parse_events(t: str, today: dt.date) -> list[dict]:
    """'EVENTS 11/14 Madilyn Cherry Music 11/21 POM Karaoke Night 7:00 pm - until... 12/5 ...  We hope you'll ...'"""
    m = re.search(r"\bEVENTS\b\s*(.*?)\s*(?:We hope you|Made for Neighbors|$)", t)
    if not m:
        return []
    out = []
    for em in re.finditer(r"(\d{1,2})/(\d{1,2})\s+(.*?)(?=\s+\d{1,2}/\d{1,2}\s|$)", m.group(1)):
        month, day, title = int(em.group(1)), int(em.group(2)), em.group(3).strip()
        year = today.year
        try:
            date = dt.date(year, month, day)
        except ValueError:
            continue
        if date < today - dt.timedelta(days=60):
            date = dt.date(year + 1, month, day)
        time = None
        tm = re.search(r"(\d{1,2}(?::\d{2})?\s*[ap]\.?m)\s*(?:-|–|to)?\s*(until\.*|\d{1,2}(?::\d{2})?\s*[ap]\.?m)?", title, re.I)
        late = False
        if tm:
            time = clock24(tm.group(1))
            late = bool(tm.group(2) and tm.group(2).lower().startswith("until"))
            title = (title[:tm.start()] + title[tm.end():]).strip(" -–")
        out.append({"date": date.isoformat(), "title": title, **({"time": time} if time else {}), **({"late": True} if late else {})})
    return out


def parse_menu(t: str) -> dict:
    """Sandwiches ('The Market Melt — $8.49 Fresh, locally baked sourdough...') and small plates, from the Deli Menu."""
    def items(section: str) -> list[dict]:
        # Each "— $price" ends a name: the name is what follows the previous description's last sentence.
        out, last = [], 0
        for m in re.finditer(r"\s+—\s+\$(\d+\.\d{2})\s+", section):
            before = section[last:m.start()]
            cut = max(before.rfind(". "), before.rfind("! "))
            if out:
                out[-1]["desc"] = before[:cut + 1].strip() if cut >= 0 else before.strip()
            out.append({"name": (before[cut + 2:] if cut >= 0 else before).strip(), "price": f"${m.group(1)}", "desc": ""})
            last = m.end()
        if out:
            out[-1]["desc"] = section[last:].strip()
        return out
    sand = re.search(r"SANDWICH MENU & SIDES\s*(.*?)\s*Choose Your Sides", t)
    apps = re.search(r"Small plates\s*(.*?)\s*The POM Charcuterie", t)
    return {"sandwiches": items(sand.group(1)) if sand else [], "small_plates": items(apps.group(1)) if apps else []}


def main() -> None:
    info = json.loads((MANUAL / "provisions.json").read_text())
    prev_path = OUT / "provisions.json"
    prev = json.loads(prev_path.read_text()) if prev_path.exists() else {}
    today = dt.date.today()
    try:
        home = text(fetch("/"))
        events = parse_events(home, today)
        if POSTED_HOURS not in home:
            hm = re.search(r"Visit Us Soon\s*(.*?)\s*Live Music", home)
            log(f"provisions: the posted hours changed ({hm.group(1) if hm else '?'!r}); update data/manual/provisions.json")
        log(f"provisions: {len(events)} events on the home page")
    except Exception as e:
        events = prev.get("events", [])
        log(f"provisions: couldn't read the home page ({e}); keeping the last {len(events)} events")
    try:
        menu = parse_menu(text(fetch("/deli-menu")))
        if not menu["sandwiches"]:
            raise RuntimeError("no sandwiches found on the Deli Menu (did the page change?)")
        log(f"provisions: {len(menu['sandwiches'])} sandwiches, {len(menu['small_plates'])} small plates")
    except Exception as e:
        menu = {"sandwiches": prev.get("sandwiches", []), "small_plates": prev.get("small_plates", [])}
        log(f"provisions: couldn't read the Deli Menu ({e}); keeping the last {len(menu['sandwiches'])} sandwiches")
    write_json("provisions.json", {**info, "events": events, **menu})


if __name__ == "__main__":
    main()
