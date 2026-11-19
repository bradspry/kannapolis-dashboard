"""Tiny ArcGIS REST client (stdlib only) for the Cabarrus County open data server."""
from __future__ import annotations

import json
import time
import urllib.parse
import urllib.request

from common import USER_AGENT

BASE = "https://location.cabarruscounty.us/arcgisservices/rest/services/OpenData"
UA = USER_AGENT


def _request(url: str, params: dict, retries: int = 4) -> dict:
    body = urllib.parse.urlencode({**params, "f": "json"}).encode()
    last: Exception | None = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, data=body, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=180) as r:
                data = json.loads(r.read())
            if "error" in data:
                raise RuntimeError(f"{url}: {data['error']}")
            return data
        except Exception as e:  # network blips / transient server errors
            last = e
            time.sleep(2 * (attempt + 1))
    raise RuntimeError(f"ArcGIS request failed after {retries} tries: {last}")


def layer_url(service: str, layer: int) -> str:
    return f"{BASE}/{service}/MapServer/{layer}"


def layer_fields(service: str, layer: int) -> list[str]:
    meta = _request(layer_url(service, layer), {})
    return [f["name"] for f in meta.get("fields") or []]


def query(service: str, layer: int, **params) -> dict:
    params.setdefault("where", "1=1")
    return _request(layer_url(service, layer) + "/query", params)


def object_ids(service: str, layer: int, **params) -> list[int]:
    data = query(service, layer, returnIdsOnly="true", **params)
    return sorted(data.get("objectIds") or [])


def features_by_ids(service: str, layer: int, ids: list[int], out_fields: list[str],
                    chunk: int = 1000, **params) -> list[dict]:
    """Fetch attributes (and optional geometry) for a list of object ids, in chunks."""
    params.setdefault("returnGeometry", "false")
    out: list[dict] = []
    for i in range(0, len(ids), chunk):
        part = ids[i:i + chunk]
        data = query(service, layer, objectIds=",".join(map(str, part)),
                     outFields=",".join(out_fields), **params)
        out.extend(data.get("features") or [])
    return out


def polygon_filter(geometry: dict) -> dict:
    """Params selecting features whose *interior* overlaps the polygon.

    Plain 'intersects' also grabs neighbouring parcels that merely share an edge
    with the city line; the DE-9IM pattern 'T********' requires interiors to overlap.
    """
    return {
        "geometry": json.dumps(geometry),
        "geometryType": "esriGeometryPolygon",
        "inSR": json.dumps(geometry.get("spatialReference", {"wkid": 4326})),
        "spatialRel": "esriSpatialRelRelation",
        "relationParam": "T********",
    }


def boundary(service: str, layer: int, name_field: str, name: str) -> dict | None:
    """Merge all polygons for one municipality into a single esri polygon (WGS84)."""
    data = query(service, layer, where=f"UPPER({name_field}) LIKE '%{name}%'",
                 outFields=name_field, returnGeometry="true", outSR=4326)
    rings = [r for f in data.get("features", []) for r in (f.get("geometry") or {}).get("rings", [])]
    if not rings:
        return None
    return {"rings": rings, "spatialReference": {"wkid": 4326}}
