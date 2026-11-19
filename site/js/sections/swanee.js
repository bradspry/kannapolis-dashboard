// The Swanee Theatre: upcoming shows (daily from the venue's public events feed), weekly dance
// nights, what to know before you go, and how to rent the venue.
import { h, contactButtons } from "../ui.js";

const DAY_MS = 86400000;
const parseLocal = (s) => { const [d, t = "00:00"] = s.split("T"); const [y, m, dd] = d.split("-").map(Number); const [hh, mm] = t.split(":").map(Number); return new Date(y, m - 1, dd, hh, mm); };
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const localISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const timeOf = (d) => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
export const dayOf = (d, o = { weekday: "short", month: "short", day: "numeric" }) => d.toLocaleDateString("en-US", o);
const tel = (n) => `tel:${n.replace(/[^0-9]/g, "")}`;

/** Upcoming shows (today's included until they end). */
export function upcomingShows(sw, now = new Date()) {
  return sw.events.map((e) => ({ ...e, _d: parseLocal(e.start), _end: e.end ? parseLocal(e.end) : null }))
    .filter((e) => (e._end || e._d) >= now || startOfDay(e._d) >= startOfDay(now));
}

export function whenBadge(d, now = new Date()) {
  const days = Math.round((startOfDay(d) - startOfDay(now)) / DAY_MS);
  if (days === 0) return d.getHours() >= 17 ? "Tonight" : "Today";
  if (days === 1) return "Tomorrow";
  if (days < 7) return dayOf(d, { weekday: "long" });
  return null;
}

/** Weekly happening status for today: on tonight, next date, or season over. */
export function weeklyStatus(w, now = new Date()) {
  const dow = { Sundays: 0, Mondays: 1, Tuesdays: 2, Wednesdays: 3, Thursdays: 4, Fridays: 5, Saturdays: 6 }[w.day];
  const end = parseLocal(w.season.end);
  for (let i = 0; i < 14; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    const iso = localISO(d);
    if (d.getDay() !== dow || iso < w.season.start || d > end || w.skip.includes(iso)) continue;
    return { on: true, label: i === 0 ? `Tonight, ${w.time}` : `Next: ${dayOf(d)}, ${w.time}` };
  }
  return { on: false, label: startOfDay(now) > end ? "Season over; check back for new dates" : `Starts ${dayOf(parseLocal(w.season.start))}` };
}

export function rentButton(sw, { compact = false } = {}) {
  return h("a", { class: `btn-primary sw-rent${compact ? " compact" : ""}`, href: sw.rent.url, target: "_blank", rel: "noopener" }, `🏛 ${sw.rent.button} ↗`);
}

export function showImage(e, size = "md") {
  if (!e.image) return h("div", { class: `sw-img ${size} none`, "aria-hidden": "true" }, "🎤");
  const img = h("img", { class: `sw-img ${size}`, src: e.image, alt: "", loading: "lazy", referrerpolicy: "no-referrer" });
  img.addEventListener("error", () => img.replaceWith(h("div", { class: `sw-img ${size} none`, "aria-hidden": "true" }, "🎤")), { once: true });
  return img;
}

function showRow(e) {
  const badge = whenBadge(e._d);
  return h("li", { class: "sw-show" },
    showImage(e, "md"),
    h("div", {},
      h("div", { class: "sw-when" }, `${dayOf(e._d)} · ${e.all_day ? "All day" : timeOf(e._d)}`, e.doors ? ` (doors ${e.doors})` : "", badge ? h("span", { class: "mtg-badge soon" }, badge) : null),
      h("b", { class: "sw-title" }, e.title),
      e.cost ? h("div", { class: "tile-meta" }, e.cost) : null,
      h("div", { class: "pk-links" },
        e.tickets ? h("a", { href: e.tickets, target: "_blank", rel: "noopener" }, "Tickets ↗") : null,
        h("a", { href: e.url, target: "_blank", rel: "noopener" }, "Details ↗"))));
}

let monthFilter = "all";

