"""City budget & debt, from hand-curated CSVs in data/manual/.

These numbers come from the city's budget documents and audited financial report (PDFs),
which have no API. Every row cites its source document and page; see data/manual/README.md
for how to add a new year.
"""
from __future__ import annotations

import csv

from common import MANUAL, write_json


def rows(name: str) -> list[dict]:
    with (MANUAL / name).open(newline="") as f:
        return list(csv.DictReader(f))


def n(v: str):
    v = (v or "").strip()
    if not v:
        return None
    return float(v) if "." in v else int(v)


# Debt service appropriations in the adopted FY27 budget ordinance (Sections VIII-X). The
# loan-by-loan schedule must add up to these, or the build fails.
DEBT_SERVICE_FY2027 = {"General Fund": 13362195, "Water and Sewer Fund": 7143207, "Stormwater Fund": 502041}


def debt_service() -> list[dict]:
    items = [{k: (n(v) if k in {"principal", "interest", "other"} else (v or None)) for k, v in r.items()}
             for r in rows("debt_service_fy2027.csv")]
    for fund, expected in DEBT_SERVICE_FY2027.items():
        got = sum(i["principal"] + i["interest"] + i["other"] for i in items if i["fund"] == fund)
        if got != expected:
            raise ValueError(f"debt_service_fy2027.csv: {fund} adds to {got:,}, ordinance says {expected:,}")
    return items


def main() -> None:
    sources = {r["id"]: {**{k: r[k] for k in ("title", "publisher", "format", "url", "used_for")},
                         "widgets": r["widgets"].split()} for r in rows("sources.csv")}
    # Every hand-entered row must cite a known source and link to it.
    for name in ("general_fund_by_function.csv", "general_fund_revenue.csv", "funds_fy2027.csv",
                 "tax_rate_history.csv", "debt_history.csv", "debt_service_fy2027.csv"):
        for i, r in enumerate(rows(name), 2):
            sid = r["source"].split()[0].rstrip(";")
            if sid not in sources or not r.get("source_url", "").startswith(sources[sid]["url"]):
                raise ValueError(f"{name} line {i}: cite a source id from sources.csv and its source_url")

    def typed(name, numeric):
        return [{k: (n(v) if k in numeric else v) for k, v in r.items()} for r in rows(name)]

    write_json("budget.json", {
        "sources": sources,
        "general_fund_by_function": typed("general_fund_by_function.csv", {"fiscal_year", "amount"}),
        "general_fund_revenue": typed("general_fund_revenue.csv", {"fiscal_year", "amount"}),
        "funds_fy2027": typed("funds_fy2027.csv", {"amount"}),
        "tax_rate_history": typed("tax_rate_history.csv", {"fiscal_year", "rate_per_100", "assessed_value", "levy"}),
        "debt_history": typed("debt_history.csv", {
            "fiscal_year", "total_debt", "governmental_debt", "business_debt", "debt_per_capita",
            "debt_limit", "net_debt_applicable", "legal_debt_margin", "population"}),
        "debt_service_fy2027": debt_service(),
        "debt_service_ordinance_fy2027": DEBT_SERVICE_FY2027,
        "headline": {"total_budget_fy2027": 134747543, "full_time_positions_fy2027": 454,
                     "source": "fy27_ordinance"},
        "notes": [
            "Budget figures are adopted budgets, not year-end actuals.",
            "Fund appropriations sum to more than the city's $134.7M headline because money transferred "
            "between funds (and internal insurance premiums) is counted in more than one fund.",
            "The FY 2027 ordinance lists General Fund revenues that add to $90,072,285 but prints a total "
            "of $90,022,285; line items are shown as published.",
        ],
    })


if __name__ == "__main__":
    main()
