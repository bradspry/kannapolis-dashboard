// Meetings widget: a month calendar + list of upcoming City meetings, each linked to its agenda.
import { h, legend, fill } from "../ui.js";
import { tokens } from "../theme.js";

const DAY_MS = 86400000;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Meeting times are Kannapolis local wall-clock times ("2026-11-23T18:00"); parse them as local.
const parseLocal = (s) => {
  const [d, t = "00:00"] = s.split("T");
  const [y, m, day] = d.split("-").map(Number);
  const [hh, mm] = t.split(":").map(Number);
  return new Date(y, m - 1, day, hh, mm);
};
const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const fmtTime = (d) => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
const fmtDay = (d, opts = { weekday: "long", month: "long", day: "numeric" }) => d.toLocaleDateString("en-US", opts);

function relative(d, now) {
  const days = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / DAY_MS);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days > 1 && days < 15) return `In ${days} days`;
  return null;
}

// Group meetings by body so the calendar can color them; at most 3 hues + gray "Other".
function bodyOf(m) {
  const c = `${m.category || ""} ${m.title}`.toLowerCase();
  if (c.includes("council")) return "City Council";
  if (c.includes("planning") || c.includes("zoning commission")) return "Planning & Zoning";
  if (c.includes("adjustment")) return "Board of Adjustment";
  return "Other boards";
}
const BODIES = ["City Council", "Planning & Zoning", "Board of Adjustment", "Other boards"];

