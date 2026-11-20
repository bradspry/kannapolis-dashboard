"""City Council meeting videos: the City's "City Council Meetings" YouTube playlist, read daily
from YouTube's public RSS feed (no API key). The City posts each meeting's live stream a few days
ahead, so the newest entry is often the upcoming meeting. Each video is matched by date to the
City's meeting calendar (data/generated/meetings.json) for agenda and minutes links."""
from __future__ import annotations

import datetime as dt
import json
import re
import time
import urllib.request
import xml.etree.ElementTree as ET

from common import OUT, USER_AGENT, log, write_json

CHANNEL = "https://www.youtube.com/@CityofKannapolis"
PLAYLIST = "PLVO_mqWw3g38u7X_oE4-9k0F2BN05dEaX"
FEED = f"https://www.youtube.com/feeds/videos.xml?playlist_id={PLAYLIST}"
NS = {"a": "http://www.w3.org/2005/Atom", "yt": "http://www.youtube.com/xml/schemas/2015", "media": "http://search.yahoo.com/mrss/"}
DATE_RE = re.compile(r"(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s*(\d{4})")


def get(url: str, retries: int = 3) -> bytes:
    last: Exception | None = None
    for attempt in range(retries):
        if attempt:
            time.sleep(4 * attempt)
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": USER_AGENT}), timeout=30) as r:
                return r.read()
        except Exception as e:  # noqa: BLE001
            last = e
    raise RuntimeError(f"YouTube feed failed: {last}")


def council_meetings() -> dict[str, dict]:
    """City Council meetings from the City calendar, keyed by date (YYYY-MM-DD)."""
    try:
        data = json.loads((OUT / "meetings.json").read_text())
    except FileNotFoundError:
        return {}
    out = {}
    for m in data.get("meetings", []):
        if re.search(r"council", f"{m.get('category', '')} {m.get('title', '')}", re.I) and not m.get("canceled"):
            out.setdefault(m["start"][:10], m)
    return out


def main() -> None:
    root = ET.fromstring(get(FEED))
    cal = council_meetings()
    videos = []
    for e in root.findall("a:entry", NS):
        title = e.findtext("a:title", "", NS).strip()
        vid = e.findtext("yt:videoId", "", NS)
        d = DATE_RE.search(title)
        if not (vid and d):
            continue
        date = dt.datetime.strptime(f"{d.group(1)} {d.group(2)} {d.group(3)}", "%B %d %Y").date().isoformat()
        g = e.find("media:group", NS)
        stats = g.find("media:community/media:statistics", NS) if g is not None else None
        m = cal.get(date) or {}
        videos.append({
            "id": vid, "title": title, "date": date,
            "start": m.get("start") or f"{date}T18:00",  # Council meets at 6 p.m.; the calendar has the real time
            "url": f"https://www.youtube.com/watch?v={vid}",
            "thumb": f"https://i.ytimg.com/vi/{vid}/hqdefault.jpg",
            "views": int(stats.get("views")) if stats is not None and stats.get("views") else 0,
            "posted": e.findtext("a:published", "", NS)[:10],
            "agenda": (m.get("agenda") or {}).get("url"),
            "minutes": (m.get("minutes") or {}).get("url") if isinstance(m.get("minutes"), dict) else m.get("minutes"),
            "meeting_url": m.get("meeting_url"),
        })
    if not videos:
        raise RuntimeError("Council videos: no dated videos in the playlist feed; feed format may have changed")
    videos.sort(key=lambda v: v["date"], reverse=True)
    today = dt.date.today().isoformat()
    log(f"videos: {len(videos)} council videos, {sum(v['date'] >= today for v in videos)} upcoming, latest recording "
        + next((v["date"] for v in videos if v["date"] < today), "none"))
    write_json("videos.json", {
        "channel": CHANNEL, "streams": f"{CHANNEL}/streams",
        "playlist": f"https://www.youtube.com/playlist?list={PLAYLIST}",
        "videos": videos,
    })


if __name__ == "__main__":
    main()
