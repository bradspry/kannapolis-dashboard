"""Property values & city growth for the Cabarrus County portion of Kannapolis.

Outputs (data/generated/):
  property.json        current snapshot + yearly history (value, parcels, area)
  boundaries.geojson   city limits by year (annexation map)
  value_grid.geojson   market value per acre on a ~250 m grid
"""
from __future__ import annotations

import math
import re
import statistics
import sys
from collections import defaultdict

import arcgis
from common import write_json, log

CITY = "KANNAPOLIS"
# Only the post-2011 tax-view schema: older layers (2005, 2010) store values differently and
# produce totals that don't reconcile with the City's tax base, so they're left out.
VALUE_FIELDS = ["MarketValue", "MarketValu"]
# CALCULATED_ACREAGE is unreliable (some layers hold square feet in it), so parcel area comes from
# the geometry's own area field, in NC State Plane square feet.
SQFT_PER_ACRE = 43560
GRID_DEG = 0.0025  # ~250 m north-south, ~230 m east-west at 35.5°N
SIMPLIFY_DEG = 0.00015  # ~15 m, for the boundary map


# ---------------------------------------------------------------- geometry helpers
def ring_area_sqmi(ring: list[list[float]]) -> float:
    """Signed area of a lon/lat ring on a sphere (square miles)."""
    r = 3958.8
    total = 0.0
    for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1]):
        total += math.radians(x2 - x1) * (2 + math.sin(math.radians(y1)) + math.sin(math.radians(y2)))
    return total * r * r / 2


def polygon_area_sqmi(geom: dict) -> float:
    # Esri rings: outer rings clockwise (negative here), holes counter-clockwise.
    return abs(sum(-ring_area_sqmi(r) for r in geom["rings"]))


def centroid(geom: dict | None) -> tuple[float, float] | None:
    if not geom or not geom.get("rings"):
        return None
    ring = max(geom["rings"], key=len)
    pts = ring[:-1] if len(ring) > 1 and ring[0] == ring[-1] else ring
    return (sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts))


def esri_to_geojson_polygon(geom: dict) -> dict:
    return {"type": "MultiPolygon", "coordinates": [[r] for r in geom["rings"]]}


def area_field(fields: list[str]) -> str | None:
    return next((f for f in fields if f.lower().endswith(".starea()")), None)


def _rdp(pts: list, tol: float) -> list:
    """Ramer-Douglas-Peucker line simplification."""
    if len(pts) < 3:
        return pts
    (x1, y1), (x2, y2) = pts[0], pts[-1]
    dx, dy = x2 - x1, y2 - y1
    norm = math.hypot(dx, dy) or 1e-12
    idx, dmax = 0, 0.0
    for i in range(1, len(pts) - 1):
        d = abs(dy * pts[i][0] - dx * pts[i][1] + x2 * y1 - y2 * x1) / norm
        if d > dmax:
            idx, dmax = i, d
    if dmax <= tol:
        return [pts[0], pts[-1]]
    return _rdp(pts[: idx + 1], tol)[:-1] + _rdp(pts[idx:], tol)


def simplify(geom: dict, tol: float = SIMPLIFY_DEG) -> dict:
    rings = []
    for r in geom["rings"]:
        if abs(ring_area_sqmi(r)) < 0.002:  # drop slivers under ~1 acre
            continue
        # A closed ring starts and ends on the same point, which gives RDP a zero-length baseline
        # and collapses it; simplify the two halves separately instead.
        mid = len(r) // 2
        sr = _rdp(r[: mid + 1], tol)[:-1] + _rdp(r[mid:], tol)
        if len(sr) >= 4:
            rings.append([[round(x, 5), round(y, 5)] for x, y in sr])
    return {**geom, "rings": rings}


def num(v) -> float | None:
    try:
        f = float(v)
        return f if math.isfinite(f) else None
    except (TypeError, ValueError):
        return None


