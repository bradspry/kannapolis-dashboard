"""Elle's Tique (109 West Ave): the boutique's new arrivals and shop announcements, read daily from its home page
(ellestique.com, a Shopify store). Hours, address, links and the About blurb are a machine-parsed snapshot in
data/manual/ellestique.json; the home page's posted hours are checked against it and a change is logged.

Politeness: one request a day, for the home page only (robots.txt allows it), with the kdash User-Agent. The store's
products.json answers automated clients with "429 local_rate_limited", so it isn't used. If the page can't be read,
the last new arrivals are kept."""
from __future__ import annotations

import html
import json
import re
import urllib.request

from common import MANUAL, OUT, USER_AGENT, log, write_json

SITE = "https://ellestique.com"


def text(s: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", s or ""))).strip()


def fetch() -> str:
    req = urllib.request.Request(SITE + "/", headers={"User-Agent": USER_AGENT, "Accept": "text/html"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode("utf-8", "replace")


def parse_arrivals(page: str) -> list[dict]:
    """The home page's New Arrivals carousel: name, price, sizes, picture, link."""
    out, seen = [], set()
    for block in page.split('class="featured-collection-slider__product')[1:]:
        a = re.search(r'<h4[^>]*product-item__product-title[^>]*>\s*<a href="([^"]+)">(.*?)</a>', block, re.S)
        if not a or "/collections/new-arrivals" not in a.group(1):
            continue
        url = SITE + html.unescape(a.group(1))
        if url in seen:
            continue
        seen.add(url)
        prices = re.findall(r'<span class="product-item__price[^"]*">\s*(\$[\d,.]+)', block)
        was = re.search(r'<s(?:\s[^>]*)?>\s*(\$[\d,.]+)', block)  # struck-through "was" price, on sale items
        img = re.search(r'<img[^>]*class="image__img"[^>]*src="([^"]+)"', block)
        sizes = re.search(r'product-item__swatch-count">\s*([^<]+?)\s*<', block)
        out.append({
            "name": text(a.group(2)),
            "url": url,
            "price": prices[0] if prices else None,
            "was": was.group(1) if was else None,
            "sizes": sizes.group(1) if sizes else None,
            "sold_out": bool(re.search(r"sold[ -]out", block, re.I)),
            # Shopify's CDN resizes on request: 400 px wide is plenty for a tile or the window's grid
            "image": ("https:" + html.unescape(img.group(1)) if img.group(1).startswith("//") else html.unescape(img.group(1))).replace("width=320", "width=400") if img else None,
        })
    return out


def parse_notes(page: str) -> list[str]:
    notes = []
    for m in re.finditer(r'class="announcement-bar__item[^"]*"[^>]*>(.*?)</div>', page, re.S):
        t = text(m.group(1))
        if t and t not in notes:
            notes.append(t)
    return notes


def check_hours(page: str) -> None:
    m = re.search(r"Hours:\s*(.*?)(?:Read more|</)", text(page))
    if m:
        posted = m.group(1).strip()
        if posted != "Mon: Closed Tues-Fri: 11AM-6PM Sat: 10AM-6PM Sun: 1PM-4PM":
            log(f"ellestique: the posted hours changed ({posted!r}); update data/manual/ellestique.json")


def main() -> None:
    info = json.loads((MANUAL / "ellestique.json").read_text())
    try:
        page = fetch()
        arrivals, notes = parse_arrivals(page), parse_notes(page)
        check_hours(page)
        if not arrivals:
            raise RuntimeError("no new arrivals found on the home page (did the theme change?)")
        log(f"ellestique: {len(arrivals)} new arrivals, {len(notes)} announcements")
    except Exception as e:  # keep yesterday's
        prev = OUT / "ellestique.json"
        old = json.loads(prev.read_text()) if prev.exists() else {}
        arrivals, notes = old.get("arrivals", []), old.get("notes", [])
        log(f"ellestique: couldn't read the home page ({e}); keeping the last {len(arrivals)} new arrivals")
    write_json("ellestique.json", {**info, "arrivals": arrivals, "notes": notes})


if __name__ == "__main__":
    main()
