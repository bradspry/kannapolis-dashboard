"""Shared helpers for the kdash ETL scripts (standard library only — no venv or pip needed)."""
from __future__ import annotations

import datetime as dt
import json
import os
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "generated"   # JSON the site is built from
MANUAL = ROOT / "data" / "manual"   # hand-curated inputs
SITE = ROOT / "site"                # HTML/JS/CSS source + photos
DIST = ROOT / "dist"                # the finished single-file dashboard


def load_dotenv(path: pathlib.Path = ROOT / ".env") -> None:
    """Minimal .env reader: KEY=value lines, '#' comments, optional quotes.
    Real environment variables win over the file."""
    if not path.exists():
        return
    for raw in path.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.removeprefix("export ").partition("=")
        key, value = key.strip(), value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        else:
            value = value.split(" #", 1)[0].strip()
        os.environ.setdefault(key, value)


load_dotenv()

# Every harvester identifies itself with this User-Agent so data publishers know who is calling.
# Set KDASH_CONTACT in .env (or as a GitHub Actions secret), e.g. "Your Name, Kannapolitan, you@example.com".
CONTACT = " ".join(os.environ.get("KDASH_CONTACT", "").split())  # one line: no header injection
USER_AGENT = f"kdash-open-data-etl/1.0 ({CONTACT})" if CONTACT else "kdash-open-data-etl/1.0"


def log(msg: str) -> None:
    print(f"[{dt.datetime.now():%H:%M:%S}] {msg}", file=sys.stderr, flush=True)


def write_json(name: str, data) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    if isinstance(data, dict) and not name.endswith(".geojson"):
        data = {"generated": dt.date.today().isoformat(), **data}
    path = OUT / name
    path.write_text(json.dumps(data, separators=(",", ":")))
    log(f"wrote {path.relative_to(ROOT)} ({path.stat().st_size / 1024:.0f} KB)")
