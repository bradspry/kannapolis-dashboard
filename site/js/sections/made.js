// Made in Kannapolis: local makers, starting with a featured one. Hours and "open now" are
// worked out on the device from the maker's posted weekly hours.
import { h, contactButtons, fill } from "../ui.js";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const mins = (s) => { const [hh, mm] = s.split(":").map(Number); return hh * 60 + mm; };
const tel = (n) => `tel:${n.replace(/[^0-9]/g, "")}`;

export const featuredMaker = (made) => made.makers.find((m) => m.id === made.featured) || made.makers[0];

/** "3 PM", "12 PM", "midnight". */
export function fmtClock(s) {
  const t = mins(s);
  if (t === 0 || t === 1440) return "midnight";
  const hh = Math.floor(t / 60), mm = t % 60, ap = hh >= 12 ? "PM" : "AM", h12 = hh % 12 || 12;
  return `${h12}${mm ? `:${String(mm).padStart(2, "0")}` : ""} ${ap}`;
}

export const hoursFor = (m, day) => m.hours.find((r) => r.days.includes(day)) || null;
export const hoursText = (r) => (r ? `${fmtClock(r.open)} – ${fmtClock(r.close)}` : "Closed");

/** Open now? If not, when it opens next. */
export function openStatus(m, now = new Date()) {
  const t = now.getHours() * 60 + now.getMinutes(), today = hoursFor(m, now.getDay());
  if (today && t >= mins(today.open) && t < mins(today.close)) {
    const left = mins(today.close) - t;
    return { open: true, label: left <= 60 ? `Open, closes soon (${fmtClock(today.close)})` : `Open until ${fmtClock(today.close)}` };
  }
  if (today && t < mins(today.open)) return { open: false, label: `Closed · opens ${fmtClock(today.open)} today` };
  for (let i = 1; i <= 7; i++) {
    const d = (now.getDay() + i) % 7, r = hoursFor(m, d);
    if (r) return { open: false, label: `Closed · opens ${i === 1 ? "tomorrow" : DAYS[d]} ${fmtClock(r.open)}` };
  }
  return { open: false, label: "Closed" };
}

export function statusLine(m, cls = "", { compact = false } = {}) {
  const st = openStatus(m);
  // Compact (tiles): the hollow dot already says "closed", so "Closed · opens tomorrow 7 AM" -> "Opens tomorrow 7 AM".
  return h("span", { class: `pk-status ${st.open ? "open" : ""} ${cls}` }, st.open ? "● " : "○ ", compact ? st.label.replace(/^Closed · o/, "O") : st.label);
}

export function makerImage(m, size = "md") {
  if (!m.image) return h("div", { class: `mk-img ${size} none`, "aria-hidden": "true" }, "🍺");
  return h("img", { class: `mk-img ${size}`, src: m.image, alt: size === "lg" ? m.image_alt || "" : "", loading: "lazy" });
}

export function siteButton(m, { compact = false } = {}) {
  return h("a", { class: `btn-primary mk-site${compact ? " compact" : ""}`, href: m.site, target: "_blank", rel: "noopener" }, "Visit website ↗");
}

/** A week of hours, today in bold. Days with the same hours are listed together. */
export function hoursTable(m, now = new Date()) {
  const order = [1, 2, 3, 4, 5, 6, 0];
  return h("ul", { class: "gem-prices mk-hours", role: "list" }, order.map((d) =>
    h("li", { class: d === now.getDay() ? "today" : "" }, h("span", {}, DAYS[d], d === now.getDay() ? " (today)" : ""), h("b", {}, hoursText(hoursFor(m, d))))));
}

const ext = (href, text) => h("a", { href, target: "_blank", rel: "noopener" }, text);

// ---------- live music (from the maker's event calendar; times are the venue's local clock) ----------
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const at = (s) => new Date(s); // "2026-11-25T20:00" (no zone) is read as local time

/** Shows that haven't ended yet. */
export function upcomingShows(m, now = new Date()) {
  return (m.events || []).filter((e) => at(e.end || e.start) > now);
}

/** "Tonight", "Tomorrow", "Fri", or "Sat, Dec 5". */
export function showDay(e, now = new Date()) {
  const d = at(e.start), today = ymd(now), tmr = new Date(now); tmr.setDate(tmr.getDate() + 1);
  if (ymd(d) === today) return d.getHours() >= 17 ? "Tonight" : "Today";
  if (ymd(d) === ymd(tmr)) return "Tomorrow";
  const days = (d - now) / 864e5;
  return d.toLocaleDateString("en-US", days < 6 ? { weekday: "short" } : { weekday: "short", month: "short", day: "numeric" });
}
const hm = (s) => s.slice(11, 16);
export const showTime = (e) => `${fmtClock(hm(e.start))}${e.end ? `–${fmtClock(hm(e.end))}` : ""}`;

