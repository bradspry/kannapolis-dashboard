"""Homeless Students (City tab): students identified as homeless under the McKinney-Vento Act in Kannapolis City,
Cabarrus County and Rowan-Salisbury Schools, from Brad Spry's bradspry/kannapolis-mckinney-vento.

That repo pulls the federal record (U.S. Department of Education ED Data Express, EDFacts FS 118: homeless
students enrolled at any point in the school year, by district; NCES Common Core of Data enrollment and Census
SAIPE population via the Urban Institute's Education Data Portal) into data/processed/*.csv. This reads those
CSVs and the district list (mckinney_vento/config.py) straight from the repo and works out the same rates as
mckinney_vento/load.py: per 1,000 enrolled, per 1,000 children 5-17 in the district's area, and per 100
children in poverty. North Carolina's total is the sum of the statewide nighttime-residence counts, as
state_totals() does. Federal data lags about two years; the repo is refreshed by hand, so this runs weekly."""
from __future__ import annotations

import csv
import io
import json

from common import MANUAL, log, repo_constants, repo_file, write_json

REPO = "kannapolis-mckinney-vento"
P = "data/processed/north_carolina_"


def rows(name: str) -> list[dict]:
    return list(csv.DictReader(io.StringIO(repo_file(REPO, f"{P}{name}.csv"))))


def num(v: str | None) -> float | None:
    try:
        return float(v) if v not in (None, "") else None
    except ValueError:
        return None


def main() -> None:
    cfg = repo_constants(REPO, "mckinney_vento/config.py", {"DISTRICTS", "COVID_YEARS"})
    lea, enr, pop, res = rows("lea_homeless"), rows("lea_enrollment"), rows("lea_population"), rows("state_residence")
    enroll = {(r["leaid"], r["school_year"]): num(r["enrollment"]) for r in enr}
    popn = {(r["leaid"], r["school_year"]): (num(r["pop_total"]), num(r["pop_5_17"])) for r in pop}
    rate = lambda a, b, k: round(k * a / b, 1) if a is not None and b else None  # noqa: E731
    districts = []
    for leaid, d in cfg["DISTRICTS"].items():
        years = []
        for r in sorted((r for r in lea if r["leaid"] == leaid), key=lambda r: r["school_year_start"]):
            sy = r["school_year"]
            n, e = num(r["homeless_enrolled"]), enroll.get((leaid, sy))
            pt, p517 = popn.get((leaid, sy), (None, None))
            poor = num(r["children_5_17_poverty"])
            years.append({"year": sy, "start": int(r["school_year_start"]), "students": n, "status": r["homeless_status"],
                          "enrollment": e, "per_1000_enrolled": rate(n, e, 1000), "per_1000_children": rate(n, p517, 1000),
                          "per_100_poor": rate(n, poor, 100), "children_in_poverty": poor, "poverty_rate": num(r["saipe_poverty_rate_pct"]),
                          "population": pt, "children_5_17": p517, "subgrantee": r.get("mv_subgrantee") == "True",
                          "covid": sy in cfg["COVID_YEARS"]})
        districts.append({"leaid": leaid, "name": d["name"], "short": d["short"], "nc_dpi_code": d.get("nc_dpi_code"), "years": years})
    # North Carolina: statewide counts by where students slept, summed by year, over every LEA's enrollment.
    state_enr: dict[str, float] = {}
    for r in enr:
        if (v := num(r["enrollment"])) is not None:
            state_enr[r["school_year"]] = state_enr.get(r["school_year"], 0) + v
    by_year: dict[str, dict] = {}
    for r in res:
        y = by_year.setdefault(r["school_year"], {"year": r["school_year"], "start": int(r["school_year_start"]), "students": 0, "residence": {}})
        v = num(r["students"])
        y["residence"][r["residence"]] = v
        if v is not None:
            y["students"] += v
    state = []
    for y in sorted(by_year.values(), key=lambda y: y["start"]):
        y["enrollment"] = state_enr.get(y["year"])
        y["per_1000_enrolled"] = rate(y["students"] or None, y["enrollment"], 1000)
        y["covid"] = y["year"] in cfg["COVID_YEARS"]
        state.append(y)
    last = districts[0]["years"][-1]
    counts = ", ".join("%s %.0f" % (d["short"], d["years"][-1]["students"] or 0) for d in districts)
    log(f"homeless: {counts} in {last['year']}; NC {state[-1]['students']:,.0f}")
    contacts = json.loads((MANUAL / "homeless.json").read_text())
    for d in districts:  # who families call: each district's McKinney-Vento liaison (data/manual/homeless.json)
        d["liaison"] = contacts["liaisons"].get(d["leaid"])
    write_json("homeless.json", {"title": "Homeless Students", "latest": last["year"], "districts": districts, "state": state,
                                 "covid_years": sorted(cfg["COVID_YEARS"]), "repo": "https://github.com/bradspry/kannapolis-mckinney-vento",
                                 "links": {"edx": "https://eddataexpress.ed.gov/dashboard/homeless/2022-2023",
                                           "nc": "https://hepnc.uncg.edu/", "directory": contacts["directory"]},
                                 "helpline": contacts["state"], "contacts_checked": contacts["checked"]})


if __name__ == "__main__":
    main()
