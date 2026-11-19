#!/bin/sh
# Serve the dashboard to this computer and your phone (same Wi-Fi). Reload to see changes.
# Uses macOS's built-in, Apple-signed Python so the macOS firewall allows phone connections.
cd "$(dirname "$0")"
PY=/usr/bin/python3
[ -x "$PY" ] || PY=python3
exec "$PY" etl/serve.py "$@"
