"""Transportation tab: every nonstop flight from Concord-Padgett Regional Airport (USA), the airport
closest to Kannapolis with airline service.

Routes are gathered by bradspry/kannapolis-travel (fetch_routes.py --flights-only, standard library),
which reads the airport's own Airlines page and OurAirports' coordinates; Avelo and Allegiant block
automated requests, so their sites aren't read. Checkout:

    git clone https://github.com/bradspry/kannapolis-travel .kannapolis-travel
    python3 etl/run_all.py flights site

Airport facts (terminal address, parking, airline phones) are machine-parsed into data/manual/flights.json.
The tile's outline map is Natural Earth land (world-atlas) and U.S. state lines (us-atlas, from the
Census Bureau's cartographic boundaries), clipped to the route map's frame."""
from __future__ import annotations

import json
import math
import os
import subprocess
import sys
import urllib.request
from pathlib import Path

from common import MANUAL, OUT, USER_AGENT, log, write_json

ROOT = Path(__file__).resolve().parent.parent
TRAVEL = Path(os.environ.get("KANNAPOLIS_TRAVEL", ROOT / ".kannapolis-travel"))
LAND = "https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/land-50m.json"
STATES = "https://cdn.jsdelivr.net/npm/us-atlas@3.0.1/states-10m.json"
EARTH_MI = 3958.8


def get_json(url: str) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read())


# ---------- TopoJSON → polygons (lon/lat rings) ----------
def topo_rings(topo: dict, obj: str) -> list[list[list[float]]]:
    sx, sy = topo["transform"]["scale"]
    tx, ty = topo["transform"]["translate"]
    arcs = []
    for arc in topo["arcs"]:
        x = y = 0
        pts = []
        for dx, dy in arc:
            x, y = x + dx, y + dy
            pts.append([x * sx + tx, y * sy + ty])
        arcs.append(pts)

    def ring(idxs):
        out = []
        for i in idxs:
            a = arcs[i] if i >= 0 else arcs[~i][::-1]
            out.extend(a if not out else a[1:])
        return out

    rings = []
    def geom(g):
        if g["type"] == "GeometryCollection":
            for c in g["geometries"]:
                geom(c)
        elif g["type"] == "Polygon":
            rings.extend(ring(r) for r in g["arcs"])
        elif g["type"] == "MultiPolygon":
            rings.extend(ring(r) for p in g["arcs"] for r in p)
    geom(topo["objects"][obj])
    return rings


def clip(ring: list, box: tuple) -> list:
    """Sutherland–Hodgman: a polygon ring clipped to a lon/lat rectangle."""
    x0, y0, x1, y1 = box
    edges = [(lambda p: p[0] >= x0, lambda a, b: (x0, a[1] + (b[1] - a[1]) * (x0 - a[0]) / (b[0] - a[0]))),
             (lambda p: p[0] <= x1, lambda a, b: (x1, a[1] + (b[1] - a[1]) * (x1 - a[0]) / (b[0] - a[0]))),
             (lambda p: p[1] >= y0, lambda a, b: (a[0] + (b[0] - a[0]) * (y0 - a[1]) / (b[1] - a[1]), y0)),
             (lambda p: p[1] <= y1, lambda a, b: (a[0] + (b[0] - a[0]) * (y1 - a[1]) / (b[1] - a[1]), y1))]
    pts = ring
    for inside, cross in edges:
        if not pts:
            break
        out = []
        for i, b in enumerate(pts):
            a = pts[i - 1]
            if inside(b):
                if not inside(a):
                    out.append(cross(a, b))
                out.append(b)
            elif inside(a):
                out.append(cross(a, b))
        pts = out
    return pts


def simplify(pts: list, tol: float) -> list:
    """Douglas–Peucker in degrees (fine for an outline drawn a few hundred pixels wide)."""
    if len(pts) < 4:
        return pts
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        i, j = stack.pop()
        (ax, ay), (bx, by) = pts[i], pts[j]
        dx, dy = bx - ax, by - ay
        best, idx = 0.0, None
        for n in range(i + 1, j):
            px, py = pts[n]
            if dx == dy == 0:
                d = math.hypot(px - ax, py - ay)
            else:
                t = max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
                d = math.hypot(px - ax - t * dx, py - ay - t * dy)
            if d > best:
                best, idx = d, n
        if idx is not None and best > tol:
            keep[idx] = True
            stack += [(i, idx), (idx, j)]
    return [p for p, k in zip(pts, keep) if k]


