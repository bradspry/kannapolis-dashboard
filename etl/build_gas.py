"""Gas Prices (Transportation tab): the cheapest regular and diesel near Kannapolis, plus aviation fuel at
the two nearest airports, from Brad Spry's bradspry/kannapolis-gas (gas_prices.py, "Friday Fill-up").

The rules come from gas_prices.py itself (repo_constants): the ZIP codes, how many stations, the 24-hour
freshness cutoff, the stations scraped from their own sites (PINNED_STATIONS)
and the AirNav airport pages with their row pattern. Like the script:
- GasBuddy's crowd-sourced prices, through the py-gasbuddy package (the one part that isn't standard library;
  the "Refresh gas" workflow installs it); listings older than MAX_PRICE_AGE_HOURS are dropped;
- pinned stations read live from their own pages;
- ranked by the posted price, as `gas_prices.py --no-rewards` does (no rewards-program discounts);
- aviation fuel (100LL, Jet A) from AirNav;
- the week-over-week trend from listed prices: each run's average is kept in the history here (the script
  keeps its own in SQLite on Brad's computer).
If GasBuddy refuses a run (Cloudflare), the last good list is kept and marked with its date. Read daily."""
from __future__ import annotations

import asyncio
import datetime as dt
import json
import os
import re
import time
import urllib.request

from common import MANUAL, OUT, USER_AGENT, log, repo_constants, write_json

REPO = "kannapolis-gas"
NAMES = {"ZIP_CODES", "LIMIT", "MAX_PRICE_AGE_HOURS", "FUEL_GRADES", "AIRPORTS", "PINNED_STATIONS", "_AIRNAV_ROW"}
FUEL_FILTER = {"regular_gas": 1, "diesel": 4}  # GasBuddy's fuel filter ids (py-gasbuddy FUEL_FILTER_IDS)
BROWSER = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0 Safari/537.36"
HISTORY_DAYS = 400


def get(url: str) -> str:
    last: Exception | None = None
    for attempt in range(3):
        if attempt:
            time.sleep(4 * attempt)
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": BROWSER}), timeout=30) as r:
                return r.read().decode("utf-8", "replace")
        except Exception as e:  # noqa: BLE001
            last = e
    raise RuntimeError(f"{url} failed: {last}")


def fmt_address(a: str) -> str:
    """Title case, keeping NE/NW/SE/SW/NC upper case (gas_prices.py's _fmt_address)."""
    return re.sub(r"\b(Ne|Nw|Se|Sw|Nc)\b", lambda m: m.group().upper(), a.title())


async def gasbuddy(cfg: dict, field: str) -> tuple[list[dict], list[dict]]:
    from py_gasbuddy import GasBuddy  # third-party: pip install py-gasbuddy

    gb = GasBuddy()
    now = dt.datetime.now(dt.timezone.utc)
    out, trend = [], []
    for z in cfg["ZIP_CODES"]:
        res = await gb.price_lookup_service(zipcode=z, limit=cfg["LIMIT"] * 2, fuel=FUEL_FILTER[field])
        if "results" not in res:
            raise RuntimeError(f"GasBuddy: {res.get('error', res)}")
        trend = trend or res.get("trend") or []
        for r in res["results"]:
            p = r.get(field) or {}
            if p.get("price") is None:
                continue
            upd = p.get("last_updated")
            if upd and (now - dt.datetime.fromisoformat(upd.replace("Z", "+00:00"))).total_seconds() / 3600 > cfg["MAX_PRICE_AGE_HOURS"]:
                continue
            a = r.get("address") or {}
            out.append({"name": r["name"], "address": fmt_address(a.get("line1", "")), "city": (a.get("locality") or "").title(),
                        "price": float(p["price"]), "updated": upd, "lat": r.get("latitude"), "lon": r.get("longitude"),
                        "url": f"https://www.gasbuddy.com/station/{r['station_id']}", "source": "GasBuddy"})
    return out, trend


def pinned(cfg: dict, label: str) -> list[dict]:
    out = []
    for st in cfg["PINNED_STATIONS"]:
        try:
            html = get(st["url"])
        except Exception as e:  # noqa: BLE001 - skipped, as the script does
            log(f"gas: {st['name']} unreachable ({e})")
            continue
        m = re.search(rf"{re.escape(label)}(?:<!-- -->)?:.*?\$([0-9]+\.[0-9]+)</span>", html, re.DOTALL | re.IGNORECASE)
        ll = re.search(r"destination=(-?\d+\.\d+),(-?\d+\.\d+)", html)
        if m:
            out.append({"name": st["name"], "address": st["address"], "city": None, "price": float(m.group(1)), "updated": None,
                        "lat": float(ll.group(1)) if ll else None, "lon": float(ll.group(2)) if ll else None, "url": st["url"], "source": st["name"]})
    return out


