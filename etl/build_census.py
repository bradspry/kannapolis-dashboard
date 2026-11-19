"""Demographics from the American Community Survey (5-year), via the keyless Census Reporter API.

Compares Kannapolis with Cabarrus County, North Carolina and the US, and shows change
across three non-overlapping 5-year windows (2010-14, 2015-19, 2020-24).
"""
from __future__ import annotations

import json
import os
import urllib.parse
import urllib.request

from common import USER_AGENT, log, write_json

UA = USER_AGENT
API = "https://api.censusreporter.org/1.0/data/show/{release}?table_ids={tables}&geo_ids={geos}"
GEOS = {
    "16000US3735200": "Kannapolis",
    "05000US37025": "Cabarrus County",
    "04000US37": "North Carolina",
    "01000US": "United States",
}
CITY = "16000US3735200"
TABLES = ["B01003", "B01002", "B19013", "B25077", "B25064", "B17001", "B25003",
          "B15003", "B08301", "B03002", "B01001"]
def fetch(release: str) -> dict:
    url = API.format(release=release, tables=",".join(TABLES), geos=",".join(GEOS))
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read())


def metrics(t: dict) -> dict:
    """Turn raw ACS tables for one geography into the handful of numbers the dashboard shows."""
    def e(table, col):
        return (t.get(table) or {}).get("estimate", {}).get(f"{table}{col:03d}")

    def share(num, den):
        return round(100 * num / den, 1) if num is not None and den else None

    age = t.get("B01001", {}).get("estimate", {})
    def a(*cols):
        return sum(age.get(f"B01001{c:03d}") or 0 for c in cols)
    pop = e("B01003", 1)
    under18 = a(3, 4, 5, 6, 27, 28, 29, 30)
    over65 = a(*range(20, 26), *range(44, 50))

    edu_total = e("B15003", 1)
    bach_plus = sum(e("B15003", c) or 0 for c in (22, 23, 24, 25))
    workers = e("B08301", 1)
    return {
        "population": pop,
        "median_age": e("B01002", 1),
        "median_household_income": e("B19013", 1),
        "median_home_value": e("B25077", 1),
        "median_gross_rent": e("B25064", 1),
        "poverty_rate": share(e("B17001", 2), e("B17001", 1)),
        "owner_occupied_pct": share(e("B25003", 2), e("B25003", 1)),
        "bachelors_plus_pct": share(bach_plus, edu_total),
        "age": {"Under 18": share(under18, pop), "18 to 64": share(pop - under18 - over65, pop) if pop else None,
                "65 and over": share(over65, pop)},
        "commute": {
            "Drove alone": share(e("B08301", 3), workers),
            "Carpooled": share(e("B08301", 4), workers),
            "Worked from home": share(e("B08301", 21), workers),
            "Other": share((workers or 0) - sum(e("B08301", c) or 0 for c in (3, 4, 21)), workers),
        },
        "race_ethnicity": {
            "White": share(e("B03002", 3), e("B03002", 1)),
            "Black": share(e("B03002", 4), e("B03002", 1)),
            "Hispanic or Latino": share(e("B03002", 12), e("B03002", 1)),
            "Asian": share(e("B03002", 6), e("B03002", 1)),
            "Two or more / other": share(sum(e("B03002", c) or 0 for c in (5, 7, 8, 9)), e("B03002", 1)),
        },
    }


def moe(t: dict, table: str, col: int):
    return (t.get(table) or {}).get("error", {}).get(f"{table}{col:03d}")


TREND_YEARS = [2014, 2019, 2024]  # non-overlapping 5-year windows
TREND_VARS = {
    "population": "B01003_001E",
    "median_household_income": "B19013_001E",
    "median_home_value": "B25077_001E",
    "median_gross_rent": "B25064_001E",
    "poverty_universe": "B17001_001E",
    "poverty_below": "B17001_002E",
}


def trend() -> list[dict] | None:
    """Kannapolis over time, from the official Census API. Needs a free key (CENSUS_API_KEY)."""
    key = os.environ.get("CENSUS_API_KEY")
    if not key:
        log("census: CENSUS_API_KEY not set; skipping the over-time trend")
        return None
    out = []
    for year in TREND_YEARS:
        qs = urllib.parse.urlencode({"get": ",".join(TREND_VARS.values()), "for": "place:35200",
                                     "in": "state:37", "key": key})
        url = f"https://api.census.gov/data/{year}/acs/acs5?{qs}"
        log(f"census: trend {year}")
        with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=120) as r:
            header, values = json.loads(r.read())[:2]
        v = {name: float(values[header.index(var)]) for name, var in TREND_VARS.items()}
        out.append({
            "years": f"{year - 4}-{year}",
            "population": int(v["population"]),
            "median_household_income": int(v["median_household_income"]),
            "median_home_value": int(v["median_home_value"]),
            "median_gross_rent": int(v["median_gross_rent"]),
            "poverty_rate": round(100 * v["poverty_below"] / v["poverty_universe"], 1),
        })
    return out


def main() -> None:
    log("census: latest ACS 5-year (Census Reporter)")
    d = fetch("latest")
    city_raw = d["data"].get(CITY, {})
    write_json("census.json", {
        "source": "U.S. Census Bureau, American Community Survey 5-year estimates (via Census Reporter)",
        "dollars_note": "Dollar figures are in each survey's own (nominal) dollars, not adjusted for inflation.",
        "release": d["release"]["name"],
        "years": d["release"]["years"],
        "geographies": {GEOS[g]: metrics(d["data"][g]) for g in GEOS if g in d.get("data", {})},
        "city_moe": {
            "median_household_income": moe(city_raw, "B19013", 1),
            "median_home_value": moe(city_raw, "B25077", 1),
            "median_gross_rent": moe(city_raw, "B25064", 1),
        },
        "trend": trend(),
    })


if __name__ == "__main__":
    main()
