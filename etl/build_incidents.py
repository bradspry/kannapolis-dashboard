"""Traffic incidents, closures and roadwork in and around Kannapolis, from NCDOT's DriveNC events API
(https://www.drivenc.gov/developers/doc). Needs a free DriveNC developer key: DRIVENC_API_KEY in .env, or a
GitHub Actions secret. The key is a query parameter, so it never goes in a log line or the output.

The feed is statewide; this keeps events inside a box around the city limits (the same box as kannapolis-spider:
I-85 from Kannapolis Pkwy, exit 54, to Old Beatty Ford Rd, exit 65, and the Rowan County side of the city), plus
any that name Kannapolis. Incidents change by the minute: the Deploy workflow runs this step on every build
(every 15 minutes), so the site is never more than about a quarter hour behind DriveNC."""
from __future__ import annotations

import datetime as dt
import json
import os
import urllib.parse
import urllib.request

from common import USER_AGENT, log, write_json

URL = "https://www.drivenc.gov/api/v2/get/event"
BBOX = (35.415, 35.570, -80.720, -80.540)  # lat_min, lat_max, lon_min, lon_max (kannapolis-spider's)
EASTERN = dt.timezone(dt.timedelta(hours=-5))  # labels only; the site shows times in the viewer's zone


def in_area(ev: dict) -> bool:
    lat, lon = ev.get("Latitude"), ev.get("Longitude")
    if isinstance(lat, (int, float)) and isinstance(lon, (int, float)):
        if BBOX[0] <= lat <= BBOX[1] and BBOX[2] <= lon <= BBOX[3]:
            return True
    return "kannapolis" in (ev.get("Description") or "").lower()


def iso(ts) -> str | None:
    try:
        return dt.datetime.fromtimestamp(int(ts), tz=dt.timezone.utc).isoformat(timespec="minutes") if ts else None
    except (TypeError, ValueError, OSError):
        return None


def kind(ev: dict) -> str:
    """incident / closure / roadwork: a closure caused by a crash counts as an incident."""
    t, orig = ev.get("EventType") or "", ev.get("OriginalEventType") or ""
    if t == "accidentsAndIncidents" or orig == "accidentsAndIncidents":
        return "incident"
    return "closure" if t == "closures" else "roadwork"


def fetch(key: str) -> list:
    url = f"{URL}?{urllib.parse.urlencode({'key': key, 'format': 'json'})}"
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            data = json.loads(r.read().decode("utf-8", "replace"))
    except urllib.error.HTTPError as e:  # the message never includes the URL (and so the key)
        raise RuntimeError(f"DriveNC answered HTTP {e.code}") from None
    except Exception as e:
        raise RuntimeError(f"DriveNC request failed ({type(e).__name__})") from None
    if isinstance(data, dict):
        raise RuntimeError(f"DriveNC error: {str(data.get('Message') or data)[:120]}")
    if not isinstance(data, list):
        raise RuntimeError("DriveNC: unexpected response")
    return data


def main() -> None:
    key = os.environ.get("DRIVENC_API_KEY", "").strip()
    if not key:
        log("incidents: DRIVENC_API_KEY not set; keeping the last incidents.json")
        return
    events = fetch(key)
    rank = {"incident": 0, "closure": 1, "roadwork": 2}
    out = []
    for ev in filter(in_area, events):
        out.append({
            "id": ev.get("ID"),
            "kind": kind(ev),
            "subtype": (ev.get("EventSubType") or "").strip(),
            "road": (ev.get("RoadwayName") or "").strip(),
            "direction": (ev.get("DirectionOfTravel") or "").strip(),
            "description": " ".join((ev.get("Description") or "").split()),
            "lanes": (ev.get("LanesAffected") or "").strip(),
            "full_closure": bool(ev.get("IsFullClosure")),
            "severity": (ev.get("Severity") or "").strip(),
            "county": (ev.get("County") or "").strip(),
            "start": iso(ev.get("StartDate")),
            "end": iso(ev.get("PlannedEndDate")),
            "updated": iso(ev.get("LastUpdated")),
            "lat": ev.get("Latitude"), "lon": ev.get("Longitude"),
            "url": f"https://www.drivenc.gov/Event/Incidents/{ev.get('ID')}?lang=en" if ev.get("ID") else "https://www.drivenc.gov/",
        })
    out.sort(key=lambda e: (rank[e["kind"]], not e["full_closure"], -(dt.datetime.fromisoformat(e["start"]).timestamp() if e["start"] else 0)))
    counts = {k: sum(e["kind"] == k for e in out) for k in rank}
    log(f"incidents: {len(out)} of {len(events)} statewide events near Kannapolis ({counts})")
    write_json("incidents.json", {
        "fetched": dt.datetime.now(dt.timezone.utc).isoformat(timespec="minutes"),
        "bbox": BBOX,
        "source": "https://www.drivenc.gov/",
        "events": out,
    })


if __name__ == "__main__":
    main()
