"""Transportation tab: Rider Transit (Concord Kannapolis Area Transit) routes, stops and schedules from its
official GTFS feed, plus Rider ADA Paratransit and the City's free West Avenue Express shuttle.

GTFS: https://passio3.com/concordKat/passioTransit/gtfs/google_transit.zip (published by Passio for Rider,
linked from ckrider.com/resources/links). Live bus positions and service alerts (GTFS-realtime) are read
in the browser, not here.
Fares, hours, phones, paratransit rules and the shuttle (stops read from the City's downtown parking map,
street path from OpenStreetMap) are machine-parsed into data/manual/transit.json."""
from __future__ import annotations

import csv
import io
import json
import math
import time
import urllib.request
import zipfile
from collections import defaultdict

from common import MANUAL, OUT, USER_AGENT, log, write_json

GTFS = "https://passio3.com/concordKat/passioTransit/gtfs/google_transit.zip"
SIMPLIFY_M = 6  # route-shape simplification tolerance, meters


def get(url: str, retries: int = 3) -> bytes:
    last: Exception | None = None
    for attempt in range(retries):
        if attempt:
            time.sleep(5 * attempt)
        try:
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.read()
        except Exception as e:  # noqa: BLE001
            last = e
    raise RuntimeError(f"{url} failed: {last}")


def minutes(t: str) -> int:
    h, m, _ = (int(x) for x in t.split(":"))
    return h * 60 + m


def simplify(pts: list[tuple[float, float]], tol_m: float) -> list[tuple[float, float]]:
    """Douglas–Peucker on lon/lat, distances in meters (equirectangular, fine at city scale)."""
    if len(pts) < 3:
        return pts
    k = math.cos(math.radians(pts[0][1]))
    xy = [(x * k * 111_320, y * 110_540) for x, y in pts]

    def dist(p, a, b):
        (px, py), (ax, ay), (bx, by) = p, a, b
        dx, dy = bx - ax, by - ay
        if dx == dy == 0:
            return math.hypot(px - ax, py - ay)
        t = max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
        return math.hypot(px - ax - t * dx, py - ay - t * dy)

    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        i, j = stack.pop()
        best, idx = 0.0, None
        for n in range(i + 1, j):
            d = dist(xy[n], xy[i], xy[j])
            if d > best:
                best, idx = d, n
        if idx is not None and best > tol_m:
            keep[idx] = True
            stack += [(i, idx), (idx, j)]
    return [p for p, k_ in zip(pts, keep) if k_]


def in_polygon(lon: float, lat: float, geom: dict) -> bool:
    polys = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]
    for poly in polys:
        inside = False
        for ring in poly:  # even-odd across outer ring and holes
            for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1]):
                if (y1 > lat) != (y2 > lat) and lon < (x2 - x1) * (lat - y1) / (y2 - y1) + x1:
                    inside = not inside
        if inside:
            return True
    return False


