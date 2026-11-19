"""Weather for Kannapolis from the National Weather Service API (api.weather.gov; free, no key).

The page fetches live weather itself (NWS allows browser requests). This step saves the API
endpoints for Kannapolis plus a snapshot, used as a fallback when the page is offline.
Raw NWS shapes are kept; the browser normalizes live and snapshot data the same way.
"""
from __future__ import annotations

import json
import time
import urllib.request

from common import USER_AGENT, log, write_json

LAT, LON = 35.4874, -80.6217  # Kannapolis city center
API = "https://api.weather.gov"


def get(url: str, retries: int = 3) -> dict:
    last: Exception | None = None
    for attempt in range(retries):
        if attempt:
            time.sleep(4 * attempt)
        try:
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/geo+json"})
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.loads(r.read())
        except Exception as e:
            last = e
    raise RuntimeError(f"NWS request failed ({url}): {last}")


def main() -> None:
    pt = get(f"{API}/points/{LAT},{LON}")["properties"]
    station = get(pt["observationStations"])["features"][0]["properties"]
    urls = {
        "forecast": pt["forecast"],
        "hourly": pt["forecastHourly"],
        "alerts": f"{API}/alerts/active?point={LAT},{LON}",
        "observation": f"{API}/stations/{station['stationIdentifier']}/observations/latest",
        "page": f"https://forecast.weather.gov/MapClick.php?lat={LAT}&lon={LON}",
    }
    forecast = get(urls["forecast"])["properties"]["periods"]
    hourly = get(urls["hourly"])["properties"]["periods"][:48]
    alerts = [f["properties"] for f in get(urls["alerts"]).get("features", [])]
    try:
        observation = get(urls["observation"])["properties"]
    except RuntimeError:
        observation = None  # stations occasionally have no recent report
    log(f"weather: {pt['gridId']} {pt['gridX']},{pt['gridY']}, station {station['stationIdentifier']}, "
        f"{len(forecast)} periods, {len(alerts)} active alerts")
    write_json("weather.json", {
        "location": "Kannapolis, NC",
        "office": pt["gridId"],
        "station": {"id": station["stationIdentifier"], "name": station["name"]},
        "urls": urls,
        "snapshot": {"forecast": forecast, "hourly": hourly, "alerts": alerts, "observation": observation},
    })


if __name__ == "__main__":
    main()
