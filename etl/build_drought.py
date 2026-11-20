"""Current drought conditions:
- the City's water-conservation level and drought news, read from kannapolisnc.gov/drought (daily);
- the U.S. Drought Monitor (USDM) for Cabarrus and Rowan counties, weekly, from the USDM data service.
What each level means, conservation tips and earlier rules are machine-parsed into data/manual/drought.json."""
from __future__ import annotations

import datetime as dt
import html
import json
import re
import time
import urllib.parse
import urllib.request

from common import MANUAL, USER_AGENT, log, write_json

CITY_PAGE = "https://www.kannapolisnc.gov/drought"
USDM_API = "https://usdmdataservices.unl.edu/api/CountyStatistics/GetDroughtSeverityStatisticsByAreaPercent"
COUNTIES = [("37025", "Cabarrus County"), ("37159", "Rowan County")]
HISTORY_DAYS = 2 * 365 + 7


def get(url: str, accept: str = "*/*", retries: int = 3) -> bytes:
    last: Exception | None = None
    for attempt in range(retries):
        if attempt:
            time.sleep(4 * attempt)
        try:
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": accept})
            with urllib.request.urlopen(req, timeout=40) as r:
                return r.read()
        except Exception as e:  # noqa: BLE001
            last = e
    raise RuntimeError(f"{url} failed: {last}")


def text(s: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", s or ""))).strip()


def city_status() -> dict:
    """The City's headline ("...moving to Level 1, Voluntary Water Conservation effective November 3, 2026")
    and its list of drought news posts."""
    page = get(CITY_PAGE, "text/html").decode("utf-8", "replace")
    body = page.split("Current Drought Conditions", 1)[-1]
    head = text(body[:3000])
    m = re.search(r"Level\s*(\d)\s*,?\s*(.+?)\s+effective\s+([A-Z][a-z]+\.?\s+\d{1,2},\s*\d{4})", head)
    if not m:
        raise RuntimeError("drought: couldn't find the City's current level on kannapolisnc.gov/drought; page layout may have changed")
    effective = dt.datetime.strptime(m.group(3).replace(".", ""), "%B %d, %Y").date().isoformat()
    # Drought news: each headline link, paired with the date that comes just before it.
    sec = body.split("Drought News", 1)[-1].split("What Does This Mean", 1)[0]
    news, seen = [], set()
    for link in re.finditer(r'<a[^>]*href="([^"]*/news/ID/[^"]+)"[^>]*>(.*?)</a>', sec, re.S):
        title = text(link.group(2)).lstrip("| ").strip()
        url = urllib.parse.urljoin(CITY_PAGE, html.unescape(link.group(1)))
        if not title or title == "(read more)" or url in seen:
            continue
        dates = re.findall(r"([A-Z][a-z]+ \d{1,2}, \d{4})", text(sec[:link.start()]))
        if not dates:
            continue
        seen.add(url)
        news.append({"date": dt.datetime.strptime(dates[-1], "%B %d, %Y").date().isoformat(), "title": title, "url": url})
    return {"level": int(m.group(1)), "name": m.group(2).strip(" ,."), "effective": effective, "news": news[:8]}


def usdm(fips: str) -> list[dict]:
    """Weekly USDM statistics: percent of the county at each category OR WORSE (cumulative), newest first."""
    end = dt.date.today()
    start = end - dt.timedelta(days=HISTORY_DAYS)
    q = urllib.parse.urlencode({"aoi": fips, "startdate": f"{start.month}/{start.day}/{start.year}",
                                "enddate": f"{end.month}/{end.day}/{end.year}", "statisticsType": 1})
    rows = json.loads(get(f"{USDM_API}?{q}", "application/json"))
    weeks = [{"date": r["mapDate"][:10], **{k: round(float(r[k]), 2) for k in ("none", "d0", "d1", "d2", "d3", "d4")}} for r in rows]
    weeks.sort(key=lambda w: w["date"])
    if len(weeks) < 50:
        raise RuntimeError(f"drought: only {len(weeks)} USDM weeks for {fips}")
    return weeks


def main() -> None:
    info = json.loads((MANUAL / "drought.json").read_text())
    city = city_status()
    if str(city["level"]) not in info["levels"]:
        raise RuntimeError(f"drought: the City is at Level {city['level']}, which drought.json doesn't describe")
    counties = []
    for fips, name in COUNTIES:
        counties.append({"fips": fips, "name": name, "weeks": usdm(fips)})
        time.sleep(1)
    now = counties[0]["weeks"][-1]
    log(f"drought: City Level {city['level']} ({city['name']}) since {city['effective']}; "
        f"USDM {now['date']} Cabarrus D0+ {now['d0']}%, D1+ {now['d1']}%")
    write_json("drought.json", {**info, "city": city, "counties": counties})


if __name__ == "__main__":
    main()
