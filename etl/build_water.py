"""Lakes & Rivers (City tab): water levels around Kannapolis and where the city's water comes from, from Brad
Spry's bradspry/kannapolis-water-levels (water_map.py).

Everything about what to read and where it is comes from water_map.py (repo_constants): the lakes and gauges
with their coordinates and full-pool levels, and the water-supply sources with their million gallons a day
(MGD). The same four live sources, fetched here with the standard library (no requests/BeautifulSoup):
- City lakes (Lake Howell/Coddle Creek, Lake Fisher, Lake Concord): the City of Concord's Lake Level Data page;
- USGS stream gauges (Second Creek, Yadkin River): flow now (cfs) and where it ranks among the same calendar
  day's history (USGS daily statistics), interpolated the way water_map.py does;
- NOAA NWPS lake gauges on the Catawba (Lookout Shoals, Lake Norman, Mountain Island): pool level;
- Cube Hydro Carolinas' Yadkin reservoirs (High Rock, Tuckertown, Badin): hourly pool level.
Kannapolis Lake has no public sensor; water_map.py asks for a reading when it runs. Here the reading is
data/manual/water.json's kannapolis_lake (blank = none). A source that fails keeps its last reading, marked
with its date. Readings go into a daily history for the day-over-day trend arrows. Read daily."""
from __future__ import annotations

import datetime as dt
import html as htmllib
import json
import re
import time
import urllib.parse
import urllib.request

from common import MANUAL, OUT, USER_AGENT, log, repo_constants, write_json

REPO = "kannapolis-water-levels"
NAMES = {"LAKES", "USGS_SITES", "CUBE_LAKES", "NOAA_LAKES", "KANNAPOLIS_HUB", "EXISTING_CAPACITY_MGD", "SUPPLY_SOURCES",
         "OWN_COLOR", "NEIGHBOR_COLOR", "UNVERIFIED_COLOR", "LAKE_URL", "CUBE_HYDRO_URL", "NOAA_GAUGE_URL", "USGS_IV_URL"}
BROWSER = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
HISTORY_DAYS = 400


def get(url: str, browser: bool = False, timeout: int = 30, retries: int = 3) -> str:
    last: Exception | None = None
    for attempt in range(retries):
        if attempt:
            time.sleep(4 * attempt)
        try:
            req = urllib.request.Request(url, headers={"User-Agent": BROWSER if browser else USER_AGENT})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read().decode("utf-8", "replace")
        except Exception as e:  # noqa: BLE001
            last = e
    raise RuntimeError(f"{url} failed: {last}")


def text_of(page: str) -> str:
    page = re.sub(r"(?is)<(script|style)\b.*?</\1>", " ", page)
    return htmllib.unescape(re.sub(r"<[^>]+>", "\n", page))


def inches(level: str) -> float | None:
    """'30.0" Below Full' -> -30.0; 'Full' -> 0; above full is positive."""
    t = level.lower()
    if t.strip() == "full":
        return 0.0
    m = re.search(r"([\d.]+)", t)
    if not m:
        return None
    return float(m.group(1)) * (1 if "above" in t else -1)


def city_lakes(cfg: dict) -> tuple[dict, str | None]:
    text = text_of(get(cfg["LAKE_URL"], browser=True))
    text = "\n".join(line.strip() for line in text.splitlines() if line.strip())
    upd = re.search(r"Levels updated\s+(\d{2}/\d{2}/\d{4})", text)
    pat = re.compile(r"(Howell/Coddle Creek|Fisher|Concord)\s*\n\s*([^\n]*(?:Below Full|Full|Above Full)[^\n]*)", re.IGNORECASE)
    levels = {k.strip(): v.strip() for k, v in pat.findall(text)}
    if not levels:
        raise RuntimeError("no lake levels on the Concord page")
    when = dt.datetime.strptime(upd.group(1), "%m/%d/%Y").date().isoformat() if upd else None
    return levels, when


