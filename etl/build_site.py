"""Build ONE self-contained file, dist/index.html: CSS, JS modules, data and photos all inlined.

JS modules become data: URLs in an import map ("kdash/<path>"), with relative imports rewritten,
so browsers load them natively; no bundler. Only Plot, MapLibre and map tiles come from the web.
Python 3.9-compatible so serve.py can run it under macOS's built-in Python.
"""
from __future__ import annotations

import base64
import json
import posixpath
import re
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
    if isinstance(obj, str) and obj.startswith("photos/") and obj.endswith((".jpg", ".jpeg", ".png")):
        f = SITE / obj
        if f.exists():
            return data_url("image/png" if obj.endswith(".png") else "image/jpeg", f.read_bytes())
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


def main() -> None:
    html = build()
    DIST.mkdir(parents=True, exist_ok=True)
    out = DIST / "index.html"
    out.write_text(html)
    log(f"site: wrote {out.relative_to(DIST.parent)} ({len(html.encode()) / 1024 / 1024:.1f} MB)")
    import readme_sources  # keep the README's sources table in step with data/manual/sources.csv
    readme_sources.main()


if __name__ == "__main__":
    main()
    sys.exit(0)
