"""Jobs tab: current openings at each employer, harvested weekly with the scrapers from
https://github.com/bradspry/kannapolis-jobs (each one already filtered to the Kannapolis area).

Unlike every other step, this one needs third-party packages (requests, playwright + Chromium) and
a checkout of kannapolis-jobs, so it isn't part of run_all.py: the weekly "Refresh jobs" workflow runs
it on its own. Locally:

    git clone https://github.com/bradspry/kannapolis-jobs .kannapolis-jobs
    python3 etl/build_jobs.py              # every employer
    python3 etl/build_jobs.py kcs atrium   # just these (the rest keep last week's results)

Employers, sectors and careers pages are machine-parsed into data/manual/jobs.json. An employer whose
harvest fails keeps its previous results, marked with the date they're from.
Note: the robots.txt of governmentjobs.com (City of Kannapolis, Cabarrus County), PeopleAdmin (UNC
Charlotte, RCCC, UNC, NC State, App State, UNCG) and UltiPro (Standard Process) asks automated
clients not to fetch; they're harvested anyway, once a week, by the owner's decision (Nov 2026)."""
from __future__ import annotations

import datetime as dt
import importlib
import json
import os
import re
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import MANUAL, OUT, log, write_json  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
KJ = Path(os.environ.get("KANNAPOLIS_JOBS", ROOT / ".kannapolis-jobs"))

# Same patterns as kannapolis-jobs' --part-time and --evening filters (run.py, which can't be imported
# here because it also loads the Indeed modules). Keep in step with that file.
PART_TIME_RE = re.compile(
    r"^(?=.*part[\s-]*time)"
    r"|^(?!.*therap)(?=.*(?<![A-Za-z])(?<!OT/)(?-i:P/?T)(?!/OT)(?![A-Za-z]))",
    re.IGNORECASE,
)
EVENING_RE = re.compile(
    r"(?<!\w)(?:evenings?|nights?|overnight|twilight"
    r"|swing\s*shift|closing\s*shift"
    r"|(?:2nd|second|3rd|third)\s*shift"
    r"|after[\s-]*school"
    r"|pm)(?!\w)"
    r"|\d\s*(?::\d{2})?\s*pm(?!\w)",
    re.IGNORECASE,
)


def harvest(scraper_path: str) -> list[dict]:
    module, cls = scraper_path.rsplit(".", 1)
    scraper = getattr(importlib.import_module(f"scrapers.{module}"), cls)()
    seen, jobs = set(), []
    for j in scraper.fetch(""):
        url = (j.url or "").strip()
        title = re.sub(r"\s+", " ", j.title or "").strip()
        if not title or url in seen:
            continue
        seen.add(url)
        jobs.append({"title": title, "location": re.sub(r"\s+", " ", j.location or "").strip(), "url": url,
                     "part_time": bool(PART_TIME_RE.search(title)), "evening": bool(EVENING_RE.search(title))})
    jobs.sort(key=lambda x: x["title"].lower())
    return jobs


def main(only: list[str] | None = None) -> None:
    if not (KJ / "scrapers" / "base.py").exists():
        raise SystemExit(f"jobs: no kannapolis-jobs checkout at {KJ} (git clone https://github.com/bradspry/kannapolis-jobs {KJ})")
    sys.path.insert(0, str(KJ))
    info = json.loads((MANUAL / "jobs.json").read_text())
    prev_file = OUT / "jobs.json"
    prev = {e["slug"]: e for e in json.loads(prev_file.read_text())["employers"]} if prev_file.exists() else {}
    today = dt.date.today().isoformat()
    out, failed = [], []
    for emp in info["employers"]:
        slug = emp["slug"]
        if only and slug not in only:
            if slug in prev:
                out.append({**emp, **{k: prev[slug][k] for k in ("jobs", "fetched", "error") if k in prev[slug]}})
            continue
        t0 = time.time()
        try:
            jobs = harvest(emp["scraper"])
            out.append({**emp, "jobs": jobs, "fetched": today})
            log(f"jobs: {emp['name']}: {len(jobs)} openings ({time.time() - t0:.0f}s)")
        except Exception as e:  # noqa: BLE001 — one employer's site changing mustn't stop the rest
            failed.append(slug)
            old = prev.get(slug, {})
            out.append({**emp, "jobs": old.get("jobs", []), "fetched": old.get("fetched"), "error": f"{type(e).__name__}: {e}"[:300]})
            log(f"jobs: {emp['name']} FAILED ({type(e).__name__}: {str(e)[:160]}); keeping results from {old.get('fetched') or 'never'}")
    for e in out:
        e.pop("scraper", None)
    total = sum(len(e["jobs"]) for e in out)
    log(f"jobs: {total} openings at {len(out)} employers" + (f"; failed: {', '.join(failed)}" if failed else ""))
    write_json("jobs.json", {"repo": info["repo"], "sectors": info["sectors"], "employers": out})
    if len(failed) > len(info["employers"]) // 2:
        raise SystemExit(f"jobs: {len(failed)} of {len(info['employers'])} employers failed")


if __name__ == "__main__":
    main(sys.argv[1:] or None)
