"""Shopping tab: local shops' featured products and notices, read daily from each shop's home page. Hours, address,
links, the About blurb and any dated event are a machine-parsed snapshot in data/manual/<id>.json.

  ellestique  Elle's Tique, 109 West Ave (ellestique.com): the New Arrivals carousel and the announcement bar
  sweetest    Sweetest Beginnings, 349-B Copperfield Blvd, Concord (shopsweetestbeginnings.com): the featured
              product cards (women's apparel, Quincy Mae, goat milk soaps)
  cardiacs    CARDIACS Sports & Memorabilia, 133 West Ave (thecardiacs.com): Just Released, notices, and any posted
              holiday hours (which become the shop's special hours)

Politeness: one request a day per shop, for the home page only (robots.txt allows it), with the kdash User-Agent.
Both are Shopify stores whose products.json and collection pages answer automated clients with "429", so those
aren't used. If a page can't be read, that shop's last products are kept."""
from __future__ import annotations

import html
import json
import re
import urllib.request

from common import MANUAL, OUT, USER_AGENT, log, write_json


def text(s: str) -> str:
    s = re.sub(r"<(script|style)\b.*?</\1>", " ", s or "", flags=re.S | re.I)  # code isn't text
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", s))).strip()


def absolute(site: str, u: str) -> str:
    u = html.unescape(u)
    return "https:" + u if u.startswith("//") else site + u if u.startswith("/") else u


