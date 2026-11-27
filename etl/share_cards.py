"""Share-card images (1200x630, Facebook's link-preview size) drawn from the day's data, for the share pages
(build_site.share_pages). Each card is a small HTML page rendered to PNG by headless Chrome: on GitHub's Ubuntu
runners it's preinstalled as google-chrome; locally, Chrome's app or $CHROME. Without Chrome the share page
falls back to the site's generic preview image.

The file name carries the date and the headline number (share/gas-2026-11-26-2.60.png): Facebook caches a link's
preview for weeks, so a new price gets a new image, and a post keeps the card from the day it was shared."""
from __future__ import annotations

import datetime as dt
import html
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

from common import log

CHROMES = ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "google-chrome", "google-chrome-stable", "chromium", "chromium-browser"]
FUEL = ('<path d="M4 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M2.5 21h13M4 10h10"/>'
        '<path d="M14 8h1.5a2 2 0 0 1 2 2v6.5a1.5 1.5 0 0 0 3 0V9.5L18 7"/>')
ORANGE, GOOD, BAD = "#e8562a", "#3fb27f", "#e5484d"
e = lambda s: html.escape(str(s), quote=True)  # noqa: E731


def chrome() -> str | None:
    for c in [os.environ.get("CHROME", "")] + CHROMES:
        if c and (Path(c).exists() or shutil.which(c)):
            return c
    return None


def render(doc: str, out: Path, w: int = 1200, h: int = 630) -> bool:
    exe = chrome()
    if not exe:
        log("share cards: no Chrome found; the share page uses the generic preview")
        return False
    out.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        src = Path(tmp) / "card.html"
        src.write_text(doc)
        args = [exe, "--headless=new", "--disable-gpu", "--hide-scrollbars", f"--user-data-dir={tmp}/prof", "--virtual-time-budget=5000",
                f"--window-size={w},{h}", f"--screenshot={out}", src.as_uri()]
        if os.environ.get("GITHUB_ACTIONS"):
            args.insert(1, "--no-sandbox")
        subprocess.run(args, capture_output=True, timeout=90)
    return out.exists() and out.stat().st_size > 1000


def active_notice(notices: list, today: dt.date) -> dict | None:
    t = today.isoformat()
    return next((n for n in notices or [] if (n.get("show_from") or "") <= t <= n["until"]), None)


def short_addr(a: str) -> str:
    first, _, rest = a.partition(" ")
    return rest if first.isdigit() and rest else a


