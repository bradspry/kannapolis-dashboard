# Hand-curated budget & debt data

The City publishes its budget and finances only as PDFs, so these CSVs are transcribed by hand.
**Every row has a `source` column and a `source_url` column** naming the document (an `id` from `sources.csv`) and the page or section. `source_url` is that document's URL plus `#page=N` (the PDF page, which can differ from the printed page number); `python3 etl/run_all.py budget` fails if a row's citation is missing or doesn't match `sources.csv`.

## Files

| File | What | Where to find new numbers |
|---|---|---|
| `home_layout.json` | Default home-screen tile order and hidden tiles (optional) | Written by Edit → *Save as default home page* while running `./serve.sh`; safe to edit by hand or delete |
| `sources.csv` | Every official source: id, title, publisher, format, URL, what it's used for, and `widgets` (space-separated widget ids it feeds; each widget window lists these as its Sources) | Add a row for any new source; the build will not cite a widget that isn't tagged |
| `general_fund_by_function.csv` | Adopted General Fund spending by function | Budget ordinance, "Section VIII – General Fund" (expenditures) |
| `general_fund_revenue.csv` | Adopted General Fund revenue by source | Budget ordinance, "Section I – General Fund" (revenues) |
| `funds_fy2027.csv` | Adopted appropriation for each fund | Budget ordinance, Sections I–VII |
| `tax_rate_history.csv` | Tax rate, assessed value, levy | Budget book, "Tax Rates and Assessed Valuation" table (near the glossary); rate also in the ordinance's "Tax Rate Established" section |
| `debt_service_fy2027.csv` | Every loan payment in the adopted budget: principal, interest, other costs (issuance), maturity | Adopted budget document's debt service program pages: General Fund Debt Service (18000), Water and Sewer – Debt Service (38000), Stormwater Debt Service (48000). The build checks each fund's total against `DEBT_SERVICE_FY2027` (ordinance Sections VIII–X) in `etl/build_budget.py`. |
| `debt_history.csv` | Outstanding debt, debt limit, population | Annual Comprehensive Financial Report, statistical section: Table 10 (debt by type), Table 12 (legal debt margin), Table 14 (population) |

## Adding a new fiscal year

1. Add the new document to `sources.csv`.
2. Append rows to each CSV, citing the page or section.
3. **Check that line items add up to the document's printed totals.** Note any mismatch in the `notes` list in `etl/build_budget.py` rather than "fixing" it. (Example: the FY27 ordinance's revenue lines add to $50,000 more than its printed total.)
4. For a new year of debt data: `governmental_debt` is the sum of the *Governmental Activities* columns of ACFR Table 10, and `business_debt` is the sum of the *Business-type Activities* columns. Together they must equal *Total Primary Government*.
5. Run `python3 etl/run_all.py budget` and check the Budget & debt section.

When a new budget year is added, rename `funds_fy2027.csv` and `debt_service_fy2027.csv`, update `DEBT_SERVICE_FY2027`, and update the file name and `headline` values in `etl/build_budget.py`.
