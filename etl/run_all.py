"""Run every ETL step. A failing step is reported but doesn't stop the others, so one slow or
broken upstream source never blocks refreshing the rest. Exits non-zero if anything failed."""
from __future__ import annotations

import sys
import time
import traceback

import build_baseball
import build_budget
import build_census
import build_council
import build_drought
import build_editions
import build_events
import build_fire
import build_gem
import build_made
import build_meetings
import build_news
import build_org
import build_parks
import build_police
import build_property
import build_site
import build_swanee
import build_utility
import build_waste
import build_videos
import build_whataburger
import build_library
import build_train
import build_weather
import build_zoning
from common import log

STEPS = [
    ("budget", build_budget.main),
    ("census", build_census.main),
    ("council", build_council.main),
    ("meetings", build_meetings.main),
    ("videos", build_videos.main),  # after meetings: videos are matched to meeting agendas
    ("events", build_events.main),
    ("gem", build_gem.main),
    ("swanee", build_swanee.main),
    ("made", build_made.main),
    ("editions", build_editions.main),
    ("whataburger", build_whataburger.main),
    ("library", build_library.main),
    ("train", build_train.main),
    ("weather", build_weather.main),
    ("news", build_news.main),
    ("org", build_org.main),
    ("police", build_police.main),
    ("fire", build_fire.main),
    ("baseball", build_baseball.main),
    ("utility", build_utility.main),
    ("waste", build_waste.main),
    ("drought", build_drought.main),
    ("parks", build_parks.main),
    ("zoning", build_zoning.main),
    ("property", build_property.main),  # slowest: ~26k parcels + ~18 yearly snapshots
    ("site", build_site.main),  # always last: bundles everything into dist/index.html
]


def main(only: list[str]) -> int:
    failed = []
    for name, fn in STEPS:
        if only and name not in only:
            continue
        t0 = time.time()
        log(f"=== {name}")
        try:
            fn()
            log(f"=== {name} done in {time.time() - t0:.0f}s")
        except BaseException as e:  # noqa: BLE001 - keep going; SystemExit from a step counts as failure
            traceback.print_exc()
            log(f"=== {name} FAILED: {e}")
            failed.append(name)
    if failed:
        log(f"failed steps: {', '.join(failed)}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
