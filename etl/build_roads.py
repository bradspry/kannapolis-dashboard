"""City Roads (Transportation tab): which streets in Kannapolis the City maintains and which the state (NCDOT)
does, from Brad Spry's bradspry/kannapolis-city-roads (kannapolis_city_roads.py).

In North Carolina NCDOT maintains interstates, US and NC routes and secondary state roads; a city maintains
the local streets inside its limits. Like the script, this approximates that split from OpenStreetMap's
highway classification, inside the City's limits as filed with NCDOT's Powell Bill Program. The road types,
the boundary layer and the city's name are read from the script (repo_constants). The script draws the
drivable network with osmnx; here the same roads come straight from OpenStreetMap's Overpass API (the drive
network: public road types, no service roads, paths or private/no-car ways), are clipped to the city limits
and measured in miles. The map's lines are simplified to about 6 m and stored compactly. Read weekly.

Road data © OpenStreetMap contributors (ODbL 1.0)."""
from __future__ import annotations

import json
import math
import time
import urllib.parse
import urllib.request

from common import USER_AGENT, log, repo_constants, write_json

REPO = "kannapolis-city-roads"
OVERPASS = "https://overpass-api.de/api/interpreter"
# osmnx's "drive" network: public roads you can drive, minus service roads and anything closed to cars.
DRIVE = ("motorway|motorway_link|trunk|trunk_link|primary|primary_link|secondary|secondary_link|tertiary|tertiary_link|"
         "unclassified|residential|living_street|road")
EARTH_MI = 3958.8
Q = 1e5  # stored coordinates: degrees × 100,000, relative to the frame's corner (about 1 m)


def get(url: str, data: bytes | None = None, retries: int = 3) -> bytes:
    last: Exception | None = None
    for attempt in range(retries):
        if attempt:
            time.sleep(15 * attempt)
        try:
            req = urllib.request.Request(url, data=data, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=180) as r:
                return r.read()
        except Exception as e:  # noqa: BLE001
            last = e
    raise RuntimeError(f"{url} failed: {last}")


def boundary(cfg: dict) -> list[list[list[float]]]:
    q = urllib.parse.urlencode({"where": f"MunicipalBoundaryNameUpperCase = '{cfg['BOUNDARY_NAME']}'", "outFields": "MunicipalBoundaryName,ChangeYear", "f": "geojson"})
    feats = json.loads(get(f"{cfg['BOUNDARY_URL']}?{q}"))["features"]
    if not feats:
        raise RuntimeError(f"roads: no NCDOT boundary for {cfg['BOUNDARY_NAME']}")
    g = feats[0]["geometry"]
    polys = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
    return polys  # [[outer, hole, …], …]


def inside(pt, polys) -> bool:
    x, y = pt
    hit = False
    for poly in polys:
        for ring in poly:  # even-odd across all rings handles holes
            j = len(ring) - 1
            for i in range(len(ring)):
                xi, yi = ring[i]
                xj, yj = ring[j]
                if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
                    hit = not hit
                j = i
    return hit


def miles(a, b) -> float:
    la1, la2 = math.radians(a[1]), math.radians(b[1])
    d = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin(math.radians(b[0] - a[0]) / 2) ** 2
    return 2 * EARTH_MI * math.asin(math.sqrt(d))


def simplify(pts, tol):
    """Douglas-Peucker on lon/lat (tol in degrees)."""
    if len(pts) < 3:
        return pts
    k = math.cos(math.radians(pts[0][1]))
    (x0, y0), (x1, y1) = pts[0], pts[-1]
    dx, dy = (x1 - x0) * k, y1 - y0
    norm = math.hypot(dx, dy) or 1e-12
    best, idx = -1.0, 0
    for i in range(1, len(pts) - 1):
        px, py = (pts[i][0] - x0) * k, pts[i][1] - y0
        dist = abs(dx * py - dy * px) / norm if norm > 1e-12 else math.hypot(px, py)
        if dist > best:
            best, idx = dist, i
    if best <= tol:
        return [pts[0], pts[-1]]
    return simplify(pts[: idx + 1], tol)[:-1] + simplify(pts[idx:], tol)


