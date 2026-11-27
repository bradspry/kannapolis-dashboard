"""Build ONE self-contained file, dist/index.html: CSS, JS modules, data and photos all inlined.

JS modules become data: URLs in an import map ("kdash/<path>"), with relative imports rewritten,
so browsers load them natively; no bundler. Only Plot, MapLibre and map tiles come from the web.
Python 3.9-compatible so serve.py can run it under macOS's built-in Python.
"""
from __future__ import annotations

import base64
import csv
import json
import posixpath
import re
import shutil
import sys

from common import DIST, MANUAL, OUT, SITE, log

# Pinned third-party libraries (ES modules from jsDelivr).
CDN = {
    "@observablehq/plot": "https://cdn.jsdelivr.net/npm/@observablehq/plot@0.6.19/+esm",
    "maplibre-gl": "https://cdn.jsdelivr.net/npm/maplibre-gl@6.19.0/+esm",
}
CDN_CSS = ["https://cdn.jsdelivr.net/npm/maplibre-gl@6.19.0/dist/maplibre-gl.css"]
ENTRY = "main.js"

IMPORT_RE = re.compile(r"""((?:\bfrom|\bimport)\s*)(["'])(\.{1,2}/[^"']+)\2""")


def module_name(path: str) -> str:
    return f"kdash/{path}"


def rewrite_imports(src: str, path: str) -> str:
    """'./ui.js' inside sections/org.js -> 'kdash/ui.js'."""
    here = posixpath.dirname(path)

    def repl(m: re.Match) -> str:
        target = posixpath.normpath(posixpath.join(here, m.group(3)))
        return f"{m.group(1)}{m.group(2)}{module_name(target)}{m.group(2)}"

    return IMPORT_RE.sub(repl, src)


def data_url(mime: str, raw: bytes) -> str:
    return f"data:{mime};base64,{base64.b64encode(raw).decode()}"


