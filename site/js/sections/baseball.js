// Kannapolis Cannon Ballers 2027: next home game, home stands, month calendars, and calendar export.
import { h } from "../ui.js";

const DAY_MS = 86400000;
const MONTHS = ["April", "May", "June", "July", "August", "September"];
const parseDay = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
export const fmtTime = (t) => { if (!t) return ""; const [hh, mm] = t.split(":").map(Number); return new Date(2000, 0, 1, hh, mm).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }); };
export const fmtDay = (d, o = { weekday: "short", month: "short", day: "numeric" }) => d.toLocaleDateString("en-US", o);
const today = () => { const t = new Date(); t.setHours(0, 0, 0, 0); return t; };

export function prepGames(bb) { return bb.games.map((g) => ({ ...g, _d: parseDay(g.date), name: bb.teams[g.opp] })); }
export const nextHome = (games) => games.find((g) => g.home && g._d >= today());

/** Consecutive home games against the same team = one home stand. */
export function homeStands(games) {
  const out = [];
  for (const g of games.filter((x) => x.home)) {
    const last = out.at(-1);
    if (last && last.opp === g.opp && (g._d - last.end) / DAY_MS <= 2) { last.end = g._d; last.games.push(g); }
    else out.push({ opp: g.opp, name: g.name, start: g._d, end: g._d, games: [g] });
  }
  return out;
}
export const standLabel = (s) => (s.start.getMonth() === s.end.getMonth()
  ? `${fmtDay(s.start, { month: "short", day: "numeric" })}–${s.end.getDate()}`
  : `${fmtDay(s.start, { month: "short", day: "numeric" })}–${fmtDay(s.end, { month: "short", day: "numeric" })}`);

export function untilText(d) {
  const days = Math.round((d - today()) / DAY_MS);
  return days === 0 ? "Today" : days === 1 ? "Tomorrow" : days < 0 ? "" : `In ${days} days`;
}