def fetch(site: str) -> str:
    req = urllib.request.Request(site + "/", headers={"User-Agent": USER_AGENT, "Accept": "text/html"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode("utf-8", "replace")


# ---------- Elle's Tique (Shopify theme with product-item cards) ----------

def parse_ellestique(page: str, site: str) -> tuple[list[dict], list[str]]:
    out, seen = [], set()
    for block in page.split('class="featured-collection-slider__product')[1:]:
        a = re.search(r'<h4[^>]*product-item__product-title[^>]*>\s*<a href="([^"]+)">(.*?)</a>', block, re.S)
        if not a or "/collections/new-arrivals" not in a.group(1):
            continue
        url = absolute(site, a.group(1))
        if url in seen:
            continue
        seen.add(url)
        prices = re.findall(r'<span class="product-item__price[^"]*">\s*(\$[\d,.]+)', block)
        was = re.search(r'<s(?:\s[^>]*)?>\s*(\$[\d,.]+)', block)  # struck-through "was" price, on sale items
        img = re.search(r'<img[^>]*class="image__img"[^>]*src="([^"]+)"', block)
        sizes = re.search(r'product-item__swatch-count">\s*([^<]+?)\s*<', block)
        out.append({"name": text(a.group(2)), "url": url, "price": prices[0] if prices else None, "was": was.group(1) if was else None,
                    "sizes": sizes.group(1) if sizes else None, "sold_out": bool(re.search(r"sold[ -]out", block, re.I)),
                    # Shopify's CDN resizes on request: 400 px wide is plenty for a tile or the window's grid
                    "image": absolute(site, img.group(1)).replace("width=320", "width=400") if img else None})
    notes = []
    for m in re.finditer(r'class="announcement-bar__item[^"]*"[^>]*>(.*?)</div>', page, re.S):
        t = text(m.group(1))
        if t and t not in notes:
            notes.append(t)
    m = re.search(r"Hours:\s*(.*?)(?:Read more|</)", text(page))
    if m and m.group(1).strip() != "Mon: Closed Tues-Fri: 11AM-6PM Sat: 10AM-6PM Sun: 1PM-4PM":
        log(f"shops: Elle's Tique's posted hours changed ({m.group(1).strip()!r}); update data/manual/ellestique.json")
    return out, notes


# ---------- Sweetest Beginnings (Shopify theme with <product-card> elements) ----------

def parse_sweetest(page: str, site: str) -> tuple[list[dict], list[str]]:
    out, seen = [], set()
    for block in page.split('class="product-card ')[1:]:
        block = block.split("</product-card>")[0]
        a = re.search(r'<a href="(/products/[^"]+)"[^>]*class="product-card-title"[^>]*>(.*?)</a>', block, re.S)
        if not a:
            continue
        url = absolute(site, a.group(1))
        if url in seen:
            continue
        seen.add(url)
        price = re.search(r'<ins>\s*<span class="amount[^"]*">\s*(\$[\d,.]+)', block) or re.search(r'class="amount[^"]*">\s*(\$[\d,.]+)', block)
        was = re.search(r'<del>\s*<span class="amount[^"]*">\s*(\$[\d,.]+)', block)
        img = re.search(r'<img[^>]*product-primary-image[^>]*data-srcset="([^" ]+)', block) or re.search(r'<img[^>]*data-srcset="([^" ]+)', block)
        vendor = re.search(r'product-card-vendor"><a[^>]*>(.*?)</a>', block, re.S)
        out.append({"name": text(a.group(2)), "url": url, "price": price.group(1) if price else None, "was": was.group(1) if was else None,
                    "vendor": text(vendor.group(1)) if vendor else None,
                    "sold_out": bool(re.search(r'badge[^"]*sold|>\s*Sold out\s*<', block, re.I)),
                    "image": absolute(site, img.group(1)) if img else None})
    notes = []
    t = text(page)
    if "SAME DAY SHIPPING" in t:
        notes.append("Same-day shipping on orders placed before 1 PM (not Sundays)")
    m = re.search(r"Come see our new space and say hello\.\s*(.*?)\s*(\d+-?[A-Z]? [A-Z][a-z]+ Blvd[^J]*?)\s+Join", t)
    if m and "349-B Copperfield" not in m.group(2):
        log(f"shops: Sweetest Beginnings' posted address changed ({m.group(2)!r}); update data/manual/sweetest.json")
    if m and m.group(1).strip() != "Monday to Saturday 10a - 6p":
        log(f"shops: Sweetest Beginnings' posted hours changed ({m.group(1).strip()!r}); update data/manual/sweetest.json")
    return out, notes


# ---------- CARDIACS Sports & Memorabilia (Shopify theme with product-item cards) ----------

MONTHS = "January|February|March|April|May|June|July|August|September|October|November|December"


def clock24(s: str) -> str:
    """'10 AM' / '7:30 PM' -> '10:00' / '19:30'."""
    m = re.match(r"(\d{1,2})(?::(\d{2}))?\s*([AP])M", s.strip(), re.I)
    hh, mm, ap = int(m.group(1)), int(m.group(2) or 0), m.group(3).upper()
    return f"{(hh % 12) + (12 if ap == 'P' else 0):02d}:{mm:02d}"


def parse_special(t: str) -> list[dict]:
    """Posted holiday hours ("November 26, 2026 THANKSGIVING DAY — CLOSED", "November 27, 2026 Open 10 AM–7 PM")."""
    import datetime as dt
    out = []
    for m in re.finditer(rf"({MONTHS}) (\d{{1,2}}), (\d{{4}})\s+(.{{0,60}}?)(?=(?:{MONTHS}) \d{{1,2}}, \d{{4}}|Free shipping|Two NC|$)", t):
        date = dt.datetime.strptime(f"{m.group(1)} {m.group(2)} {m.group(3)}", "%B %d %Y").date().isoformat()
        what = m.group(4).strip()
        hrs = re.search(r"Open\s+(\d{1,2}(?::\d{2})?\s*[AP]M)\s*[–-]\s*(\d{1,2}(?::\d{2})?\s*[AP]M)", what, re.I)
        if hrs:
            out.append({"date": date, "open": clock24(hrs.group(1)), "close": clock24(hrs.group(2))})
        elif re.search(r"\bCLOSED\b", what, re.I):
            label = re.sub(r"\s*[—–-]?\s*CLOSED.*", "", what, flags=re.I).strip().title().replace(" Day", " Day")
            out.append({"date": date, "closed": True, **({"label": label} if label else {})})
    return out


def parse_cardiacs(page: str, site: str) -> tuple[list[dict], list[str], list[dict]]:
    i = page.find("Just Released")
    section = page[i:] if i >= 0 else page
    section = re.split(r"<h2\b", section[len("Just Released"):], maxsplit=1)[0]  # up to the next section's heading
    out, seen = [], set()
    for block in section.split('class="product-item ')[1:]:
        a = re.search(r'<a href="(/products/[^"]+)"[^>]*class="product-item__title[^"]*"[^>]*>(.*?)</a>', block, re.S)
        if not a:
            continue
        url = absolute(site, a.group(1))
        if url in seen:
            continue
        seen.add(url)
        price = re.search(r'Sale price</span>\s*(\$[\d,.]+)', block) or re.search(r'class="price[^"]*">.*?(\$[\d,.]+)', block, re.S)
        was = re.search(r'Regular price</span>\s*(\$[\d,.]+)', block)
        img = re.search(r'class="product-item__primary-image"', block) and re.search(r'srcset="[^"]*?(//[^" ]+width=400)', block)
        out.append({"name": text(a.group(2)), "url": url, "price": price.group(1) if price else None, "was": was.group(1) if was else None,
                    "sold_out": bool(re.search(r">\s*Sold out\s*<", block, re.I)),
                    "image": absolute(site, img.group(1)) if img else None})
    t = text(page)
    notes = []
    m = re.search(r"Free (?:standard |economy )?shipping on all orders over \$\d+", t, re.I)
    if m:
        notes.append(m.group(0))
    m = re.search(r"Bring a new, unwrapped toy to our [^.]*\.", t)
    if "Toys for Tots" in t and m:
        notes.append(f"Toys for Tots: {m.group(0)}")
    return out, notes, parse_special(t)


PARSERS = {"ellestique": parse_ellestique, "sweetest": parse_sweetest, "cardiacs": parse_cardiacs}


def main() -> None:
    for sid, parse in PARSERS.items():
        info = json.loads((MANUAL / f"{sid}.json").read_text())
        special = None
        try:
            items, notes, *rest = parse(fetch(info["site"]), info["site"])
            special = rest[0] if rest else None
            if not items:
                raise RuntimeError("no products found on the home page (did the theme change?)")
            log(f"shops: {info['name']}: {len(items)} products, {len(notes)} notices")
        except Exception as e:  # keep yesterday's
            prev = OUT / f"{sid}.json"
            old = json.loads(prev.read_text()) if prev.exists() else {}
            items, notes = old.get("arrivals", []), old.get("notes", [])
            special = [x for x in old.get("special", []) if x not in info.get("special", [])] or None
            log(f"shops: {info['name']}: couldn't read the home page ({e}); keeping the last {len(items)} products")
        if special:  # posted holiday hours join the snapshot's; a posted date wins
            dates = {x["date"] for x in special}
            info["special"] = sorted([x for x in info.get("special", []) if x["date"] not in dates] + special, key=lambda x: x["date"])
        write_json(f"{sid}.json", {**info, "arrivals": items, "notes": notes})


if __name__ == "__main__":
    main()