def inline_photos(obj):
    """Replace 'photos/...jpg' paths in data with embedded data: URLs."""
    if isinstance(obj, dict):
        return {k: inline_photos(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [inline_photos(v) for v in obj]
    if isinstance(obj, str) and obj.startswith("photos/") and obj.endswith((".jpg", ".jpeg", ".png", ".svg")):
        f = SITE / obj
        if f.exists():
            mime = {".png": "image/png", ".svg": "image/svg+xml"}.get(f.suffix, "image/jpeg")
            return data_url(mime, f.read_bytes())
    return obj


def script_safe(text: str) -> str:
    """Make text safe to place inside a <script> element."""
    return text.replace("</", "<\\/").replace("<!--", "<\\!--")


def build() -> str:
    js_dir = SITE / "js"
    modules = sorted(p.relative_to(js_dir).as_posix() for p in js_dir.rglob("*.js"))
    if ENTRY not in modules:
        raise SystemExit(f"missing site/js/{ENTRY}")

    imports = dict(CDN)
    for path in modules:
        if path == ENTRY:
            continue
        code = rewrite_imports((js_dir / path).read_text(), path)
        imports[module_name(path)] = data_url("text/javascript", code.encode())
    entry_code = rewrite_imports((js_dir / ENTRY).read_text(), ENTRY)

    data = {}
    for f in sorted(OUT.glob("*.json")) + sorted(OUT.glob("*.geojson")):
        data[f.name] = inline_photos(json.loads(f.read_text()))
    if not data:
        log("site: warning — no data in data/generated/; run the other steps first")
    # About the Data lists every source in data/manual/sources.csv: read it at every build, so a source added
    # today shows today (the budget step that also carries it runs weekly).
    if "budget.json" in data:
        with open(MANUAL / "sources.csv", newline="") as fh:
            data["budget.json"]["sources"] = {r["id"]: {**{k: r[k] for k in ("title", "publisher", "format", "url", "used_for")},
                                                        "widgets": r["widgets"].split()} for r in csv.DictReader(fh)}
    layout = MANUAL / "home_layout.json"  # default home-screen arrangement ("Save as default")
    if layout.exists():
        data["home_layout.json"] = json.loads(layout.read_text())

    html = (SITE / "index.html").read_text()
    head_extra = "\n".join(
        [f'  <link rel="stylesheet" href="{u}" crossorigin>' for u in CDN_CSS]
        + [f"  <style>\n{(SITE / 'style.css').read_text()}\n  </style>",
           f'  <script type="importmap">{script_safe(json.dumps({"imports": imports}))}</script>']
    )
    body_extra = "\n".join([
        f"  <script>window.KDASH_DATA = {script_safe(json.dumps(data, separators=(',', ':')))};</script>",
        f'  <script type="module">\n{script_safe(entry_code)}\n  </script>',
    ])
    html = re.sub(r'\s*<script type="module" src="[^"]*"></script>', "", html)
    html = html.replace("</head>", f"{head_extra}\n</head>", 1)
    html = html.replace("</body>", f"{body_extra}\n</body>", 1)
    return html


BASE_URL = "https://kannapolistalk.com/"
# Shareable tab links with their own link previews (Open Graph tags; Facebook doesn't run the app's JavaScript,
# so ?tab=jobs alone would preview as the home page). Each is a tiny page that forwards to the tab.
SHARE_PAGES = {
    "jobs": {"tab": "jobs", "image": "share/jobs.jpg", "title": "Kannapolis-Area Jobs",
             "description": "Openings at {employers} Kannapolis-area employers in one place, from the City and the schools to Atrium, Lilly and Macy's. "
                            "Includes school bus driver jobs. Updated weekly."},
}


def share_pages() -> None:
    import html as H
    import shutil
    src = SITE / "share"
    if src.exists():
        shutil.copytree(src, DIST / "share", dirs_exist_ok=True)
    jobs_file = OUT / "jobs.json"
    n_emp = len(json.loads(jobs_file.read_text())["employers"]) if jobs_file.exists() else 0
    pages = {slug: {**p, "description": p["description"].replace("{employers}", str(n_emp or "dozens of"))} for slug, p in SHARE_PAGES.items()}
    # Widget share pages with a card drawn from today's data (etl/share_cards.py): /gas/ opens the Gas Prices window.
    gas_file = OUT / "gas.json"
    if gas_file.exists():
        from share_cards import gas_share
        g = gas_share(json.loads(gas_file.read_text()), DIST)
        if g:
            pages["gas"] = {**g, "window": "gas"}
    for slug, p in pages.items():
        url, img = f"{BASE_URL}{slug}/", f"{BASE_URL}{p['image']}"
        target = f"../#{p['window']}" if p.get("window") else f"../?tab={p['tab']}"
        e = lambda v: H.escape(v, quote=True)  # noqa: E731
        page = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>{e(p['title'])} | Kannapolis Civic Dashboard</title>
<meta name="description" content="{e(p['description'])}" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="Kannapolis Civic Dashboard" />
<meta property="og:title" content="{e(p['title'])}" />
<meta property="og:description" content="{e(p['description'])}" />
<meta property="og:url" content="{url}" />
<meta property="og:image" content="{img}" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:image:alt" content="{e(p.get('alt') or f"The {p['title']} tab of the Kannapolis Civic Dashboard")}" />
<meta name="twitter:card" content="summary_large_image" />
<link rel="canonical" href="{url}" />
<meta http-equiv="refresh" content="0; url={target}" />
<script>location.replace({json.dumps(target)} + (location.hash && !{json.dumps(target)}.includes("#") ? location.hash : ""));</script>
<style>body{{background:#141414;color:#eee;font:16px system-ui,sans-serif;padding:24px}}a{{color:#6aa7ff}}</style>
</head>
<body><p>Opening <a href="{target}">{e(p['title'])} on the Kannapolis Civic Dashboard</a>…</p></body>
</html>
"""
        (DIST / slug).mkdir(parents=True, exist_ok=True)
        (DIST / slug / "index.html").write_text(page)
    log(f"site: share pages {', '.join(f'/{s}/' for s in pages)}")


def main() -> None:
    share_pages()
    html = build()
    DIST.mkdir(parents=True, exist_ok=True)
    # Published beside the page, loaded only when needed: small copies of hotlinked images (common.Thumbs) and
    # map layers too big to inline (geo/: FEMA flood zones, build_stormwater).
    for sub_dir in ("thumbs", "geo"):
        if (OUT / sub_dir).is_dir():
            shutil.rmtree(DIST / sub_dir, ignore_errors=True)
            shutil.copytree(OUT / sub_dir, DIST / sub_dir)
    out = DIST / "index.html"
    out.write_text(html)
    log(f"site: wrote {out.relative_to(DIST.parent)} ({len(html.encode()) / 1024 / 1024:.1f} MB)")
    import readme_sources  # keep the README's sources table in step with data/manual/sources.csv
    readme_sources.main()


if __name__ == "__main__":
    main()
    sys.exit(0)