def usgs(cfg: dict) -> dict:
    sites = ",".join(s["site_no"] for s in cfg["USGS_SITES"].values())
    iv = json.loads(get(f"{cfg['USGS_IV_URL']}?" + urllib.parse.urlencode({"sites": sites, "format": "json", "period": "PT6H", "parameterCd": "00060"})))
    flows = {}
    for ts in iv["value"]["timeSeries"]:
        vals = [v for v in ts["values"][0]["value"] if v["value"] not in ("", "-999999")]
        if vals:
            flows[ts["sourceInfo"]["siteCode"][0]["value"]] = (float(vals[-1]["value"]), vals[-1]["dateTime"])
    rdb = get("https://waterservices.usgs.gov/nwis/stat/?" + urllib.parse.urlencode(
        {"sites": sites, "statReportType": "daily", "statType": "all", "parameterCd": "00060", "format": "rdb"}))
    today = dt.date.today()
    hist: dict[str, dict] = {}
    header = None
    for line in rdb.splitlines():
        if line.startswith("#") or not line.strip():
            continue
        parts = line.split("\t")
        if header is None:
            header = parts
            continue
        if parts[0] != "USGS":
            continue
        row = dict(zip(header, parts))
        if row.get("parameter_cd") != "00060" or int(row["month_nu"]) != today.month or int(row["day_nu"]) != today.day:
            continue
        hist[row["site_no"]] = {k: float(row[k]) for k in ("p05_va", "p10_va", "p20_va", "p25_va", "p50_va", "p75_va", "p80_va", "p90_va", "p95_va") if row.get(k)}
        hist[row["site_no"]]["years"] = f"{row.get('begin_yr')}–{row.get('end_yr')}"
    out = {}
    for name, s in cfg["USGS_SITES"].items():
        flow, when = flows.get(s["site_no"], (None, None))
        p = hist.get(s["site_no"], {})
        out[name] = {"name": name, "site_no": s["site_no"], "lat": s["lat"], "lon": s["lon"], "flow_cfs": flow, "at": when,
                     "median_cfs": p.get("p50_va"), "percentile": percentile(flow, p), "record_years": p.get("years"),
                     "url": f"https://waterdata.usgs.gov/monitoring-location/USGS-{s['site_no']}/"}
    return out


def percentile(value: float | None, p: dict) -> float | None:
    """water_map.py's _interpolate_percentile: where today's flow falls among the day's historical percentiles."""
    if value is None:
        return None
    known = [(q, p.get(f"p{q:02d}_va")) for q in (5, 10, 20, 25, 50, 75, 80, 90, 95)]
    known = [(q, v) for q, v in known if v is not None]
    if not known:
        return None
    if value <= known[0][1]:
        return float(known[0][0])
    if value >= known[-1][1]:
        return float(known[-1][0])
    for (q0, v0), (q1, v1) in zip(known, known[1:]):
        if v0 <= value <= v1:
            return round(q0 + (value - v0) / (v1 - v0 or 1) * (q1 - q0), 1)
    return None


def noaa(cfg: dict) -> dict:
    out = {}
    for lid, c in cfg["NOAA_LAKES"].items():
        d = json.loads(get(f"{cfg['NOAA_GAUGE_URL']}/{lid}"))
        obs = d["status"]["observed"]
        pool = obs["primary"] if obs["primary"] != -999 else None
        out[lid] = {"id": lid, "name": c["display"], "lat": c["lat"], "lon": c["lon"], "hidden": c.get("hidden", False),
                    "elevation_ft": pool, "full_pool": c["full_pool"], "ft_below_full": round(c["full_pool"] - pool, 2) if pool is not None else None,
                    "at": obs.get("validTime"), "source": "NOAA", "url": f"https://water.noaa.gov/gauges/{lid.lower()}"}
    return out


def cube(cfg: dict) -> tuple[dict, str | None]:
    page = get(cfg["CUBE_HYDRO_URL"], timeout=20, retries=2)
    ts = re.search(r'id="FormView1_timestmpLabel"[^>]*>([^<]*)<', page)
    table = re.search(r'(?is)<table[^>]*id="GridView1".*?</table>', page)
    out = {}
    for row in re.findall(r"(?is)<tr[^>]*>(.*?)</tr>", table.group(0) if table else ""):
        cells = [htmllib.unescape(re.sub(r"<[^>]+>", "", c)).strip() for c in re.findall(r"(?is)<td[^>]*>(.*?)</td>", row)]
        if len(cells) >= 3 and cells[0] in cfg["CUBE_LAKES"]:
            c = cfg["CUBE_LAKES"][cells[0]]
            out[cells[0]] = {"id": cells[0], "name": c["display"], "lat": c["lat"], "lon": c["lon"], "hidden": c.get("hidden", False),
                             "elevation_ft": float(cells[1]), "ft_below_full": float(cells[2]), "source": "Cube Hydro Carolinas",
                             "url": cfg["CUBE_HYDRO_URL"]}
    if not out:
        raise RuntimeError("no reservoirs in the Cube Hydro table")
    return out, ts.group(1).strip() if ts else None


def trend(history: list[dict], key: str, today: str, value: float | None) -> float | None:
    """Change since the most recent earlier day with a reading (the map's day-over-day arrows)."""
    if value is None:
        return None
    prior = [h for h in history if h["date"] < today and h.get(key) is not None]
    return round(value - prior[-1][key], 2) if prior else None


