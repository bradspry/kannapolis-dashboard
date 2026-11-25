"""Shared helpers for the kdash ETL scripts (standard library only — no venv or pip needed)."""
from __future__ import annotations

import datetime as dt
import json
import os
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "generated"   # JSON the site is built from
MANUAL = ROOT / "data" / "manual"   # machine-parsed inputs (snapshots), each citing its source
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


def repo_file(repo: str, path: str, branch: str = "main") -> str:
    """A text file from one of Brad's public kannapolis-* repos: a local checkout (.<repo>/) if there is one,
    else raw.githubusercontent.com."""
    import urllib.request

    local = ROOT / f".{repo}" / path
    if local.exists():
        return local.read_text()
    url = f"https://raw.githubusercontent.com/bradspry/{repo}/{branch}/{path}"
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": USER_AGENT}), timeout=60) as r:
        return r.read().decode()


def repo_constants(repo: str, path: str, names: set[str], branch: str = "main") -> dict:
    """Read top-level constants (lists, dicts, strings, numbers) from a script in one of Brad's
    kannapolis-* repos without running it: a local checkout (.<repo>/) if there is one, else the file
    on GitHub. ast.literal_eval only, so nothing in the file executes. Keeps a widget in step with the
    script it comes from (its companies, lakes, districts, road types)."""
    import ast

    src = repo_file(repo, path, branch)
    found = {}
    for node in ast.parse(src).body:
        target = node.targets[0] if isinstance(node, ast.Assign) and len(node.targets) == 1 else node.target if isinstance(node, ast.AnnAssign) else None
        if isinstance(target, ast.Name) and target.id in names and node.value is not None:
            v = node.value
            if isinstance(v, ast.Call) and isinstance(v.func, ast.Attribute) and v.func.attr == "compile" and v.args:
                import re  # re.compile("…", re.IGNORECASE | re.DOTALL): the pattern and its flags
                flags = 0
                for flag in ("IGNORECASE", "DOTALL", "MULTILINE", "VERBOSE"):
                    if flag in ast.dump(v):
                        flags |= getattr(re, flag)
                found[target.id] = re.compile(ast.literal_eval(v.args[0]), flags)
            else:
                found[target.id] = ast.literal_eval(v)
    missing = names - found.keys()
    if missing:
        raise RuntimeError(f"{repo}/{path} no longer defines {', '.join(sorted(missing))}")
    return found