function icsFor(m, start) {
  const end = new Date(start.getTime() + (m.duration_min || 120) * 60000);
  const stamp = (d) => `${dayKey(d).replaceAll("-", "")}T${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}00`;
  const esc = (s) => String(s || "").replace(/([,;\\])/g, "\\$1").replace(/\n/g, "\\n");
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Kannapolis Talk//Meetings//EN", "BEGIN:VEVENT",
    `UID:civicclerk-${m.id}@kannapolis-dashboard`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`,
    `DTSTART;TZID=America/New_York:${stamp(start)}`,
    `DTEND;TZID=America/New_York:${stamp(end)}`,
    `SUMMARY:${esc(`Kannapolis ${m.title}`)}`,
    m.location ? `LOCATION:${esc(m.location)}` : null,
    `DESCRIPTION:${esc(`Agenda and files: ${m.meeting_url}`)}`,
    `URL:${m.meeting_url}`,
    "END:VEVENT", "END:VCALENDAR",
  ].filter(Boolean);
  return URL.createObjectURL(new Blob([lines.join("\r\n")], { type: "text/calendar" }));
}

function meetingItem(m, now, color) {
  const start = parseLocal(m.start);
  const past = start < now;
  const rel = !past && relative(start, now);
  const links = [];
  if (m.agenda) {
    links.push(h("a", { class: "mtg-link primary", href: m.agenda.url, target: "_blank", rel: "noopener",
      "aria-label": `${m.agenda.type} for ${m.title} on ${fmtDay(start)} (PDF, opens in new tab)` }, `📄 ${m.agenda.type}`));
  } else if (!m.canceled) {
    links.push(h("span", { class: "mtg-pending" }, past ? "No agenda posted" : "Agenda not posted yet"));
  }
  if (m.minutes) links.push(h("a", { class: "mtg-link", href: m.minutes.url, target: "_blank", rel: "noopener" }, "📝 Minutes"));
  links.push(h("a", { class: "mtg-link", href: m.meeting_url, target: "_blank", rel: "noopener",
    "aria-label": `Meeting page for ${m.title} on ${fmtDay(start)} (opens in new tab)` }, "Meeting page ↗"));
  if (!past && !m.canceled) {
    const a = h("a", { class: "mtg-link", href: "#", download: `kannapolis-${dayKey(start)}.ics`,
      "aria-label": `Add ${m.title} on ${fmtDay(start)} to your calendar` }, "＋ Add to calendar");
    a.addEventListener("click", () => { a.href = icsFor(m, start); });
    links.push(a);
  }
  return h("li", { class: `mtg${m.canceled ? " canceled" : ""}${past ? " past" : ""}` },
    h("div", { class: "mtg-date", "aria-hidden": "true" },
      h("span", { class: "mtg-dow" }, fmtDay(start, { weekday: "short" })),
      h("span", { class: "mtg-dnum" }, start.getDate()),
      h("span", { class: "mtg-mon" }, fmtDay(start, { month: "short" }))),
    h("div", { class: "mtg-body" },
      h("div", { class: "mtg-title" },
        h("span", { class: "mtg-swatch", style: { background: color } }),
        h("span", {}, m.title),
        m.canceled ? h("span", { class: "mtg-badge canceled" }, "Canceled") : null,
        rel ? h("span", { class: "mtg-badge soon" }, rel) : null),
      h("div", { class: "mtg-meta" }, `${fmtDay(start)} · ${fmtTime(start)}${m.location ? ` · ${m.location}` : ""}`),
      h("div", { class: "mtg-links" }, links)));
}

let viewMonth = null;   // first-of-month Date shown in the calendar
let selectedDay = null; // "YYYY-MM-DD" or null for the upcoming list

export function renderMeetings(data) {
  const root = document.getElementById("meetings-body");
  const t = tokens();
  const now = new Date();
  const colors = Object.fromEntries(BODIES.map((b, i) => [b, i < 3 ? t.series[i] : t.mutedFill]));
  const all = data.meetings.map((m) => ({ ...m, _d: parseLocal(m.start), _body: bodyOf(m) }));
  const byDay = all.reduce((acc, m) => ((acc[dayKey(m._d)] ??= []).push(m), acc), {});
  const upcoming = all.filter((m) => m._d >= new Date(now.getFullYear(), now.getMonth(), now.getDate()));
  const usedBodies = BODIES.filter((b) => all.some((m) => m._body === b));
  viewMonth ??= new Date(now.getFullYear(), now.getMonth(), 1);

  const calWrap = h("div", { class: "mtg-cal" });
  const listWrap = h("div", { class: "mtg-list-wrap" });

  function drawCalendar() {
    const y = viewMonth.getFullYear(), mo = viewMonth.getMonth();
    const first = new Date(y, mo, 1), daysIn = new Date(y, mo + 1, 0).getDate();
    const label = fmtDay(first, { month: "long", year: "numeric" });
    const nav = (delta) => { viewMonth = new Date(y, mo + delta, 1); drawCalendar(); };
    const grid = h("div", { class: "cal-grid", role: "grid", "aria-label": `${label} meetings calendar` },
      WEEKDAYS.map((d) => h("div", { class: "cal-dow", role: "columnheader", "aria-label": d }, d[0])),
      Array.from({ length: first.getDay() }, () => h("div", { class: "cal-cell empty", "aria-hidden": "true" })),
      Array.from({ length: daysIn }, (_, i) => {
        const d = new Date(y, mo, i + 1), key = dayKey(d), ms = byDay[key] || [];
        const isToday = key === dayKey(now);
        const cell = h(ms.length ? "button" : "div", {
          class: `cal-cell${ms.length ? " has" : ""}${isToday ? " today" : ""}${key === selectedDay ? " selected" : ""}${d < now && !isToday ? " past" : ""}`,
          type: ms.length ? "button" : null,
          "aria-label": `${fmtDay(d)}${ms.length ? `: ${ms.map((m) => `${m.title}${m.canceled ? " (canceled)" : ""}`).join(", ")}` : ""}`,
          "aria-pressed": ms.length ? String(key === selectedDay) : null,
        },
          h("span", { class: "cal-num" }, i + 1),
          ms.length ? h("span", { class: "cal-dots", "aria-hidden": "true" },
            ms.map((m) => h("span", { class: `cal-dot${m.canceled ? " canceled" : ""}`, style: { background: colors[m._body] } }))) : null);
        if (ms.length) cell.addEventListener("click", () => { selectedDay = key === selectedDay ? null : key; drawCalendar(); drawList(); });
        return cell;
      }));
    calWrap.replaceChildren(
      h("div", { class: "cal-head" },
        h("button", { class: "cal-nav", type: "button", "aria-label": "Previous month", onclick: () => nav(-1) }, "‹"),
        h("div", { class: "cal-title", "aria-live": "polite" }, label),
        h("button", { class: "cal-nav", type: "button", "aria-label": "Next month", onclick: () => nav(1) }, "›")),
      grid,
      legend(usedBodies.map((b) => ({ label: b, color: colors[b] }))));
  }

  function drawList() {
    let items, heading, back = null;
    if (selectedDay) {
      items = byDay[selectedDay] || [];
      heading = fmtDay(parseLocal(selectedDay));
      back = h("button", { class: "mtg-back", type: "button", onclick: () => { selectedDay = null; drawCalendar(); drawList(); } }, "← All upcoming meetings");
    } else {
      items = upcoming;
      heading = "Upcoming meetings";
    }
    listWrap.replaceChildren(
      h("div", { class: "mtg-list-head" }, h("h3", {}, heading), back),
      items.length
        ? h("ul", { class: "mtg-list", role: "list" }, items.map((m) => meetingItem(m, now, colors[m._body])))
        : h("p", { class: "loading" }, "No meetings are scheduled yet. New meetings usually appear a few weeks ahead."));
  }

  drawCalendar();
  drawList();
  fill(root, 
    h("div", { class: "mtg-layout" }, calWrap, listWrap),
    h("p", { class: "note" }, "From the City's ",
      h("a", { href: data.source, target: "_blank", rel: "noopener" }, "CivicClerk meeting portal"),
      `. Agendas are usually posted a few days before each meeting. Updated ${data.generated}.`));
}
