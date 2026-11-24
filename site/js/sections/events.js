// Events widget: the City's official "Upcoming Events" calendar. Repeating events arrive merged into
// one series (etl/build_events.py), so a 40-night light show is one entry, not forty.
import { h, fill } from "../ui.js";

const DAY_MS = 86400000;
const parseDay = (s) => { const [y, m, d] = s.slice(0, 10).split("-").map(Number); return new Date(y, m - 1, d); };
const fmtDay = (d, o = { month: "short", day: "numeric" }) => d.toLocaleDateString("en-US", o);
export const fmtTime = (hhmm) => {
  if (!hhmm) return "All day";
  const [h24, m] = hhmm.split(":").map(Number);
  return new Date(2000, 0, 1, h24, m).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
};
const today = () => { const t = new Date(); t.setHours(0, 0, 0, 0); return t; };

/** Upcoming events with their next date; series that are under way count as "on now". */
export function upcomingEvents(data) {
  const t0 = today();
  return data.events
    .filter((e) => !e.canceled)
    .map((e) => {
      const dates = e.dates.map(parseDay);
      const next = dates.find((d) => d >= t0);
      return next ? { ...e, _dates: dates, _next: next, _onNow: e.count > 1 && dates[0] <= t0, _left: dates.filter((d) => d >= t0).length } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a._next - b._next || (a.time || "").localeCompare(b.time || ""));
}

export function whenLabel(e) {
  const days = Math.round((e._next - today()) / DAY_MS);
  if (days === 0) return e.time && Number(e.time.slice(0, 2)) >= 17 ? "Tonight" : "Today";
  if (days === 1) return "Tomorrow";
  if (days < 7) return fmtDay(e._next, { weekday: "long" });
  return null;
}

let filter = "all";

export function renderEvents(data) {
  const root = document.getElementById("events-body");
  const all = upcomingEvents(data);
  const cats = [["all", "All"], ["Events", "Community events"], ["Meetings", "Public meetings"]];
  const chips = h("div", { class: "chips", role: "group", "aria-label": "Filter events" });
  const list = h("ul", { class: "ev-list", role: "list" });

  const draw = () => {
    chips.replaceChildren(...cats.filter(([k]) => k === "all" || all.some((e) => e.category === k)).map(([k, label]) =>
      h("button", { class: "chip", type: "button", "aria-pressed": String(filter === k), onclick: () => { filter = k; draw(); } }, label)));
    const items = all.filter((e) => filter === "all" || e.category === filter);
    list.replaceChildren(...items.map((e) => {
      const series = e.count > 1;
      const when = whenLabel(e);
      const last = e._dates.at(-1);
      return h("li", { class: `ev${series ? " series" : ""}` },
        h("div", { class: "ev-date", "aria-hidden": "true" },
          series && e._onNow
            ? [h("span", { class: "ev-now" }, "On now"), h("small", {}, `to ${fmtDay(last)}`)]
            : [h("span", {}, fmtDay(e._next, { month: "short" })), h("b", {}, e._next.getDate()), h("small", {}, fmtDay(e._next, { weekday: "short" }))]),
        h("div", { class: "ev-body" },
          h("div", { class: "ev-title" },
            h("a", { href: e.url, target: "_blank", rel: "noopener" }, e.title),
            when ? h("span", { class: "mtg-badge soon" }, when) : null,
            e.category === "Meetings" ? h("span", { class: "ev-tag" }, "Meeting") : null),
          h("div", { class: "ev-meta" }, [fmtTime(e.time), e.location].filter(Boolean).join(" · ")),
          series ? h("div", { class: "ev-recur" },
            h("span", { class: "ev-count" }, `${e.count} dates`), e.recurrence,
            e._onNow ? ` · ${e._left} left` : "") : null));
    }));
    if (!items.length) list.replaceChildren(h("li", { class: "loading" }, "Nothing upcoming in this category."));
  };
  draw();
  fill(root, 
    chips, list,
    h("p", { class: "note" },
      "From the City's official ",
      h("a", { href: data.calendar, target: "_blank", rel: "noopener" }, "events calendar"),
      ` (${data.feed_items} listings, with repeats merged). For agendas, open the `,
      h("a", { href: "#meetings" }, "Public meetings"), ` widget. Updated ${data.generated}.`));
}
