"""City Water & Sewer: the hand-checked snapshot in data/manual/watersewer.json (water quality report, wastewater
collections report, rates, services) plus a weekly look at the City's Water & Sewer page for newer reports.

The reports are PDFs published once a year with tables that change layout, so their numbers are transcribed by
hand (see the manual file's _source). This step reads the page's report links: when a newer Water Quality Report
or Wastewater Collections Report is posted, the widget says so and links to it until the snapshot is updated.
If the page can't be read, the snapshot is published as is."""
from __future__ import annotations

import html
import json
import re
import urllib.parse
import urllib.request

from common import MANUAL, USER_AGENT, log, write_json

SITE = "https://www.kannapolisnc.gov"


def page_links(url: str) -> list[tuple[str, str]]:
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": USER_AGENT}), timeout=60) as r:
        page = r.read().decode("utf-8", "ignore")
    out = []
    for href, label in re.findall(r'<a[^>]+href="([^"#]+)"[^>]*>(.*?)</a>', page, re.S):
        label = re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", label))).strip()
        href = html.unescape(href)
        if href.startswith("/"):
            href = SITE + urllib.parse.quote(urllib.parse.unquote(href), safe="/?=&.-_%")
        out.append((label, href))
    return out


def newer_reports(info: dict, links: list[tuple[str, str]]) -> list[dict]:
    """Reports on the page newer than the snapshot's: a Water Quality Report for a later year, a Wastewater
    Collections Report for a later fiscal year."""
    found = []
    q = [(int(m.group(1)), h) for l, h in links if (m := re.match(r"(20\d\d) Water Quality Report", l))]
    if q and max(q)[0] > info["quality"]["year"]:
        y, h = max(q)
        found.append({"what": f"{y} Water Quality Report", "url": h})
    ww = [(m.group(1), h) for l, h in links if (m := re.search(r"Wastewater Annual Collections Report FY (20\d\d-\d\d)", l))]
    if ww and max(ww)[0] > info["sewer"]["fy"]:
        fy, h = max(ww)
        found.append({"what": f"Wastewater Collections Report FY {fy}", "url": h})
    return found


def main() -> None:
    info = json.loads((MANUAL / "watersewer.json").read_text())
    info.pop("_source", None)
    try:
        links = page_links(info["page"])
        newer = newer_reports(info, links)
        log(f"watersewer: {len(links)} links on the City page; " + (", ".join(n["what"] for n in newer) + " posted" if newer else "no newer reports"))
    except Exception as e:  # keep the snapshot
        newer = []
        log(f"watersewer: couldn't read the City page ({e}); publishing the snapshot")
    write_json("watersewer.json", {**info, "newer": newer})


if __name__ == "__main__":
    main()