def main() -> None:
    info = json.loads((MANUAL / "transit.json").read_text())
    z = zipfile.ZipFile(io.BytesIO(get(GTFS)))
    table = lambda name: list(csv.DictReader(io.TextIOWrapper(z.open(name), "utf-8-sig")))  # noqa: E731
    routes, trips, stops = table("routes.txt"), table("trips.txt"), table("stops.txt")
    stop_times, shapes, calendar = table("stop_times.txt"), table("shapes.txt"), table("calendar.txt")
    feed = (table("feed_info.txt") or [{}])[0]
    if len(routes) < 3 or len(stops) < 50:
        raise RuntimeError(f"transit: GTFS looks incomplete ({len(routes)} routes, {len(stops)} stops)")

    city = next(f for f in json.loads((OUT / "boundaries.geojson").read_text())["features"] if f["properties"]["year"] == "current")
    service = {c["service_id"]: ("weekday" if c["monday"] == "1" else "weekend") for c in calendar}

    # Stops, indexed.
    sidx = {s["stop_id"]: i for i, s in enumerate(stops)}
    stop_out = [{"name": s["stop_name"].strip(), "lat": round(float(s["stop_lat"]), 6), "lon": round(float(s["stop_lon"]), 6),
                 "kannapolis": in_polygon(float(s["stop_lon"]), float(s["stop_lat"]), city["geometry"]), "routes": []} for s in stops]

    # Shapes, simplified.
    pts = defaultdict(list)
    for p in shapes:
        pts[p["shape_id"]].append((int(p["shape_pt_sequence"]), float(p["shape_pt_lon"]), float(p["shape_pt_lat"])))
    shape_out = {k: [[round(x, 5), round(y, 5)] for x, y in simplify([(x, y) for _, x, y in sorted(v)], SIMPLIFY_M)] for k, v in pts.items()}

    # Trips: [route index, service, stop indexes, departure minutes].
    by_trip = defaultdict(list)
    for st in stop_times:
        by_trip[st["trip_id"]].append((int(st["stop_sequence"]), sidx[st["stop_id"]], minutes(st["departure_time"] or st["arrival_time"])))
    ridx = {r["route_id"]: i for i, r in enumerate(routes)}
    trip_out, route_shapes, route_trips = [], defaultdict(set), defaultdict(list)
    for t in trips:
        seq = sorted(by_trip.get(t["trip_id"], []))
        if len(seq) < 2:
            continue
        ri = ridx[t["route_id"]]
        svc = service.get(t["service_id"], "weekday")
        trip_out.append([ri, svc, [s for _, s, _ in seq], [m for _, _, m in seq]])
        route_shapes[ri].add(t["shape_id"])
        route_trips[(ri, svc)].append(seq)
        for _, s, _ in seq:
            if ri not in stop_out[s]["routes"]:
                stop_out[s]["routes"].append(ri)

    route_out = []
    for i, r in enumerate(routes):
        name = r["route_long_name"].strip() or r["route_short_name"].strip()
        hours, every = {}, {}
        for svc in ("weekday", "weekend"):
            seqs = route_trips.get((i, svc), [])
            if not seqs:
                continue
            starts = sorted(s[0][2] for s in seqs)
            hours[svc] = [min(starts), max(s[-1][2] for s in seqs)]
            # How often a bus leaves the route's first stop (its Transit Center bay), typical gap.
            first = seqs[0][0][1]
            deps = sorted(s[0][2] for s in seqs if s[0][1] == first)
            gaps = sorted(b - a for a, b in zip(deps, deps[1:]) if b > a)
            every[svc] = gaps[len(gaps) // 2] if gaps else None
        mine = [s for s in stop_out if i in s["routes"]]
        far = max(mine, key=lambda s: math.hypot(s["lat"] - info["rider"]["transit_center"]["lat"], s["lon"] - info["rider"]["transit_center"]["lon"]))
        route_out.append({"id": r["route_id"], "name": name, "color": f"#{r['route_color'] or '666666'}", "text": f"#{r['route_text_color'] or 'ffffff'}",
                          "page": info["rider"]["route_pages"].get(name), "hours": hours, "every": every,
                          "stops": len(mine), "kannapolis_stops": sum(s["kannapolis"] for s in mine), "far_end": far["name"],
                          "shapes": [shape_out[k] for k in sorted(route_shapes[i]) if k in shape_out]})

    kan = [r["name"] for r in route_out if r["kannapolis_stops"]]
    log(f"transit: {len(route_out)} routes, {len(stop_out)} stops ({sum(s['kannapolis'] for s in stop_out)} in Kannapolis), "
        f"{len(trip_out)} trips; Kannapolis routes: {', '.join(kan)}; feed {feed.get('feed_start_date')}–{feed.get('feed_end_date')}")
    write_json("transit.json", {**info, "gtfs": {"url": GTFS, "start": feed.get("feed_start_date"), "end": feed.get("feed_end_date"), "version": feed.get("feed_version")},
                                "routes": route_out, "stops": stop_out, "trips": trip_out})


if __name__ == "__main__":
    main()