export function renderSwanee(sw) {
  const root = document.getElementById("swanee-body");
  const shows = upcomingShows(sw);
  const months = [...new Set(shows.map((e) => dayOf(e._d, { month: "long", year: "numeric" })))];
  const chips = h("div", { class: "chips", role: "group", "aria-label": "Filter shows by month" });
  const list = h("ul", { class: "sw-shows", role: "list" });
  const draw = () => {
    chips.replaceChildren(...[["all", "All upcoming"], ...months.map((m) => [m, m.replace(/ \d{4}$/, "")])].map(([k, l]) =>
      h("button", { class: "chip", type: "button", "aria-pressed": String(monthFilter === k), onclick: () => { monthFilter = k; draw(); } }, l)));
    list.replaceChildren(...shows.filter((e) => monthFilter === "all" || dayOf(e._d, { month: "long", year: "numeric" }) === monthFilter).map(showRow));
  };
  if (monthFilter !== "all" && !months.includes(monthFilter)) monthFilter = "all";
  draw();
  const next = shows[0];

  root.replaceChildren(
    next ? h("section", { class: "card gem-hero" }, showImage(next, "lg"),
      h("div", { class: "gem-hero-text" },
        h("div", { class: "bb-next-label" }, "Next at the Swanee"),
        h("h3", {}, next.title),
        h("div", { class: "gem-when" }, `${dayOf(next._d, { weekday: "long", month: "long", day: "numeric" })} · ${timeOf(next._d)}`, next.doors ? ` · doors ${next.doors}` : "",
          whenBadge(next._d) ? h("span", { class: "mtg-badge soon" }, whenBadge(next._d)) : null),
        next.summary ? h("p", {}, next.summary) : null,
        h("div", { class: "gem-actions" },
          next.tickets ? h("a", { class: "btn-primary", href: next.tickets, target: "_blank", rel: "noopener" }, "🎟 Tickets ↗") : null,
          h("a", { href: sw.links.events, target: "_blank", rel: "noopener" }, "All events ↗"),
          h("a", { href: tel(sw.phone) }, `☎ ${sw.phone}`)))) : h("p", {}, "No upcoming shows are listed right now."),

    h("h3", { class: "about-h" }, "Weekly happenings"),
    h("div", { class: "ub-ways" }, sw.weekly.map((w) => { const st = weeklyStatus(w); return h("div", { class: "card ub-way" },
      h("b", {}, w.title), h("span", { class: `pk-status ${st.on ? "open" : ""}` }, st.on ? "● " : "○ ", st.label),
      h("p", {}, `${w.day}, ${w.time} · ${w.price}. ${w.detail}`)); })),
    h("p", { class: "tile-meta" }, sw.weekly_note, " ", h("a", { href: sw.links.weekly, target: "_blank", rel: "noopener" }, "Weekly happenings ↗")),

    h("h3", { class: "about-h" }, `Upcoming shows (${shows.length})`),
    chips, list,

    h("div", { class: "grid" },
      h("section", { class: "card sw-rent-card" },
        h("h3", {}, "Rent the Swanee"),
        h("p", { class: "gem-p" }, sw.rent.pitch),
        h("p", { class: "gem-p" }, h("b", {}, "Capacity: "), sw.rent.capacity),
        h("ul", { class: "gem-prices", role: "list" }, sw.rent.rates.map((r) => h("li", {}, h("span", {}, r.what), h("b", {}, r.rate)))),
        h("p", { class: "tile-meta" }, sw.rent.rates_note),
        h("div", { class: "gem-actions" }, rentButton(sw), h("a", { href: sw.rent.form, target: "_blank", rel: "noopener" }, "Facility request form ↗"))),
      h("section", { class: "card" }, h("h3", {}, "Good to know"),
        h("ul", { class: "pk-rules" }, sw.good_to_know.map((g) => h("li", {}, g))),
        h("a", { href: sw.links.faq, target: "_blank", rel: "noopener" }, "Swanee FAQs ↗"))),

    h("div", { class: "card kpd-chief" },
      h("div", {}, h("b", {}, sw.name), h("span", {}, `${sw.address} · ${sw.phone} · ${sw.email}`)),
      contactButtons({ name: sw.name, phone: sw.phone, email: sw.email }, sw.name)),
    h("p", { class: "note" }, "Shows from the Swanee's public events calendar, checked daily (updated ", sw.generated, "). Times and tickets can change; check the event page."));
}