def main() -> None:
    info = json.loads((MANUAL / "water.json").read_text())
    cfg = repo_constants(REPO, "water_map.py", NAMES)
    prev_file = OUT / "water.json"
    prev = json.loads(prev_file.read_text()) if prev_file.exists() else {}
    today = dt.date.today().isoformat()
    stale = {}

    def keep(name, fn):
        try:
            return fn()
        except Exception as e:  # noqa: BLE001 - the other sources still stand
            log(f"water: {name} failed ({e}); keeping the last reading")
            stale[name] = (prev.get("checked") or {}).get(name)
            return None

    # City lakes, plus Kannapolis Lake's manual reading.
    got = keep("concord", lambda: city_lakes(cfg))
    lakes_prev = {x["key"]: x for x in prev.get("city_lakes", [])}
    city = []
    for key, c in cfg["LAKES"].items():
        if key == "Kannapolis Lake":
            kl = info.get("kannapolis_lake") or {}
            level = kl.get("level") or None
            city.append({"key": key, "name": c.get("display", key), "lat": c["lat"], "lon": c["lon"], "hidden": c.get("hidden", False),
                         "level": level, "inches": inches(level) if level else None, "updated": kl.get("date"), "manual": True,
                         "status": kl.get("status"), "status_url": kl.get("status_url"), "source": kl.get("source")})
            continue
        if got:
            level = got[0].get(key)
            city.append({"key": key, "name": f"Lake {key}" if "/" not in key else "Lake Howell (Coddle Creek)", "lat": c["lat"], "lon": c["lon"],
                         "hidden": c.get("hidden", False), "level": level, "inches": inches(level) if level else None, "updated": got[1]})
        elif key in lakes_prev:
            city.append({**lakes_prev[key], "stale": True})
    streams = keep("usgs", lambda: usgs(cfg)) or {k["name"]: {**k, "stale": True} for k in prev.get("streams", [])}
    catawba = keep("noaa", lambda: noaa(cfg)) or {k["id"]: {**k, "stale": True} for k in prev.get("reservoirs", []) if k.get("source") == "NOAA"}
    cube_got = keep("cube", lambda: cube(cfg))
    yadkin, cube_at = cube_got if cube_got else ({k["id"]: {**k, "stale": True} for k in prev.get("reservoirs", []) if k.get("source") != "NOAA"}, prev.get("cube_updated"))
    reservoirs = list(catawba.values()) + list(yadkin.values())

    # Daily history and day-over-day trends.
    history = [h for h in prev.get("history", []) if h["date"] != today]
    entry = {"date": today}
    for l in city:
        if l.get("inches") is not None and not l.get("stale"):
            entry[f"lake:{l['key']}"] = l["inches"]
    for s in streams.values():
        if s.get("flow_cfs") is not None and not s.get("stale"):
            entry[f"usgs:{s['site_no']}"] = s["flow_cfs"]
    for r in reservoirs:
        if r.get("elevation_ft") is not None and not r.get("stale"):
            entry[f"res:{r['id']}"] = r["elevation_ft"]
    for l in city:
        l["change_in"] = trend(history, f"lake:{l['key']}", today, l.get("inches"))
    for s in streams.values():
        s["change_cfs"] = trend(history, f"usgs:{s['site_no']}", today, s.get("flow_cfs"))
    for r in reservoirs:
        r["change_ft"] = trend(history, f"res:{r['id']}", today, r.get("elevation_ft"))
    if len(entry) > 1:
        history.append(entry)
    cutoff = (dt.date.today() - dt.timedelta(days=HISTORY_DAYS)).isoformat()
    history = sorted((h for h in history if h["date"] >= cutoff), key=lambda h: h["date"])

    checked = {**(prev.get("checked") or {}), **{k: today for k in ("concord", "usgs", "noaa", "cube") if k not in stale}}
    supply = [{k: s.get(k) for k in ("name", "map_key", "via", "short", "bar_label", "lat", "lon", "mgd", "owner", "planned", "year")} for s in cfg["SUPPLY_SOURCES"]]
    log(f"water: {len(city)} city lakes, {len(streams)} streams, {len(reservoirs)} reservoirs; stale: {', '.join(stale) or 'none'}")
    write_json("water.json", {**info, "hub": cfg["KANNAPOLIS_HUB"], "city_lakes": city, "streams": list(streams.values()), "reservoirs": reservoirs,
                              "cube_updated": cube_at, "supply": supply, "existing_mgd": cfg["EXISTING_CAPACITY_MGD"],
                              "owner_colors": {"own": cfg["OWN_COLOR"], "neighbor": cfg["NEIGHBOR_COLOR"], "unverified": cfg["UNVERIFIED_COLOR"]},
                              "checked": checked, "history": history, "repo": "https://github.com/bradspry/kannapolis-water-levels",
                              "links": {"concord": cfg["LAKE_URL"], "cube": cfg["CUBE_HYDRO_URL"]}})


if __name__ == "__main__":
    main()
