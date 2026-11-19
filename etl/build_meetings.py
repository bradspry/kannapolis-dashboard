"""City of Kannapolis public meetings from the CivicClerk API (no key). Adapted from kspider.

CivicClerk marks times "Z", but they are local wall-clock times, so they are kept as naive local times.
"""
from __future__ import annotations

import datetime as dt
import json
import re
import time
import urllib.parse
import urllib.request

from common import USER_AGENT, log, write_json

API = "https://kannapolisnc.api.civicclerk.com/v1"
PORTAL = "https://kannapolisnc.portal.civicclerk.com"
UA = USER_AGENT
PAST_DAYS, FUTURE_DAYS = 62, 180
CANCELED = re.compile(r"^\s*cancel+ed\s*[-–:]\s*", re.I)


def get(path: str, params: dict, retries: int = 3) -> dict:
    url = f"{API}/{path}?{urllib.parse.urlencode(params)}"
    last: Exception | None = None
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=30) as r:
                return json.loads(r.read())
        except Exception as e:  # transient network / server errors
            last = e
            time.sleep(5 * (attempt + 1))
    raise RuntimeError(f"CivicClerk request failed: {last}")


def file_url(file_id: int) -> str:
    return f"{API}/Meetings/GetMeetingFileStream(fileId={file_id},plainText=false)"


def clean_title(name: str) -> tuple[str, bool]:
    """'Canceled- September 01, 2026, Board of Adjustment' -> ('Board of Adjustment', True)."""
    name = (name or "").strip() or "Untitled meeting"
    if not CANCELED.match(name):
        return name, False
    rest = CANCELED.sub("", name)
    # Drop a leading date like "September 01, 2026," that CivicClerk puts in canceled titles.
    rest = re.sub(r"^[A-Z][a-z]+ \d{1,2}, \d{4},?\s*", "", rest)
    return rest or name, True


def meeting(ev: dict) -> dict:
    title, canceled = clean_title(ev.get("eventName", ""))
    start = (ev.get("startDateTime") or "").rstrip("Z")[:16]  # local wall time, "YYYY-MM-DDTHH:MM"
    loc = ev.get("eventLocation") or {}
    files = [
        {"type": f.get("type") or "File", "name": (f.get("name") or "").strip(), "url": file_url(f["fileId"])}
        for f in sorted(ev.get("publishedFiles") or [], key=lambda f: f.get("sort") or 0)
        if f.get("fileId")
    ]
    agenda = next((f for f in files if "agenda" in f["type"].lower()), None)
    minutes = next((f for f in files if "minutes" in f["type"].lower()), None)
    return {
        "id": ev["id"],
        "title": title,
        "category": (ev.get("categoryName") or ev.get("eventCategoryName") or "").strip() or None,
        "start": start,
        "duration_min": (ev.get("durationHrs") or 0) * 60 + (ev.get("durationMin") or 0) or None,
        "canceled": canceled,
        "location": ", ".join(p for p in [loc.get("address1"), loc.get("city")] if p) or None,
        "has_agenda": bool(ev.get("hasAgenda")),
        "agenda": agenda,
        "minutes": minutes,
        "files": files,
        "meeting_url": f"{PORTAL}/event/{ev['id']}/files",
        "video": bool(ev.get("hasMedia")),
    }


def main() -> None:
    today = dt.date.today()
    lo = (today - dt.timedelta(days=PAST_DAYS)).isoformat()
    hi = (today + dt.timedelta(days=FUTURE_DAYS)).isoformat()
    log(f"meetings: CivicClerk events {lo} .. {hi}")
    data = get("Events", {
        "$filter": f"startDateTime ge {lo}T00:00:00Z and startDateTime le {hi}T23:59:59Z",
        "$orderby": "startDateTime asc",
        "$top": 200,
    })
    events = [e for e in data.get("value", []) if e.get("isPublished", True) and not e.get("isDeleted")]
    meetings = [meeting(e) for e in events]
    log(f"meetings: {len(meetings)} meetings, {sum(1 for m in meetings if m['agenda'])} with agendas")
    write_json("meetings.json", {
        "source": PORTAL,
        "timezone": "America/New_York",
        "meetings": meetings,
    })


if __name__ == "__main__":
    main()
