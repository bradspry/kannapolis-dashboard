"""NC By Train: Kannapolis Station (KAN) train schedule, station hours, services and connections,
read from the station's page on ncbytrain.org (N.C. Department of Transportation Rail Division).

https://www.ncbytrain.org/stations/kannapolis-kan
robots.txt allows station pages (it blocks only admin, search and user paths; checked 2026-11-21).
Links, phone numbers and the train descriptions are machine-parsed into data/manual/train.json."""
from __future__ import annotations

import datetime as dt
import html
import json
import re
import time
import urllib.parse
import urllib.request

from common import MANUAL, USER_AGENT, log, write_json

PAGE = "https://www.ncbytrain.org/stations/kannapolis-kan"


def get(url: str, retries: int = 3) -> str:
    last: Exception | None = None
    for attempt in range(retries):
        if attempt:
            time.sleep(4 * attempt)
        try:
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "text/html"})
            with urllib.request.urlopen(req, timeout=40) as r:
                return r.read().decode("utf-8", "replace")
        except Exception as e:  # noqa: BLE001
            last = e
    raise RuntimeError(f"{url} failed: {last}")


def text(s: str) -> str:
    """Plain text: tags out, entities decoded, zero-width spaces (the page is full of them) gone."""
    s = html.unescape(re.sub(r"<[^>]+>", " ", s or "")).replace("​", "").replace("\xa0", " ")
    return re.sub(r"\s+([:;,.])", r"\1", re.sub(r"\s+", " ", s)).strip()


def clock(s: str) -> str:
    """'8:59 a.m.' -> '08:59'."""
    m = re.match(r"(\d{1,2}):(\d{2})\s*([ap])\.?m\.?", s.replace(" ", " "), re.I)
    if not m:
        raise RuntimeError(f"train: couldn't read the time {s!r}")
    h = int(m.group(1)) % 12 + (12 if m.group(3).lower() == "p" else 0)
    return f"{h:02d}:{m.group(2)}"


def tables_after(page: str, heading: str) -> str:
    i = page.find(heading)
    if i < 0:
        raise RuntimeError(f"train: no '{heading}' on the station page; the layout may have changed")
    return page[i:]


def rows(table_html: str) -> list[list[str]]:
    body = table_html.split("<tbody>", 1)[-1].split("</tbody>", 1)[0]
    return [re.findall(r"<td[^>]*>(.*?)</td>", tr, re.S) for tr in re.findall(r"<tr[^>]*>(.*?)</tr>", body, re.S)]


def schedule(page: str) -> tuple[str | None, list[dict]]:
    sec = tables_after(page, "Train Schedule")
    sec = sec.split("Station Services", 1)[0]
    eff = re.search(r"Effective\s+([A-Z][a-z]+\.?\s+\d{1,2},\s*\d{4})", text(sec))
    effective = dt.datetime.strptime(eff.group(1).replace(".", ""), "%B %d, %Y").date().isoformat() if eff else None
    trains = []
    for direction, table in re.findall(r"<h3[^>]*>(.*?)</h3>\s*(<table.*?</table>)", sec, re.S):
        dirn = text(direction)
        if dirn not in ("Southbound", "Northbound"):
            continue
        for cells in rows(table):
            if len(cells) < 3:
                continue
            when, train, route = (text(c) for c in cells[:3])
            m = re.match(r"#?(\d+)\s+(.+)", train)
            if not m:
                raise RuntimeError(f"train: couldn't read the train {train!r}")
            frm, _, to = route.partition(" to ")
            trains.append({"direction": dirn.lower(), "time": clock(when), "number": int(m.group(1)), "service": m.group(2).strip(),
                           "route": route, "from": frm.strip(), "to": to.strip()})
    trains.sort(key=lambda t: t["time"])
    return effective, trains


def service_table(page: str, heading: str) -> list[dict]:
    sec = tables_after(page, f"<h2>{heading}</h2>")
    table = re.search(r"<table.*?</table>", sec, re.S).group(0)
    out = []
    for cells in rows(table):
        lis = re.findall(r"<li[^>]*>(.*?)</li>", cells[1], re.S) or [cells[1]]
        items = []
        for li in lis:
            if not text(li):
                continue
            item = {"text": text(li)}
            a = re.search(r'<a[^>]*href="([^"]+)"[^>]*>(.*?)</a>', li, re.S)
            if a:  # keep the page's own link (e.g. "Baggage policy" -> /passenger-services/baggage)
                item.update(url=urllib.parse.urljoin(PAGE, html.unescape(a.group(1))), link_text=text(a.group(2)))
            items.append(item)
        out.append({"name": text(cells[0]), "items": items})
    return out


def main() -> None:
    info = json.loads((MANUAL / "train.json").read_text())
    page = get(PAGE)
    effective, trains = schedule(page)
    if len(trains) < 4:
        raise RuntimeError(f"train: only {len(trains)} trains on the station page")
    hours = text(tables_after(page, "Hours:").split("</div>", 1)[0])
    hours = hours.replace("Hours:", "").strip()
    station_hours = re.search(r"(\d{1,2}:\d{2}\s*[ap]\.m\.)\s*to\s*(\d{1,2}:\d{2}\s*[ap]\.m\.)", hours)
    modified = re.search(r"last modified on (\d{2})/(\d{2})/(\d{4})", page)
    station = {**info["station"],
               "attendant": hours.split(".")[0].strip() + "." if hours else None,
               "open": clock(station_hours.group(1)) if station_hours else None,
               "close": clock(station_hours.group(2)) if station_hours else None,
               "note": next((x for x in (text(p) for p in re.findall(r"<p>(.*?)</p>", tables_after(page, "Address:")[:600], re.S)) if x and "Address" not in x), None),
               "hours_text": f"{station_hours.group(1)} to {station_hours.group(2)}" if station_hours else None}
    services = service_table(page, "Station Services")
    transport = service_table(page, "Transportation Services")
    sb = sum(t["direction"] == "southbound" for t in trains)
    log(f"train: {len(trains)} trains at KAN ({sb} southbound, {len(trains) - sb} northbound), schedule effective {effective}")
    write_json("train.json", {**info, "station": station, "effective": effective, "trains": trains,
                              "station_services": services, "transport": transport,
                              "page_modified": f"{modified.group(3)}-{modified.group(1)}-{modified.group(2)}" if modified else None})


if __name__ == "__main__":
    main()
