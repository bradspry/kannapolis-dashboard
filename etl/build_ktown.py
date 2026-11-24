"""K-Town Connection (Entertainment tab): the Kannapolis show's newest episodes, read daily.

Video: the channel's public YouTube RSS feed (no API key; its 15 newest uploads, with view counts).
Audio: the show's podcast feed on Podbean (the one Apple Podcasts lists). The two are matched by episode
number ("EP 86", "Ep. 78", "Episode 34"), falling back to the title, so an episode carries both its
YouTube video and its podcast audio when both exist. Show details are in data/manual/ktown.json."""
from __future__ import annotations

import datetime as dt
import email.utils
import json
import re
import time
import urllib.request
import xml.etree.ElementTree as ET

from common import MANUAL, OUT, USER_AGENT, log, write_json

NS = {"a": "http://www.w3.org/2005/Atom", "yt": "http://www.youtube.com/xml/schemas/2015", "media": "http://search.yahoo.com/mrss/"}
ITUNES = "{http://www.itunes.com/dtds/podcast-1.0.dtd}"
EP_RE = re.compile(r"\b(?:ep(?:isode)?\.?|k-town connection)\s*#?\s*(\d{1,4})\b", re.IGNORECASE)
KEEP = 15


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
    raise RuntimeError(f"{url} failed: {last}")


def ep_number(title: str) -> int | None:
    m = EP_RE.search(title)
    return int(m.group(1)) if m else None


def norm(title: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", EP_RE.sub("", title.lower())).strip()


def clean_title(title: str) -> str:
    """'… | EP 86' / '… | K-Town Connection 81' -> the guest/topic part; the episode number is kept separately."""
    t = re.sub(r"\s*\|?\s*(?:K-Town Connection\s*)?(?:EP\.?\s*)\d+\W*$", "", title, flags=re.IGNORECASE)
    t = re.sub(r"\s*\|\s*K-Town Connection\s*\d+\s*$", "", t, flags=re.IGNORECASE)
    t = re.sub(r"^K-Town Connection\s+Ep\.?\s*\d+:\s*", "", t, flags=re.IGNORECASE)
    return t.strip() or title.strip()


def videos(channel_id: str) -> list[dict]:
    root = ET.fromstring(get(f"https://www.youtube.com/feeds/videos.xml?channel_id={channel_id}"))
    out = []
    for e in root.findall("a:entry", NS):
        vid = e.findtext("yt:videoId", namespaces=NS)
        title = (e.findtext("a:title", namespaces=NS) or "").strip()
        stats = e.find("media:group/media:community/media:statistics", NS)
        desc = (e.findtext("media:group/media:description", namespaces=NS) or "").strip()
        out.append({"id": vid, "title": title, "published": e.findtext("a:published", namespaces=NS),
                    "views": int(stats.get("views", 0)) if stats is not None else None,
                    "url": f"https://www.youtube.com/watch?v={vid}", "thumb": f"https://i.ytimg.com/vi/{vid}/hqdefault.jpg",
                    "summary": re.split(r"\n\s*\n", desc)[0][:400] if desc else None,
                    "short": "/shorts/" in (e.find("a:link", NS).get("href", "") if e.find("a:link", NS) is not None else "")})
    return out


def podcast(feed: str) -> list[dict]:
    ch = ET.fromstring(get(feed)).find("channel")
    out = []
    for it in ch.findall("item"):
        enc = it.find("enclosure")
        dur = it.findtext(f"{ITUNES}duration") or ""
        secs = int(dur) if dur.isdigit() else sum(int(x) * 60 ** i for i, x in enumerate(reversed(dur.split(":")))) if re.match(r"^\d+(:\d+)+$", dur) else None
        when = email.utils.parsedate_to_datetime(it.findtext("pubDate")) if it.findtext("pubDate") else None
        out.append({"title": (it.findtext("title") or "").strip(), "published": when.isoformat() if when else None,
                    "audio": enc.get("url") if enc is not None else None, "page": it.findtext("link"), "seconds": secs})
    return out


def main() -> None:
    info = json.loads((MANUAL / "ktown.json").read_text())
    vids = [v for v in videos(info["youtube_channel_id"]) if not v["short"]]
    try:
        pods = podcast(info["podcast_feed"])
    except Exception as e:  # noqa: BLE001 - the videos still stand on their own
        log(f"ktown: podcast feed failed ({e}); videos only")
        pods = []
    by_ep = {ep_number(p["title"]): p for p in pods if ep_number(p["title"]) is not None}
    by_title = {norm(p["title"]): p for p in pods}
    used, episodes = set(), []
    for v in vids:
        n = ep_number(v["title"])
        p = by_ep.get(n) if n is not None else None
        p = p or by_title.get(norm(v["title"]))
        if p:
            used.add(id(p))
        episodes.append({"ep": n, "title": clean_title(v["title"]), "full_title": v["title"], "published": v["published"][:10],
                         "video": {k: v[k] for k in ("id", "url", "thumb", "views")}, "summary": v["summary"],
                         "audio": {"url": p["audio"], "page": p["page"], "seconds": p["seconds"]} if p and p["audio"] else None})
    # Podcast-only episodes fill in, but only ones newer than the oldest video shown: Podbean sometimes
    # gets an older episode late (EP 69 and 70 went up in October), and those aren't new.
    oldest = min((e["ep"] for e in episodes if e["ep"]), default=0)
    for p in pods:
        if id(p) in used or not p["published"] or (ep_number(p["title"]) or 0) < oldest:
            continue
        episodes.append({"ep": ep_number(p["title"]), "title": clean_title(p["title"]), "full_title": p["title"], "published": p["published"][:10],
                         "video": None, "summary": None, "audio": {"url": p["audio"], "page": p["page"], "seconds": p["seconds"]}})
    episodes.sort(key=lambda e: (e["published"], e["ep"] or 0), reverse=True)
    if not episodes:
        raise RuntimeError("ktown: no episodes in either feed")
    episodes = episodes[:KEEP]
    both = sum(1 for e in episodes if e["video"] and e["audio"])
    log(f"ktown: {len(episodes)} episodes (newest EP {episodes[0]['ep']}, {episodes[0]['published']}); {both} with video and audio; "
        f"{len(pods)} in the podcast feed")
    write_json("ktown.json", {**info, "episodes": episodes})


if __name__ == "__main__":
    main()