def main() -> None:
    cfg = repo_constants(REPO, "kannapolis_city_roads.py", {"BOUNDARY_URL", "BOUNDARY_NAME", "STATE_TYPES", "SKIP_TYPES", "LABEL_TYPES"})
    polys = boundary(cfg)
    xs = [p[0] for poly in polys for p in poly[0]]
    ys = [p[1] for poly in polys for p in poly[0]]
    s, w, n, e = min(ys), min(xs), max(ys), max(xs)
    query = (f'[out:json][timeout:150];way["highway"~"^({DRIVE})$"]["area"!="yes"]["motor_vehicle"!="no"]["motorcar"!="no"]'
             f'["access"!~"^(private|no)$"]({s},{w},{n},{e});out geom tags;')
    ways = json.loads(get(OVERPASS, urllib.parse.urlencode({"data": query}).encode()))["elements"]
    state_types, skip = set(cfg["STATE_TYPES"]), set(cfg["SKIP_TYPES"])
    out = {"city": [], "state": []}
    mi = {"city": 0.0, "state": 0.0}
    by_type: dict[str, float] = {}
    names: dict[str, dict] = {}
    for wy in ways:
        hw = wy["tags"].get("highway", "")
        if hw in skip:
            continue
        kind = "state" if hw in state_types else "city"
        pts = [(g["lon"], g["lat"]) for g in wy.get("geometry", [])]
        flags = [inside(p, polys) for p in pts]
        run: list = []
        runs = []
        for p, f in zip(pts, flags):
            if f:
                run.append(p)
            elif run:
                runs.append(run)
                run = []
        if run:
            runs.append(run)
        for r in runs:
            if len(r) < 2:
                continue
            length = sum(miles(a, b) for a, b in zip(r, r[1:]))
            mi[kind] += length
            by_type[hw] = by_type.get(hw, 0) + length
            nm = wy["tags"].get("name") or wy["tags"].get("ref")
            if nm:
                x = names.setdefault(nm, {"name": nm, "miles": 0.0, "kind": kind, "ref": wy["tags"].get("ref")})
                x["miles"] += length
                if kind == "state":
                    x["kind"] = "state"
            simple = simplify(r, 6e-5)
            out[kind].append([v for p in simple for v in (round((p[0] - w) * Q), round((p[1] - s) * Q))])
    if mi["city"] < 50:
        raise RuntimeError(f"roads: only {mi['city']:.0f} city miles; Overpass answer looks incomplete")
    top = sorted((x for x in names.values() if x["kind"] == "city"), key=lambda x: -x["miles"])[:12]
    top_state = sorted((x for x in names.values() if x["kind"] == "state"), key=lambda x: -x["miles"])[:8]
    rings = [[v for p in simplify(ring, 4e-5) for v in (round((p[0] - w) * Q), round((p[1] - s) * Q))] for poly in polys for ring in poly]
    total = mi["city"] + mi["state"]
    log(f"roads: {mi['city']:.0f} city-maintained miles, {mi['state']:.0f} state ({100 * mi['city'] / total:.0f}% city); "
        f"{len(out['city'])} + {len(out['state'])} lines")
    write_json("roads.json", {"title": "City Roads", "origin": [w, s], "scale": Q, "boundary": rings,
                              "miles": {k: round(v, 1) for k, v in mi.items()}, "by_type": {k: round(v, 1) for k, v in sorted(by_type.items(), key=lambda kv: -kv[1])},
                              "top_city": [{**x, "miles": round(x["miles"], 1)} for x in top], "top_state": [{**x, "miles": round(x["miles"], 1)} for x in top_state],
                              "lines": out, "state_types": sorted(state_types), "repo": "https://github.com/bradspry/kannapolis-city-roads",
                              "links": {"powell_bill": "https://connect.ncdot.gov/municipalities/State-Street-Aid/Pages/default.aspx",
                                        "boundary": "https://www.arcgis.com/home/item.html?id=ee098aeaf28d44138d63446fbdaac1ee",
                                        "osm": "https://www.openstreetmap.org/copyright"}})


if __name__ == "__main__":
    main()