# ---------------------------------------------------------------- discovery
def discover_history() -> list[dict]:
    """Find, per historical snapshot, the parcel layer (with a value field) and city boundary layer."""
    services = arcgis._request(arcgis.BASE, {}).get("services", [])
    snaps = []
    for s in services:
        name = s["name"].split("/")[-1]
        m = re.match(r"Historical_(?:\d{4}_and_)?(\d{4})$", name)
        if not m:
            continue
        year = int(m.group(1))
        layers = arcgis._request(f"{arcgis.BASE}/{name}/MapServer/layers", {}).get("layers", [])
        parcel = bound = None
        for lyr in layers:
            fields = [f["name"] for f in lyr.get("fields") or []]
            lname = lyr["name"].upper()
            vf = next((v for v in VALUE_FIELDS if v in fields), None)
            af = area_field(fields)
            if vf and af and lyr.get("geometryType") == "esriGeometryPolygon":
                parcel = parcel or {"layer": lyr["id"], "value_field": vf, "area_field": af, "name": lyr["name"]}
            if ("CITIES" in lname or "MUNICIPALDISTRICT" in lname) and "DISTRICT" in fields:
                bound = {"layer": lyr["id"], "name_field": "DISTRICT"}
        snaps.append({"year": year, "service": name, "parcel": parcel, "boundary": bound})
    return sorted(snaps, key=lambda s: s["year"])


# ---------------------------------------------------------------- aggregation
def parcel_stats(service: str, layer: int, value_field: str, area_fld: str, geom: dict,
                 extra_fields: list[str] = (), with_geometry: bool = False) -> tuple[dict, list[dict]]:
    ids = arcgis.object_ids(service, layer, **arcgis.polygon_filter(geom))
    params = {}
    if with_geometry:
        params = {"returnGeometry": "true", "outSR": 4326, "maxAllowableOffset": 0.0001, "geometryPrecision": 5}
    feats = arcgis.features_by_ids(service, layer, ids, [value_field, area_fld, *extra_fields],
                                   chunk=500 if with_geometry else 1000, **params)
    for f in feats:
        a = num(f["attributes"].get(area_fld))
        f["attributes"]["_acres"] = a / SQFT_PER_ACRE if a else None
    values = [v for f in feats if (v := num(f["attributes"].get(value_field))) is not None]
    acres = [a for f in feats if (a := f["attributes"]["_acres"]) is not None]
    return {
        "parcels": len(feats),
        "total_value": round(sum(values)),
        "median_value": round(statistics.median([v for v in values if v > 0])) if values else None,
        "parcel_acres": round(sum(acres)),
    }, feats


def value_grid(feats: list[dict], value_field: str) -> dict:
    cells: dict[tuple[int, int], dict] = defaultdict(lambda: {"value": 0.0, "acres": 0.0, "n": 0})
    for f in feats:
        c = centroid(f.get("geometry"))
        v, a = num(f["attributes"].get(value_field)), f["attributes"].get("_acres")
        if not c or v is None or not a or a <= 0:
            continue
        key = (math.floor(c[0] / GRID_DEG), math.floor(c[1] / GRID_DEG))
        cell = cells[key]
        cell["value"] += v
        cell["acres"] += a
        cell["n"] += 1
    out = []
    for (i, j), c in cells.items():
        if c["n"] < 3 or c["acres"] < 0.5:  # suppress tiny cells (noise / single-owner disclosure)
            continue
        x0, y0 = i * GRID_DEG, j * GRID_DEG
        ring = [[round(x0, 5), round(y0, 5)], [round(x0 + GRID_DEG, 5), round(y0, 5)],
                [round(x0 + GRID_DEG, 5), round(y0 + GRID_DEG, 5)], [round(x0, 5), round(y0 + GRID_DEG, 5)],
                [round(x0, 5), round(y0, 5)]]
        out.append({"type": "Feature",
                    "properties": {"value_per_acre": round(c["value"] / c["acres"]), "parcels": c["n"],
                                   "acres": round(c["acres"], 1)},
                    "geometry": {"type": "Polygon", "coordinates": [ring]}})
    return {"type": "FeatureCollection", "features": out}