def outline(url: str, obj: str, box: tuple, tol: float) -> list:
    out = []
    for r in topo_rings(get_json(url), obj):
        c = simplify(clip(r, box), tol)
        if len(c) >= 4:
            out.append([[round(x, 2), round(y, 2)] for x, y in c])
    return out


# ---------- great circles ----------
def miles(a: tuple, b: tuple) -> float:
    (lo1, la1), (lo2, la2) = [(math.radians(x), math.radians(y)) for x, y in (a, b)]
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * EARTH_MI * math.asin(math.sqrt(h))


def arc(a: tuple, b: tuple, n: int = 32) -> list:
    (lo1, la1), (lo2, la2) = [(math.radians(x), math.radians(y)) for x, y in (a, b)]
    v1 = (math.cos(la1) * math.cos(lo1), math.cos(la1) * math.sin(lo1), math.sin(la1))
    v2 = (math.cos(la2) * math.cos(lo2), math.cos(la2) * math.sin(lo2), math.sin(la2))
    w = math.acos(max(-1, min(1, sum(p * q for p, q in zip(v1, v2)))))
    pts = []
    for i in range(n + 1):
        t = i / n
        s1, s2 = math.sin((1 - t) * w) / math.sin(w), math.sin(t * w) / math.sin(w)
        x, y, z = (s1 * p + s2 * q for p, q in zip(v1, v2))
        pts.append([round(math.degrees(math.atan2(y, x)), 3), round(math.degrees(math.atan2(z, math.hypot(x, y))), 3)])
    return pts


def main() -> None:
    info = json.loads((MANUAL / "flights.json").read_text())
    if not (TRAVEL / "fetch_routes.py").exists():
        raise RuntimeError(f"flights: no kannapolis-travel checkout at {TRAVEL} (git clone https://github.com/bradspry/kannapolis-travel {TRAVEL.name})")
    # The checkout's routes.json carries the rail data --flights-only keeps; flights are re-read.
    run = subprocess.run([sys.executable, "fetch_routes.py", "--flights-only", "-o", "routes.json"], cwd=TRAVEL,
                         capture_output=True, text=True, timeout=300)
    for line in (run.stdout + run.stderr).strip().splitlines():
        log(f"flights: {line}")
    if run.returncode:
        raise RuntimeError(f"flights: fetch_routes.py exited {run.returncode}")
    data = json.loads((TRAVEL / "routes.json").read_text())
    origin = data["origins"][info["airport"]["code"]]
    o = (origin["lon"], origin["lat"])

    flights = []
    for f in data["flights"]:
        if f["airline"] not in info["airlines"]:
            raise RuntimeError(f"flights: no airline details for {f['airline']} in data/manual/flights.json")
        d = (f["lon"], f["lat"])
        new = f["note"] != "Current route"
        names = info.get("city_names", {})
        flights.append({"airline": f["airline"], "code": f["code"], "airport": f["name"], "city": f["city"],
                        "name": names.get(f["code"]) or f["city"].rsplit(",", 1)[0],
                        "lat": round(f["lat"], 5), "lon": round(f["lon"], 5), "miles": round(miles(o, d)),
                        "new": new, "since": f["note"].split("(", 1)[-1].rstrip(")") if new else None, "arc": arc(o, d)})
    flights.sort(key=lambda f: f["miles"])

    # Frame: origin and every destination, with a margin.
    xs = [o[0]] + [f["lon"] for f in flights]
    ys = [o[1]] + [f["lat"] for f in flights]
    box = (min(xs) - 22, min(ys) - 4, max(xs) + 12, max(ys) + 4)  # wide: medium tiles show a landscape frame
    land = outline(LAND, "land", box, 0.04)
    states = outline(STATES, "states", box, 0.04)

    sources = {s["name"]: {k: s.get(k) for k in ("url", "fetched")} for s in data["sources"] if "GTFS" not in s["name"]}
    by_air = {}
    for f in flights:
        by_air[f["airline"]] = by_air.get(f["airline"], 0) + 1
    log(f"flights: {len(flights)} nonstops ({', '.join(f'{a} {n}' for a, n in by_air.items())}); "
        f"{sum(f['new'] for f in flights)} new; outline {len(land)} land + {len(states)} state rings")
    write_json("flights.json", {**info, "origin": {"lat": origin["lat"], "lon": origin["lon"], "name": origin["name"]},
                                "flights": flights, "frame": [round(v, 2) for v in box], "land": land, "states": states,
                                "fetched": sources})


if __name__ == "__main__":
    main()
