"""KANDEX, the Kannapolis-Area Index (Jobs tab): Brad Spry's tracker of ten companies with a big
presence around Kannapolis, from bradspry/kannapolis-stocks (kandex.py).

The company list and the 1,000-point baseline are read from kandex.py (repo_constants), so the widget
follows the script. Prices are Yahoo Finance's daily chart data, the same source kandex.py reads through
the yfinance package, fetched here with the standard library.

The composite works the way kandex.py's does: equal-weighted, each trading day compounding the average of
the ten stocks' daily percent changes onto the day before, seeded at the baseline. kandex.py seeds it on
the day it first ran (its SQLite history stays on Brad's computer); here it's seeded on the first trading
day of the start date in data/manual/stocks.json, so anyone can rebuild the same numbers. Read daily."""
from __future__ import annotations

import datetime as dt
import json
import time
import urllib.parse
import urllib.request

from common import MANUAL, USER_AGENT, log, repo_constants, write_json

CHART = "https://query1.finance.yahoo.com/v8/finance/chart/{sym}?{q}"


def chart(sym: str, start: dt.date) -> dict:
    q = urllib.parse.urlencode({"period1": int(dt.datetime.combine(start, dt.time()).timestamp()),
                                "period2": int(time.time()) + 86400, "interval": "1d", "includePrePost": "false"})
    last: Exception | None = None
    for attempt in range(3):
        if attempt:
            time.sleep(5 * attempt)
        try:
            req = urllib.request.Request(CHART.format(sym=urllib.parse.quote(sym), q=q), headers={"User-Agent": f"Mozilla/5.0 {USER_AGENT}"})
            with urllib.request.urlopen(req, timeout=30) as r:
                res = json.loads(r.read())["chart"]["result"][0]
            break
        except Exception as e:  # noqa: BLE001
            last = e
    else:
        raise RuntimeError(f"stocks: {sym} failed: {last}")
    m = res["meta"]
    closes = res["indicators"]["quote"][0]["close"]
    days = {}
    for t, c in zip(res.get("timestamp") or [], closes):
        if c is not None:  # Yahoo leaves gaps as null
            days[dt.datetime.fromtimestamp(t + m.get("gmtoffset", 0), dt.timezone.utc).date().isoformat()] = round(c, 4)
    return {"name": m.get("longName") or m.get("shortName"), "exchange": m.get("fullExchangeName"), "currency": m.get("currency"),
            "price": m.get("regularMarketPrice"), "market_time": m.get("regularMarketTime"), "high52": m.get("fiftyTwoWeekHigh"),
            "low52": m.get("fiftyTwoWeekLow"), "days": days}


def main() -> None:
    info = json.loads((MANUAL / "stocks.json").read_text())
    k = repo_constants("kannapolis-stocks", "kandex.py", {"COMPANIES", "BASELINE_INDEX"})
    start = dt.date.fromisoformat(info["index_start"])
    quotes = {}
    for sym, _ in k["COMPANIES"]:
        quotes[sym] = chart(sym, start - dt.timedelta(days=10))  # a few days back, for the first day's change
        time.sleep(0.5)
    # Trading days every company has a close for (a day one is missing is skipped for all, as kandex.py would
    # have had no quote that day).
    dates = sorted(set.intersection(*(set(q["days"]) for q in quotes.values())))
    if len(dates) < 2:
        raise RuntimeError("stocks: not enough trading days")
    first = next(i for i, d in enumerate(dates) if d >= info["index_start"])
    base = k["BASELINE_INDEX"]
    index = [{"date": dates[first], "value": round(base, 2)}]
    for prev, d in zip(dates[first:], dates[first + 1:]):
        avg = sum((q["days"][d] / q["days"][prev] - 1) * 100 for q in quotes.values()) / len(quotes)
        index.append({"date": d, "value": round(index[-1]["value"] * (1 + avg / 100), 2)})
    keep = set(dates[first - 1:])  # the day before the start, so the first day has a change too
    companies = []
    for sym, short in k["COMPANIES"]:
        q = quotes[sym]
        series = [[d, q["days"][d]] for d in dates if d in keep]
        last, prev = series[-1][1], series[-2][1]
        companies.append({"symbol": sym, "name": short, "long_name": q["name"], "exchange": q["exchange"],
                          "close": last, "prev_close": prev, "change_pct": round((last / prev - 1) * 100, 3),
                          "week_pct": round((last / series[-6][1] - 1) * 100, 3) if len(series) > 5 else None,
                          "start_pct": round((last / series[1][1] - 1) * 100, 3) if len(series) > 1 else None,
                          "high52": q["high52"], "low52": q["low52"],
                          "about": info["about"].get(sym), "url": f"https://finance.yahoo.com/quote/{urllib.parse.quote(sym)}",
                          "closes": [round(c, 2) for _, c in series[1:]]})
    day_pct = (index[-1]["value"] / index[-2]["value"] - 1) * 100 if len(index) > 1 else 0.0
    log(f"stocks: KANDEX {index[-1]['value']:,.2f} ({day_pct:+.2f}%) on {index[-1]['date']}; {len(index)} trading days since {index[0]['date']}")
    write_json("stocks.json", {**info, "baseline": base, "as_of": index[-1]["date"], "dates": [x["date"] for x in index],
                                "index": [x["value"] for x in index], "day_pct": round(day_pct, 3), "companies": companies,
                                "repo": "https://github.com/bradspry/kannapolis-stocks"})


if __name__ == "__main__":
    main()