def rank(stations: list[dict], cfg: dict) -> list[dict]:
    seen, merged = set(), []
    for s in stations:
        key = (s["name"].lower(), s["address"].lower())
        if key not in seen:
            seen.add(key)
            merged.append(s)
    merged.sort(key=lambda s: s["price"])
    return merged[: cfg["LIMIT"]]


def aviation(cfg: dict, airports: dict) -> list[dict]:
    out = []
    for ap in cfg["AIRPORTS"]:
        try:
            html = get(ap["url"])
        except Exception as e:  # noqa: BLE001
            log(f"gas: {ap['name']} unreachable ({e})")
            continue
        code = re.search(r"\((K[A-Z0-9]{3})\)", ap["name"])
        for fuel, service, price in cfg["_AIRNAV_ROW"].findall(html):
            out.append({"airport": ap["name"], "code": code.group(1) if code else None, "fuel": fuel.strip(), "service": service.strip().lower(),
                        "price": float(price), "url": ap["url"], **airports.get(code.group(1) if code else "", {})})
    out.sort(key=lambda x: x["price"])
    return out


def week_trend(history: list[dict], grade: str, today: str, avg: float | None) -> dict | None:
    """gas_prices.py's rule: compare with the run nearest 7 days ago that's at least 3 days old."""
    if avg is None:
        return None
    t = dt.date.fromisoformat(today)
    old = [h for h in history if h.get(grade) is not None and (t - dt.date.fromisoformat(h["date"])).days > 3]
    if not old:
        return None
    ref = min(old, key=lambda h: abs((t - dt.date.fromisoformat(h["date"])).days - 7))
    delta = round(avg - ref[grade], 3)
    return {"delta": delta, "since": ref["date"], "direction": "up" if delta > 0.005 else "down" if delta < -0.005 else "steady"}


def main() -> None:
    info = json.loads((MANUAL / "gas.json").read_text())
    cfg = repo_constants(REPO, "gas_prices.py", NAMES)
    prev_file = OUT / "gas.json"
    prev = json.loads(prev_file.read_text()) if prev_file.exists() else {}
    try:
        import py_gasbuddy  # noqa: F401
    except ImportError as e:
        # On GitHub the workflow installs it, so a failed import is a real problem: fail the run so it shows.
        if prev and not os.environ.get("GITHUB_ACTIONS"):
            log(f"gas: py-gasbuddy isn't usable here ({e}); keeping the last prices (pip install py-gasbuddy==0.7.2, Python 3.13+)")
            return
        raise
    today = dt.date.today().isoformat()
    grades, trend_area = {}, []
    for key in ("regular", "diesel"):
        g = cfg["FUEL_GRADES"][key]
        try:
            gb, area = asyncio.run(gasbuddy(cfg, g["field"]))
            trend_area = trend_area or area
            stations = rank(gb + pinned(cfg, g["pinned_label"]), cfg)
            if not stations:
                raise RuntimeError("no fresh prices")
            avg = round(sum(s["price"] for s in stations) / len(stations), 3)
            grades[key] = {"label": g["label"], "stations": stations, "average": avg, "checked": today, "stale": False}
        except Exception as e:  # noqa: BLE001 - keep last good list
            old = (prev.get("grades") or {}).get(key)
            if not old:
                raise
            log(f"gas: {key} failed ({e}); keeping the list from {old['checked']}")
            grades[key] = {**old, "stale": True}
    airports = info.get("airports", {})
    av = aviation(cfg, airports) or [{**x, "stale": True} for x in prev.get("aviation", [])]
    history = [h for h in prev.get("history", []) if h["date"] != today]
    entry = {"date": today, **{k: g["average"] for k, g in grades.items() if not g["stale"]}}
    if len(entry) > 1:
        history.append(entry)
    cutoff = (dt.date.today() - dt.timedelta(days=HISTORY_DAYS)).isoformat()
    history = sorted((h for h in history if h["date"] >= cutoff), key=lambda h: h["date"])
    for k, g in grades.items():
        g["trend"] = week_trend(history, k, today, None if g["stale"] else g["average"]) if not g["stale"] else g.get("trend")
    area = {a["area"]: a for a in trend_area} if trend_area else prev.get("area", {})
    for k, g in grades.items():
        log(f"gas: {k}: {len(g['stations'])} stations, cheapest ${g['stations'][0]['price']:.2f} at {g['stations'][0]['name']}, avg ${g['average']:.3f}"
            + (f", week {g['trend']['delta']:+.3f}" if g.get("trend") else ""))
    log(f"gas: aviation: {len(av)} prices")
    write_json("gas.json", {**info, "zips": cfg["ZIP_CODES"], "max_age_hours": cfg["MAX_PRICE_AGE_HOURS"], "grades": grades, "aviation": av,
                            "area": area, "history": history,
                            "repo": "https://github.com/bradspry/kannapolis-gas"})


if __name__ == "__main__":
    main()