/** Tile line: "♫ Tonight 8 PM · Uptown Dueling Pianos" (or "Live now"). */
export function nextShowLine(m, now = new Date()) {
  const e = upcomingShows(m, now)[0];
  if (!e) return null;
  const live = at(e.start) <= now;
  return h("p", { class: "mk-next-show" }, h("span", { class: "mk-note", "aria-hidden": "true" }, "♫"),
    h("b", {}, live ? "Live now" : `${showDay(e, now)} ${fmtClock(hm(e.start))}`), h("span", {}, ` · ${e.name}`));
}

/** Compact list for tiles. */
export function showList(m, n, { stack = false } = {}, now = new Date()) {
  // stack: when above the band (narrow columns), so long names get the full width.
  return h("ul", { class: `ub-mini mk-shows${stack ? " stack" : ""}` }, upcomingShows(m, now).slice(0, n).map((e) =>
    h("li", {}, h("b", {}, `${showDay(e, now)} ${fmtClock(hm(e.start))}`), h("span", {}, e.name))));
}

function showsCard(m) {
  const list = upcomingShows(m);
  if (!list.length) return null;
  const now = new Date();
  return h("section", { class: "card" }, h("h3", {}, "Live music"),
    h("p", { class: "tile-meta" }, `${list.length} upcoming show${list.length === 1 ? "" : "s"} on the Old Armor Stage${list.every((e) => e.free) ? ", all free to attend" : ""}.`),
    h("ul", { class: "mk-show-rows", role: "list" }, list.slice(0, 16).map((e) => {
      const d = at(e.start);
      return h("li", { class: at(e.start) <= now ? "live" : "" },
        h("span", { class: "mk-show-date" }, h("small", {}, d.toLocaleDateString("en-US", { weekday: "short" })), h("b", {}, String(d.getDate())), h("small", {}, d.toLocaleDateString("en-US", { month: "short" }))),
        h("span", {}, h("b", {}, e.name), h("small", {}, [showTime(e), e.genre, e.free === false ? "Tickets" : null].filter(Boolean).join(" · "))));
    })),
    h("p", { class: "tile-meta" }, m.events_note, " ", ext(m.links.events, "Full calendar ↗")));
}

function makerSection(m) {
  return [
    h("section", { class: "card gem-hero mk-hero" }, makerImage(m, "lg"),
      h("div", { class: "gem-hero-text" },
        h("div", { class: "bb-next-label" }, `Featured maker · ${m.kind}`),
        h("h3", {}, m.name),
        h("div", { class: "mk-tags" }, h("span", { class: "mk-tag" }, "🎖 Veteran-owned"), h("span", { class: "mk-tag" }, `Est. ${m.est}`), h("span", { class: "mk-tag" }, "West Avenue, downtown")),
        h("div", { class: "mk-status" }, statusLine(m, "big")),
        h("p", {}, m.about),
        h("div", { class: "gem-actions" }, siteButton(m),
          ext(m.map, "Directions ↗"),
          h("a", { href: tel(m.phone) }, `☎ ${m.phone}`)))),

    h("h3", { class: "about-h" }, "Made here"),
    h("div", { class: "ub-ways" }, m.beers.map((b) => h("div", { class: "card ub-way" },
      h("b", {}, b.name), h("span", { class: "mk-abv" }, `${b.abv} ABV · ${b.size}`), h("p", {}, b.about)))),
    h("p", { class: "tile-meta" }, m.beers_note, " ", ext(m.links.beers, "Full beer lineup ↗")),

    showsCard(m),

    h("div", { class: "grid" },
      h("section", { class: "card" }, h("h3", {}, "Taproom hours"), hoursTable(m),
        h("p", { class: "tile-meta" }, m.address, " · ", ext(m.links.events, "Weekly events ↗"))),
      h("section", { class: "card" }, h("h3", {}, m.pay_it_forward.title),
        h("p", { class: "gem-p" }, m.pay_it_forward.text),
        h("div", { class: "gem-actions" }, ext(m.pay_it_forward.url, "Buy a pint for a hero ↗"), ext(m.links.shop, "Merch shop ↗")))),

    h("section", { class: "card" }, h("h3", {}, "Good to know"),
      h("ul", { class: "pk-rules" }, m.good_to_know.map((g) => h("li", {}, g)))),

    h("div", { class: "card kpd-chief" },
      h("div", {}, h("b", {}, m.name), h("span", {}, `${m.address} · ${m.phone} · ${m.email}`),
        h("div", { class: "pk-links" }, ext(m.links.instagram, "Instagram ↗"), ext(m.links.facebook, "Facebook ↗"), ext(m.links.tiktok, "TikTok ↗"))),
      contactButtons({ name: m.name, phone: m.phone, email: m.email }, m.name)),
  ];
}

export function renderMade(made) {
  const root = document.getElementById("made-body");
  const m = featuredMaker(made);
  fill(root, 
    h("p", { class: "gem-p" }, made.intro),
    ...makerSection(m),
    h("p", { class: "note" }, "From the maker's own website; live music from the calendar on its Weekly Schedule page, read daily. Open/closed is worked out on your device from posted hours; holidays and private events can change them, so check before you go. Please enjoy responsibly; 21+ to drink."));
}
