"""Zoning mix for the City of Kannapolis (Cabarrus County portion of its zoning jurisdiction).

Outputs (data/generated/):
  zoning.json      acres by category and by district code
  zoning.geojson   simplified district polygons for the map
"""
from __future__ import annotations

from collections import defaultdict

import arcgis
from common import log, write_json

SERVICE, LAYER = "Zoning_By_Municipalities", 3  # "Kannapolis Zoning"
SQFT_PER_ACRE = 43560

# Base district -> plain-language category. "-CZ" (conditional zoning) variants share their base.
CATEGORIES = {
    "AG": "Agricultural",
    "R1": "Residential", "R2": "Residential", "R4": "Residential", "R6": "Residential", "R8": "Residential",
    "R18": "Multifamily residential",
    "PD": "Planned development", "PD-TND": "Planned development",
    "MU-N": "Mixed use",
    "CC": "Commercial", "GC": "Commercial", "C-1": "Commercial",
    "O-I": "Office & institutional", "OI": "Office & institutional",
    "CD": "Campus development", "CD-R": "Campus development",
    "LI": "Industrial", "HI": "Industrial",
}


def base_code(code: str) -> str:
    code = (code or "").strip().upper()
    return code[:-3] if code.endswith("-CZ") else code


def main() -> None:
    log("zoning: acres by district")
    stats = arcgis.query(SERVICE, LAYER, groupByFieldsForStatistics="ZONINGCODE",
                         outStatistics='[{"statisticType":"sum","onStatisticField":"Shape.STArea()",'
                                       '"outStatisticFieldName":"sqft"}]')
    by_code: dict[str, float] = defaultdict(float)
    for f in stats["features"]:
        by_code[base_code(f["attributes"]["ZONINGCODE"])] += f["attributes"]["sqft"] / SQFT_PER_ACRE
    by_cat: dict[str, float] = defaultdict(float)
    for code, acres in by_code.items():
        by_cat[CATEGORIES.get(code, "Other")] += acres
    unknown = sorted(c for c in by_code if c not in CATEGORIES)
    if unknown:
        log(f"zoning: uncategorized codes -> Other: {unknown}")

    log("zoning: polygons for map")
    ids = arcgis.object_ids(SERVICE, LAYER)
    feats = arcgis.features_by_ids(SERVICE, LAYER, ids, ["ZONINGCODE"], chunk=500, returnGeometry="true",
                                   outSR=4326, maxAllowableOffset=0.00008, geometryPrecision=5)
    geo = []
    for f in feats:
        g = f.get("geometry")
        if not g or not g.get("rings"):
            continue
        code = (f["attributes"]["ZONINGCODE"] or "").strip().upper()
        geo.append({"type": "Feature",
                    "properties": {"code": code, "category": CATEGORIES.get(base_code(code), "Other")},
                    "geometry": {"type": "Polygon", "coordinates": g["rings"]}})
    write_json("zoning.geojson", {"type": "FeatureCollection", "features": geo})

    total = sum(by_cat.values())
    write_json("zoning.json", {
        "source": "Cabarrus County GIS open data, Kannapolis Zoning layer",
        "coverage_note": "Cabarrus County portion of Kannapolis's zoning jurisdiction; Rowan County portion not included.",
        "total_acres": round(total),
        "categories": sorted(({"category": k, "acres": round(v), "pct": round(100 * v / total, 1)}
                              for k, v in by_cat.items()), key=lambda r: -r["acres"]),
        "districts": sorted(({"code": k, "category": CATEGORIES.get(k, "Other"), "acres": round(v)}
                             for k, v in by_code.items() if v >= 1), key=lambda r: -r["acres"]),
    })


if __name__ == "__main__":
    main()
