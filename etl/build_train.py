"""NC By Train: every train that stops at Kannapolis Station (KAN), from ncbytrain.org
(N.C. Department of Transportation Rail Division).

- Departure times: the Piedmont and Carolinian route schedules (/schedules/piedmont, /schedules/carolinian).
  They're kept more current than the station page (in Nov 2026 the station page still had #76 at 5:30 PM
  and #79 at 10:12 PM; the route pages had 6:00 PM and 8:23 PM).
- Station hours, services, tickets and connections: the Kannapolis station page. Its own schedule table
  is read too, only to report trains where it disagrees with the route schedules.
robots.txt allows these pages (it blocks only admin, search and user paths; checked 2026-11-21).
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
ROUTES = {"Piedmont": "https://www.ncbytrain.org/schedules/piedmont", "Carolinian": "https://www.ncbytrain.org/schedules/carolinian"}


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


def route_trains(service: str, url: str) -> tuple[list[dict], str | None]:
    """Each train on a route page that stops at Kannapolis, with its departure time there."""
    page = get(url)
    heads = list(re.finditer(r"<h2[^>]*>\s*(Southbound|Northbound) Train (\d+)\s*</h2>", page))
    if not heads:
        raise RuntimeError(f"train: no trains on {url}; the layout may have changed")
    out = []
    for i, m in enumerate(heads):
        chunk = page[m.end():heads[i + 1].start() if i + 1 < len(heads) else len(page)]
        stop = re.search(r"Kannapolis, N\.C\.\W*(\d{1,2}:\d{2}\s*[ap]\.m\.)", text(chunk))
        if not stop:
            continue  # this train runs through without stopping
        route = text(re.search(r'<button class="accordion-button[^>]*>(.*?)</button>', chunk, re.S).group(1))
        ends = [re.sub(r"^New York City$", "New York", x.strip()) for x in route.split(" to ")]  # as the station page says it
        out.append({"direction": m.group(1).lower(), "time": clock(stop.group(1)), "number": int(m.group(2)), "service": service,
                    "route": f"{ends[0]} to {ends[-1]}", "from": ends[0], "to": ends[-1], "via": ends[1:-1]})
    modified = re.search(r"last modified on (\d{2})/(\d{2})/(\d{4})", page)
    return out, f"{modified.group(3)}-{modified.group(1)}-{modified.group(2)}" if modified else None


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
    effective, posted = schedule(page)
    trains, routes = [], {}
    for service, url in ROUTES.items():
        found, modified = route_trains(service, url)
        trains += found
        routes[service] = {"url": url, "modified": modified, "stops": len(found)}
        time.sleep(1)
    trains.sort(key=lambda t: t["time"])
    if len(trains) < 4:
        raise RuntimeError(f"train: only {len(trains)} trains stop at Kannapolis on the route schedules")
    # Where the station page's own table disagrees with the route schedules (shown as a note).
    by_num = {t["number"]: t for t in trains}
    differs = [{"number": p["number"], "service": p["service"], "station_page": p["time"], "route_page": by_num[p["number"]]["time"] if p["number"] in by_num else None}
               for p in posted if p["number"] not in by_num or by_num[p["number"]]["time"] != p["time"]]
    differs += [{"number": t["number"], "service": t["service"], "station_page": None, "route_page": t["time"]}
                for t in trains if t["number"] not in {p["number"] for p in posted}]
    for d in differs:
        log(f"train: #{d['number']} {d['service']}: station page {d['station_page'] or 'not listed'}, route schedule {d['route_page'] or 'no Kannapolis stop'}")
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
    log(f"train: {len(trains)} trains stop at KAN ({sb} southbound, {len(trains) - sb} northbound); "
        + ", ".join(f"{k} schedule updated {v['modified']}" for k, v in routes.items()))
    write_json("train.json", {**info, "station": station, "effective": effective, "trains": trains, "routes": routes, "station_page_differs": differs,
                              "station_services": services, "transport": transport,
                              "page_modified": f"{modified.group(3)}-{modified.group(1)}-{modified.group(2)}" if modified else None})


if __name__ == "__main__":
    main()