def neighborhoods(feats: list[dict], value_field: str, top: int = 15) -> list[dict]:
    groups: dict[str, list[float]] = defaultdict(list)
    for f in feats:
        a = f["attributes"]
        v = num(a.get(value_field))
        if v and v > 0 and a.get("NBH_NAME") and str(a.get("VacantOrImproved", "")).upper().startswith("I"):
            groups[a["NBH_NAME"].strip().title()].append(v)
    rows = [{"name": k, "parcels": len(v), "median_value": round(statistics.median(v))}
            for k, v in groups.items() if len(v) >= 50]
    rows.sort(key=lambda r: r["parcels"], reverse=True)
    return rows[:top]


def main() -> None:
    log("property: current city boundary")
    geom = arcgis.boundary("MunicipalDistrict", 0, "DISTRICT", CITY)
    if not geom:
        sys.exit("Could not find Kannapolis in MunicipalDistrict layer")

    log("property: current parcels (with geometry, ~26k)")
    cur_area = area_field(arcgis.layer_fields("Tax_Parcels", 1)) or "Shape.STArea()"
    current, feats = parcel_stats("Tax_Parcels", 1, "MarketValue", cur_area, geom,
                                  extra_fields=["LandValue", "BuildingValue", "NBH_NAME", "VacantOrImproved"],
                                  with_geometry=True)
    current["area_sqmi"] = round(polygon_area_sqmi(geom), 2)
    land = sum(num(f["attributes"].get("LandValue")) or 0 for f in feats)
    bldg = sum(num(f["attributes"].get("BuildingValue")) or 0 for f in feats)
    improved = sum(1 for f in feats if str(f["attributes"].get("VacantOrImproved", "")).upper().startswith("I"))
    current.update({"land_value": round(land), "building_value": round(bldg),
                    "improved_parcels": improved, "vacant_parcels": current["parcels"] - improved})

    write_json("value_grid.geojson", value_grid(feats, "MarketValue"))
    nbh = neighborhoods(feats, "MarketValue")
    del feats

    boundaries = [{"type": "Feature", "properties": {"year": "current"}, "geometry": esri_to_geojson_polygon(simplify(geom))}]
    history = []
    for snap in discover_history():
        y, svc = snap["year"], snap["service"]
        if not snap["boundary"]:
            log(f"property: {y} has no city boundary layer, skipping")
            continue
        g = arcgis.boundary(svc, snap["boundary"]["layer"], snap["boundary"]["name_field"], CITY)
        if not g:
            log(f"property: {y} boundary has no Kannapolis polygon, skipping")
            continue
        row = {"year": y, "area_sqmi": round(polygon_area_sqmi(g), 2)}
        boundaries.append({"type": "Feature", "properties": {"year": y}, "geometry": esri_to_geojson_polygon(simplify(g))})
        if snap["parcel"]:
            log(f"property: {y} parcels from {svc}/{snap['parcel']['name']}")
            try:
                stats, _ = parcel_stats(svc, snap["parcel"]["layer"], snap["parcel"]["value_field"],
                                        snap["parcel"]["area_field"], g)
                row.update(stats)
            except RuntimeError as e:
                log(f"property: {y} parcel query failed: {e}")
        history.append(row)

    # Keep the map light: first snapshot, every 5th year, the latest snapshot, and today.
    snap_years = [f["properties"]["year"] for f in boundaries[1:]]
    keep = {"current"} | ({snap_years[0], snap_years[-1]} if snap_years else set()) | {y for y in snap_years if y % 5 == 0}
    boundaries = [f for f in boundaries if f["properties"]["year"] in keep]
    write_json("boundaries.geojson", {"type": "FeatureCollection", "features": boundaries})
    write_json("property.json", {
        "source": "Cabarrus County GIS open data (location.cabarruscounty.us)",
        "coverage_note": "Cabarrus County portion of Kannapolis only; the Rowan County portion is not included.",
        "current": current,
        "neighborhoods": nbh,
        "history": history,
    })


if __name__ == "__main__":
    main()