/** iCalendar file for home games (times are Kannapolis local). */
export function icsUrl(bb, games) {
  const stamp = (d, t) => { const [hh, mm] = t.split(":"); return `${d.replaceAll("-", "")}T${hh}${mm}00`; };
  const end = (t) => { const [hh, mm] = t.split(":").map(Number); return `${String(Math.min(hh + 3, 23)).padStart(2, "0")}${String(mm).padStart(2, "0")}00`; };
  const now = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Kannapolis Citizen-built Dashboard//Cannon Ballers//EN"];
  for (const g of games) {
    lines.push("BEGIN:VEVENT", `UID:kcb-${g.date}@kannapolis-dashboard`, `DTSTAMP:${now}`,
      `DTSTART;TZID=America/New_York:${stamp(g.date, g.time)}`, `DTEND;TZID=America/New_York:${g.date.replaceAll("-", "")}T${end(g.time)}`,
      `SUMMARY:Cannon Ballers vs ${g.name}`, `LOCATION:${bb.ballpark.replace(/,/g, "\\,")}`,
      `DESCRIPTION:Tickets: ${bb.website} · ${bb.phone}`, `URL:${bb.website}`, "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return URL.createObjectURL(new Blob([lines.join("\r\n")], { type: "text/calendar" }));
}

function calLink(bb, games, label, filename) {
  const a = h("a", { class: "bb-cal-link", href: "#", download: filename }, label);
  a.addEventListener("click", () => { a.href = icsUrl(bb, games); });
  return a;
}

export function nextGameCard(bb, games, { compact = false } = {}) {
  const g = nextHome(games);
  if (!g) return h("p", { class: "tile-meta" }, "The 2027 season is over. See you next spring!");
  const opening = games[0];
  const preseason = today() < opening._d;
  return h("div", { class: `bb-next${compact ? " compact" : ""}` },
    h("div", { class: "date-block bb-date" }, h("span", {}, fmtDay(g._d, { month: "short" })), h("b", {}, g._d.getDate())),
    h("div", {},
      h("div", { class: "bb-next-label" }, g === games.find((x) => x.home) ? "Home opener" : "Next home game"),
      h("div", { class: "bb-next-title" }, `vs ${g.name}`),
      h("div", { class: "tile-meta" }, `${fmtDay(g._d, { weekday: "long" })} · ${fmtTime(g.time)}`, untilText(g._d) ? ` · ${untilText(g._d)}` : ""),
      preseason && !compact ? h("div", { class: "tile-meta" }, `Season opens ${fmtDay(opening._d, { weekday: "short", month: "short", day: "numeric" })} at ${opening.name}`) : null));
}

let filter = "all", selected = null;

export function renderBaseball(bb) {
  const root = document.getElementById("baseball-body");
  const games = prepGames(bb);
  const home = games.filter((g) => g.home);
  const stands = homeStands(games).filter((s) => s.end >= today());
  const byDate = Object.fromEntries(games.map((g) => [g.date, g]));
  const timeMix = Object.entries(home.reduce((m, g) => ((m[g.time] = (m[g.time] || 0) + 1), m), {})).sort((a, b) => b[1] - a[1]);

  const detail = h("p", { class: "bb-detail", role: "status", "aria-live": "polite" });
  const cals = h("div", { class: "bb-months" });
  const chips = h("div", { class: "chips", role: "group", "aria-label": "Show games" });

  const showDetail = (g) => {
    selected = g.date;
    detail.replaceChildren(h("b", {}, fmtDay(g._d, { weekday: "long", month: "long", day: "numeric" })), " · ",
      g.home ? `vs ${g.name} at ${bb.ballpark.split(",")[0]}, ${fmtTime(g.time)}` : `at ${g.name} (away)`,
      g.note ? ` (${g.note})` : "",
      ...(g.home ? [" · ", calLink(bb, [g], "Add to calendar", `cannon-ballers-${g.date}.ics`)] : []));
    drawCals();
  };

  function drawCals() {
    chips.replaceChildren(...[["all", "All games"], ["home", "Home games only"]].map(([k, l]) =>
      h("button", { class: "chip", type: "button", "aria-pressed": String(filter === k), onclick: () => { filter = k; drawCals(); } }, l)));
    cals.replaceChildren(...MONTHS.map((name, i) => {
      const m = 3 + i, first = new Date(2027, m, 1), days = new Date(2027, m + 1, 0).getDate();
      const cells = [];
      for (let k = 0; k < first.getDay(); k++) cells.push(h("div", { class: "bb-cell empty", "aria-hidden": "true" }));
      for (let d = 1; d <= days; d++) {
        const key = `2027-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        const g = byDate[key];
        const shown = g && (filter === "all" || g.home);
        const past = new Date(2027, m, d) < today();
        cells.push(shown
          ? h("button", { type: "button", class: `bb-cell ${g.home ? "home" : "away"}${past ? " past" : ""}${selected === key ? " sel" : ""}`,
            "aria-label": `${fmtDay(g._d, { weekday: "long", month: "long", day: "numeric" })}: ${g.home ? `home vs ${g.name}, ${fmtTime(g.time)}` : `away at ${g.name}`}`,
            onclick: () => showDetail(g) },
            h("span", { class: "bb-d" }, d), h("span", { class: "bb-opp" }, `${g.home ? "" : "@"}${g.opp}`), g.home ? h("span", { class: "bb-t" }, fmtTime(g.time).replace(":00", "").replace(" ", "")) : null)
          : h("div", { class: `bb-cell${g ? " hidden-away" : ""}` }, h("span", { class: "bb-d" }, d)));
      }
      return h("section", { class: "card bb-month" }, h("h4", {}, `${name} 2027`),
        h("div", { class: "bb-grid" }, ["S", "M", "T", "W", "T", "F", "S"].map((x) => h("div", { class: "bb-dow", "aria-hidden": "true" }, x)), cells));
    }));
  }
  drawCals();

  root.replaceChildren(
    h("div", { class: "bb-top" },
      h("div", { class: "card" }, nextGameCard(bb, games),
        h("div", { class: "bb-actions" },
          h("a", { class: "btn-primary", href: bb.website, target: "_blank", rel: "noopener" }, "🎟 Tickets at kcballers.com ↗"),
          calLink(bb, home.filter((g) => g._d >= today()), "📅 Add all home games to my calendar", "cannon-ballers-2027-home.ics")),
        h("p", { class: "tile-meta" }, "Box office ", h("a", { href: `tel:${bb.phone.replace(/[^0-9]/g, "")}` }, bb.phone), " · ",
          h("a", { href: `mailto:${bb.email}` }, bb.email))),
      h("div", { class: "card" }, h("h3", {}, "Upcoming home stands"),
        h("ul", { class: "bb-stands", role: "list" }, stands.slice(0, 8).map((s) => h("li", {},
          h("span", { class: "bb-stand-dates" }, standLabel(s)), h("b", {}, `vs ${s.name}`), h("small", {}, `${s.games.length} games`)))))),
    h("div", { class: "bb-key" }, chips,
      h("span", { class: "bb-legend" }, h("span", { class: "bb-swatch home" }), "Home (vs)", h("span", { class: "bb-swatch away" }), "Away (@)"),
      h("span", { class: "tile-meta" }, "Tap a game for details.")),
    detail, cals,
    h("div", { class: "card bb-facts" },
      h("div", {}, h("h3", {}, "2027 season"),
        h("ul", { role: "list" },
          h("li", {}, h("b", {}, String(games.length)), ` games (${home.length} at home) in the ${bb.league}`),
          h("li", {}, "Home games at ", h("b", {}, bb.ballpark)),
          h("li", {}, "Home start times: ", timeMix.map(([t, n]) => `${fmtTime(t)} (${n})`).join(", ")))),
      h("div", {}, h("h3", {}, "Opponents"),
        h("ul", { class: "bb-teams", role: "list" }, [...new Set(games.map((g) => g.opp))].sort().map((c) => h("li", {}, h("b", {}, c), ` ${bb.teams[c]}`))))),
    h("p", { class: "note" }, "From the team's ", h("a", { href: bb.schedule_pdf, target: "_blank", rel: "noopener" }, "printed 2027 schedule"),
      `, transcribed by hand and checked (132 games, 66 home). The printed calendar labels May 28 as "38". ${bb.note}`));
}
