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
Each opening also carries first_seen: the date a harvest first found it (matched by its posting URL, or by
title and location when there's no URL), carried forward from the previous jobs.json. Openings already listed
when tracking began (tracking_since) have no first_seen, so the first run doesn't call everything new.
Note: the robots.txt of governmentjobs.com (City of Kannapolis, Cabarrus County), PeopleAdmin (UNC
Charlotte, RCCC, UNC, NC State, App State, UNCG) and UltiPro (Standard Process) asks automated
clients not to fetch; they're harvested anyway, once a week, by the owner's decision (Nov 2026)."""
from __future__ import annotations

import ast
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


def school_bus_rules() -> tuple[list[str], re.Pattern, re.Pattern]:
    """kannapolis-jobs' --school-bus filter, read from run.py without running it (run.py imports the
    Indeed modules): SCHOOL_BUS_MODULES (the districts, in report order), SCHOOL_BUS_RE and
    SCHOOL_BUS_EXCLUDE_RE. Reading them keeps this widget in step with the harvester."""
    tree = ast.parse((KJ / "run.py").read_text())
    found = {}
    for node in tree.body:
        if isinstance(node, ast.Assign) and len(node.targets) == 1 and isinstance(node.targets[0], ast.Name):
            name, val = node.targets[0].id, node.value
            if name == "SCHOOL_BUS_MODULES":
                found[name] = list(ast.literal_eval(val))
            elif name in ("SCHOOL_BUS_RE", "SCHOOL_BUS_EXCLUDE_RE") and isinstance(val, ast.Call) and val.args:
                flags = re.IGNORECASE if "IGNORECASE" in ast.dump(val) else 0
                found[name] = re.compile(ast.literal_eval(val.args[0]), flags)
    missing = {"SCHOOL_BUS_MODULES", "SCHOOL_BUS_RE", "SCHOOL_BUS_EXCLUDE_RE"} - found.keys()
    if missing:
        raise RuntimeError(f"jobs: kannapolis-jobs run.py no longer defines {', '.join(sorted(missing))}")
    return found["SCHOOL_BUS_MODULES"], found["SCHOOL_BUS_RE"], found["SCHOOL_BUS_EXCLUDE_RE"]


def school_bus(employers: list[dict]) -> dict:
    """The School Bus Drivers widget: --school-bus run over the districts' openings already harvested."""
    modules, keep, drop = school_bus_rules()
    by_slug = {e["slug"]: e for e in employers}
    out = []
    for slug in modules:
        e = by_slug.get(slug)
        if not e:
            continue
        jobs = sorted((j for j in e["jobs"] if keep.search(j["title"]) and not drop.search(j["title"])), key=lambda j: j["title"].lower())
        out.append({"slug": slug, "name": e["name"], "short": e.get("short") or e["name"], "careers": e.get("careers"),
                    "fetched": e.get("fetched"), "error": bool(e.get("error")), "jobs": [{k: j[k] for k in ("title", "location", "url", "part_time")} for j in jobs]})
    log(f"jobs: school bus: {', '.join(f'{d['name']} {len(d['jobs'])}' for d in out)}")
    return {"districts": out, "filter": "--school-bus"}


def job_key(j: dict) -> str:
    return j.get("url") or f"{j['title'].lower()}|{j.get('location', '').lower()}"


def stamp(jobs: list[dict], old_jobs: list[dict], today: str, baseline: bool) -> None:
    """first_seen for each opening: kept from last time, today if it's new, None for the first run's baseline."""
    before = {job_key(j): j.get("first_seen") for j in old_jobs}
    for j in jobs:
        k = job_key(j)
        j["first_seen"] = before[k] if k in before else (None if baseline else today)


def main(only: list[str] | None = None) -> None:
    if not (KJ / "scrapers" / "base.py").exists():
        raise SystemExit(f"jobs: no kannapolis-jobs checkout at {KJ} (git clone https://github.com/bradspry/kannapolis-jobs {KJ})")
    sys.path.insert(0, str(KJ))
    info = json.loads((MANUAL / "jobs.json").read_text())
    prev_file = OUT / "jobs.json"
    prev_all = json.loads(prev_file.read_text()) if prev_file.exists() else {}
    prev = {e["slug"]: e for e in prev_all.get("employers", [])}
    today = dt.date.today().isoformat()
    tracking_since = prev_all.get("tracking_since") or today  # the first run with first_seen dates is the baseline
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
            # An employer harvested for the first time since tracking began is its own baseline too.
            stamp(jobs, prev.get(slug, {}).get("jobs", []), today, baseline=tracking_since == today or slug not in prev)
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
    new = sum(1 for e in out for j in e["jobs"] if j.get("first_seen") == today)
    log(f"jobs: {new} new since the last harvest (tracking since {tracking_since})")
    write_json("jobs.json", {"repo": info["repo"], "sectors": info["sectors"], "tracking_since": tracking_since, "employers": out, "school_bus": school_bus(out)})
    if len(failed) > len(info["employers"]) // 2:
        raise SystemExit(f"jobs: {len(failed)} of {len(info['employers'])} employers failed")


if __name__ == "__main__":
    main(sys.argv[1:] or None)
