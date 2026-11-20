"""Keep the README's "Official sources" table in step with the source registry (data/manual/sources.csv).

The table sits between <!-- sources:start --> and <!-- sources:end --> in README.md and is rewritten from
the registry, so every source the dashboard cites is also cited in the README. Runs with the site build;
it only touches README.md when the table actually changed."""
from __future__ import annotations

import csv

from common import MANUAL, ROOT, log

START, END = "<!-- sources:start -->", "<!-- sources:end -->"


def table() -> str:
    with open(MANUAL / "sources.csv", newline="") as f:
        rows = list(csv.DictReader(f))
    esc = lambda s: s.replace("|", "\\|").strip()  # noqa: E731
    lines = ["| Source | Publisher | Format | Used for |", "|---|---|---|---|"]
    lines += [f"| [{esc(r['title'])}]({r['url'].strip()}) | {esc(r['publisher'])} | {esc(r['format'])} | {esc(r['used_for'])} |" for r in rows]
    return f"{START}\n{len(rows)} sources, generated from `data/manual/sources.csv`.\n\n" + "\n".join(lines) + f"\n{END}"


def main() -> None:
    path = ROOT / "README.md"
    text = path.read_text()
    if START not in text or END not in text:
        log("readme: no sources markers in README.md; skipped")
        return
    head, rest = text.split(START, 1)
    _, tail = rest.split(END, 1)
    new = head + table() + tail
    if new != text:
        path.write_text(new)
        log("readme: updated the sources table")


if __name__ == "__main__":
    main()
