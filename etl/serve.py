"""Serve dist/ to this computer and phones on the same Wi-Fi; rebuild on reload if sources changed.

    ./serve.sh   (runs this with Apple-signed /usr/bin/python3, which the macOS firewall allows;
                  unsigned Homebrew python/node are silently blocked. Keep this Python 3.9-compatible.)

POST /api/layout saves every tab's layout to data/manual/home_layout.json (Edit → Save as default).
"""
from __future__ import annotations

import argparse
import functools
import importlib
import http.server
import json
import re
import socket
import socketserver
import sys
import traceback

import build_site
from common import DIST, MANUAL, OUT, SITE, log

WATCH = [SITE, OUT, MANUAL]
LAYOUT = MANUAL / "home_layout.json"
TILE_ID = re.compile(r"^[a-z0-9-]{1,40}$")


def clean_layout(body: bytes) -> dict:
    """Accept only {"tabs": {tab id: one tab's layout}} (see clean_tab); nothing else reaches disk."""
    d = json.loads(body)
    tabs = d.get("tabs")
    if not isinstance(tabs, dict) or not tabs or len(tabs) > 12 or not all(isinstance(k, str) and TILE_ID.match(k) for k in tabs):
        raise ValueError("bad tabs")
    return {"tabs": {k: clean_tab(v) for k, v in tabs.items()}}


def clean_tab(d) -> dict:
    """One tab: {"order": [ids], "hidden": [ids], "sizes": {id: s|m|l|xl}, "spacers": [ids], "pinned": id (optional)}."""
    if not isinstance(d, dict):
        raise ValueError("bad tab")
    out = {}
    for key in ("order", "hidden"):
        ids = d.get(key, [])
        if not isinstance(ids, list) or len(ids) > 100 or not all(isinstance(i, str) and TILE_ID.match(i) for i in ids):
            raise ValueError(f"bad {key}")
        out[key] = list(dict.fromkeys(ids))
    sizes = d.get("sizes", {})
    if not isinstance(sizes, dict) or len(sizes) > 100 or not all(
            isinstance(k, str) and TILE_ID.match(k) and v in ("s", "m", "l", "xl") for k, v in sizes.items()):
        raise ValueError("bad sizes")
    out["sizes"] = sizes
    spacers = d.get("spacers", [])
    if not isinstance(spacers, list) or len(spacers) > 50 or not all(
            isinstance(i, str) and re.match(r"^space-[a-z0-9]{1,20}$", i) for i in spacers):
        raise ValueError("bad spacers")
    out["spacers"] = list(dict.fromkeys(spacers))
    pinned = d.get("pinned")
    if pinned is not None:
        if not (isinstance(pinned, str) and TILE_ID.match(pinned)):
            raise ValueError("bad pinned")
        out["pinned"] = pinned
    return out


def newest_source_mtime() -> float:
    # Directories too: deleting a file (e.g. home_layout.json) changes its folder's mtime.
    return max((p.stat().st_mtime for d in WATCH for p in [d, *d.rglob("*")]), default=0.0)


def ensure_fresh() -> None:
    out = DIST / "index.html"
    if not out.exists() or newest_source_mtime() > out.stat().st_mtime:
        log("serve: sources changed — rebuilding")
        importlib.reload(build_site)  # pick up edits to the build code itself without restarting the server
        build_site.main()


def lan_ip() -> str:
    """The address other devices on the network use to reach this computer."""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("192.0.2.1", 80))  # TEST-NET address: no packet is actually sent
            return s.getsockname()[0]
    except OSError:
        return "127.0.0.1"


class Handler(http.server.SimpleHTTPRequestHandler):
    def send_json(self, code: int, obj) -> None:
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        """Save the home-screen layout as the site default (Edit → Save as default)."""
        if self.path != "/api/layout":
            self.send_error(404)
            return
        try:
            length = int(self.headers.get("Content-Length") or 0)
            if length > 100000:
                raise ValueError("too large")
            layout = clean_layout(self.rfile.read(length))
        except Exception as e:
            self.send_json(400, {"ok": False, "error": str(e)})
            return
        LAYOUT.write_text(json.dumps(layout, indent=2) + "\n")
        log(f"serve: {self.client_address[0]} saved the default layout for {len(layout['tabs'])} tabs ("
            + ", ".join(f"{k} {len(v['order'])}" for k, v in layout["tabs"].items()) + ")")
        self.send_json(200, {"ok": True})

    def do_GET(self):
        if self.path == "/api/layout":  # lets the page know saving is available
            self.send_json(200, {"ok": True, "saved": LAYOUT.exists()})
            return
        if self.path.split("?")[0] in ("/", "/index.html"):
            try:
                ensure_fresh()
            except Exception:
                traceback.print_exc()
                self.send_error(500, "Build failed — see the terminal running serve")
                return
        super().do_GET()

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")  # phones shouldn't show a stale copy
        super().end_headers()

    def log_message(self, fmt, *args):
        if self.path.split("?")[0] in ("/", "/index.html") and self.command == "GET":
            log(f"serve: {self.client_address[0]} loaded the dashboard")


class Server(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--port", type=int, default=5180)
    args = ap.parse_args()
    ensure_fresh()
    handler = functools.partial(Handler, directory=str(DIST))
    with Server(("0.0.0.0", args.port), handler) as httpd:
        ip = lan_ip()
        print(f"\n  Dashboard on this computer:  http://localhost:{args.port}"
              f"\n  On your phone (same Wi-Fi):  http://{ip}:{args.port}"
              f"\n  Reload the page to pick up changes. Ctrl+C to stop.\n", flush=True)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass
    sys.exit(0)


if __name__ == "__main__":
    main()