def gas_card(g: dict, today: dt.date) -> str:
    """The Price board: the cheapest regular (five), diesel (three) and aviation fuel, week trends, any notice."""
    reg, dsl = g["grades"]["regular"]["stations"], (g["grades"].get("diesel") or {}).get("stations", [])
    av = g.get("aviation") or []
    trend = lambda grade: (g["grades"].get(grade) or {}).get("trend")  # noqa: E731

    def pill(t):
        if not t or t.get("direction") == "steady" or not t.get("delta"):
            return ""
        d = t["delta"]
        col = GOOD if d < 0 else BAD
        return (f'<span class="pill" style="color:{col};background:color-mix(in oklab,{col} 18%,transparent)">'
                f'{"▼" if d < 0 else "▲"} {abs(d) * 100:.1f}¢ this week</span>')

    def row(i, s, size):
        return (f'<div class="row"><span class="p" style="font-size:{size}px{";color:" + ORANGE if i == 0 else ""}">${s["price"]:.2f}</span>'
                f'<span class="n">{e(s["name"])} <span class="sub">{e(short_addr(s["address"]))}</span></span></div>')

    ll = next((a for a in av if "100LL" in (a.get("fuel") or "")), av[0] if av else None)
    ja = next((a for a in av if "Jet" in (a.get("fuel") or "")), None)
    avl = ""
    if ll:
        where = ll.get("airport") or ll.get("airport_name") or ll.get("code") or ""
        avl = (f'<div class="av">✈ <b>Aviation</b> <span class="sub">100LL</span> <b>${ll["price"]:.2f}</b>'
               + (f' · <span class="sub">Jet A</span> <b>${ja["price"]:.2f}</b>' if ja else "") + f' <span class="sub">· {e(where)}</span></div>')
    n = active_notice(g.get("notices"), today)
    tax = ""
    if n:
        days = (dt.date.fromisoformat(n["until"]) - today).days
        left = "ends today" if days == 0 else "ends tomorrow" if days == 1 else f"{days} days left"
        tax = f'<div class="tax">⚠ {e(n["short"])} <span>· {left}</span></div>'
    icon = f'<svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">{FUEL}</svg>'
    return f"""<!doctype html><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@500;650;700;800&display=block"><style>
*{{box-sizing:border-box}} html,body{{margin:0;width:1200px;height:630px;overflow:hidden}}
body{{font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;background:#141413;color:#f4f3ef;
 background-image:radial-gradient(900px 520px at 100% 0%,color-mix(in oklab,{ORANGE} 24%,transparent),transparent 62%)}}
.wrap{{position:absolute;inset:0;padding:40px 56px 30px;display:flex;flex-direction:column}} .sub{{color:#cfcdc4;font-weight:500}}
.top{{display:flex;align-items:center;gap:16px}} .chip{{width:64px;height:64px;border-radius:17px;background:{ORANGE};display:grid;place-items:center;box-shadow:0 8px 22px -8px {ORANGE}}}
.t{{font-size:44px;font-weight:800;letter-spacing:-.01em;line-height:1}} .k{{font-size:22px;font-weight:650;letter-spacing:.06em;text-transform:uppercase;color:#cfcdc4;margin-top:6px}}
.cols{{display:grid;grid-template-columns:1.25fr 1fr;gap:44px;margin-top:22px}} .h{{display:flex;justify-content:space-between;align-items:center;font-size:21px;font-weight:650;letter-spacing:.06em;text-transform:uppercase;color:#cfcdc4;margin-bottom:4px}}
.pill{{font-size:20px;font-weight:700;letter-spacing:0;text-transform:none;padding:4px 12px;border-radius:999px}}
.row{{display:grid;grid-template-columns:150px 1fr;align-items:baseline;gap:14px;padding:5px 0;border-top:2px solid #2c2c2a}}
.p{{font-weight:800;font-variant-numeric:tabular-nums}} .n{{font-size:25px;font-weight:650;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}}
.av{{font-size:23px;margin-top:14px;line-height:1.35}} .tax{{margin-top:auto;padding:10px 18px;border-radius:12px;background:color-mix(in oklab,{BAD} 22%,transparent);border-left:7px solid {BAD};font-size:24px;font-weight:700}}
.tax span{{font-weight:500;opacity:.85}} .foot{{display:flex;justify-content:space-between;font-size:19px;color:#9c9a92;margin-top:12px}} .foot b{{color:#cfcdc4}}
</style><div class="wrap">
<div class="top"><span class="chip">{icon}</span><div><div class="t">Kannapolis Gas Prices</div><div class="k">Cheapest today · {today:%A, %B %-d, %Y}</div></div></div>
<div class="cols">
 <div><div class="h">Regular {pill(trend("regular"))}</div>{"".join(row(i, s, 46) for i, s in enumerate(reg[:5]))}</div>
 <div><div class="h">Diesel {pill(trend("diesel"))}</div>{"".join(row(i, s, 40) for i, s in enumerate(dsl[:3]))}{avl}</div>
</div>
{tax}
<div class="foot"><b>Kannapolis Civic Dashboard</b><span>kannapolistalk.com</span></div>
</div>"""


def gas_share(g: dict, dist: Path, today: dt.date | None = None) -> dict | None:
    """Draw today's gas card into dist/share/ and return the share page's title, description and image path."""
    if today is None:  # the day in Kannapolis: GitHub's runners are on UTC, so an evening build would say tomorrow
        from zoneinfo import ZoneInfo
        today = dt.datetime.now(ZoneInfo("America/New_York")).date()
    reg = g["grades"]["regular"]["stations"]
    if not reg:
        return None
    c = reg[0]
    dsl = (g["grades"].get("diesel") or {}).get("stations", [])
    av = g.get("aviation") or []
    name = f"share/gas-{today.isoformat()}-{c['price']:.2f}.png"
    ok = render(gas_card(g, today), dist / name)
    n = active_notice(g.get("notices"), today)
    desc = [f"Cheapest regular ${c['price']:.2f} at {c['name']}"]
    if dsl:
        desc.append(f"diesel ${dsl[0]['price']:.2f} at {dsl[0]['name']}")
    if av:
        desc.append(f"100LL avgas ${av[0]['price']:.2f}")
    text = ", ".join(desc) + ". " + (f"{n['short']}. " if n else "") + "The cheapest stations, a map and the week's trend, updated daily."
    log(f"share cards: gas {'drew ' + name if ok else 'no card'}")
    return {"title": f"Gas in Kannapolis: ${c['price']:.2f} regular at {c['name']}", "description": text,
            "image": name if ok else "share/home.jpg", "alt": f"Today's cheapest gas in Kannapolis: ${c['price']:.2f} regular at {c['name']}"}
