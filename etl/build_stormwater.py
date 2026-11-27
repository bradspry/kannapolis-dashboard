"""Stormwater & Flooding: the hand-checked snapshot in data/manual/stormwater.json plus FEMA flood zones.

Flood zones come from FEMA's National Flood Hazard Layer (layer 28, Flood Hazard Zones), which covers both the
Cabarrus and Rowan County parts of Kannapolis: the floodway, the 100-year floodplain (1% annual chance) and the
500-year floodplain (0.2%), inside a box around the city, simplified to about 20 m. They're written to
data/generated/geo/floodzones.json, which build_site publishes as a separate file the page loads only when a
flood map is shown (it's a few hundred KB, too big to put in every page load). If FEMA doesn't answer, the
last good file stays."""
from __future__ import annotations

import json
import urllib.parse
import urllib.request

from common import MANUAL, OUT, USER_AGENT, log, write_json

NFHL = "https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28/query"
SUB500 = "0.2 PCT ANNUAL CHANCE FLOOD HAZARD"


def city_box() -> list[float]:
    """The current city boundary's bounding box, padded a little."""
    b = json.loads((OUT / "boundaries.geojson").read_text())
    city = next(f for f in b["features"] if f["properties"].get("year") == "current")
    xs, ys = [], []

    def walk(c):
        if isinstance(c[0], (int, float)):
            xs.append(c[0]); ys.append(c[1])
        else:
            for x in c:
                walk(x)
    walk(city["geometry"]["coordinates"])
    return [min(xs) - 0.01, min(ys) - 0.01, max(xs) + 0.01, max(ys) + 0.01]


def ring_area(r: list) -> float:
    return sum(x1 * y2 - x2 * y1 for (x1, y1), (x2, y2) in zip(r, r[1:] + r[:1])) / 2


def to_geojson(rings: list) -> dict | None:
    """Esri polygon rings -> GeoJSON: clockwise rings are outer boundaries, counterclockwise ones are holes in the
    outer ring before them."""
    polys = []
    for r in rings:
        r = [[round(x, 5), round(y, 5)] for x, y in r]
        if len(r) < 4:
            continue
        if ring_area(r) < 0 or not polys:  # clockwise in x/y = outer
            polys.append([r])
        else:
            polys[-1].append(r)
    if not polys:
        return None
    return {"type": "Polygon", "coordinates": polys[0]} if len(polys) == 1 else {"type": "MultiPolygon", "coordinates": polys}


def zone_of(a: dict) -> str | None:
    if a.get("ZONE_SUBTY") == "FLOODWAY":
        return "floodway"
    if a.get("SFHA_TF") == "T":
        return "100"
    if a.get("ZONE_SUBTY") == SUB500:
        return "500"
    return None


def flood_zones() -> dict:
    box = city_box()
    params = {"where": f"SFHA_TF='T' OR ZONE_SUBTY='{SUB500}'", "geometry": ",".join(f"{v:.4f}" for v in box),
              "geometryType": "esriGeometryEnvelope", "inSR": "4326", "spatialRel": "esriSpatialRelIntersects",
              "outFields": "FLD_ZONE,ZONE_SUBTY,SFHA_TF", "returnGeometry": "true", "outSR": "4326",
              "maxAllowableOffset": "0.0002", "geometryPrecision": "5", "f": "json"}
    req = urllib.request.Request(NFHL, data=urllib.parse.urlencode(params).encode(), headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=180) as r:
        data = json.loads(r.read())
    if "error" in data:
        raise RuntimeError(data["error"])
    if data.get("exceededTransferLimit"):
        raise RuntimeError("FEMA returned a partial result (transfer limit)")
    feats = []
    for f in data.get("features", []):
        z, g = zone_of(f["attributes"]), to_geojson(f["geometry"].get("rings", []))
        if z and g:
            feats.append({"type": "Feature", "properties": {"z": z}, "geometry": g})
    # Draw order: 500-year under 100-year under floodway.
    feats.sort(key=lambda f: ["500", "100", "floodway"].index(f["properties"]["z"]))
    return {"type": "FeatureCollection", "box": box, "features": feats}


def main() -> None:
    info = json.loads((MANUAL / "stormwater.json").read_text())
    info.pop("_source", None)
    out = OUT / "geo" / "floodzones.json"
    try:
        fz = flood_zones()
        counts = {z: sum(f["properties"]["z"] == z for f in fz["features"]) for z in ("floodway", "100", "500")}
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(fz, separators=(",", ":")))
        log(f"stormwater: FEMA flood zones {counts}, {out.stat().st_size // 1024} KB")
        info["flood"]["zones"] = {"file": "geo/floodzones.json", "counts": counts, "box": fz["box"]}
    except Exception as e:
        log(f"stormwater: couldn't read FEMA's flood zones ({e}); " + ("keeping the last file" if out.exists() else "no flood map"))
        if out.exists():
            fz = json.loads(out.read_text())
            info["flood"]["zones"] = {"file": "geo/floodzones.json", "box": fz.get("box"),
                                      "counts": {z: sum(f["properties"]["z"] == z for f in fz["features"]) for z in ("floodway", "100", "500")}}
    write_json("stormwater.json", info)


if __name__ == "__main__":
    main()
