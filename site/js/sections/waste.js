// Waste collection: report a missed pickup, holiday delays (worked out on the device), the loose-leaf
// season, what goes in which cart, set-out rules, and links to the City's CARTology pickup-day lookup and app.
import { h, fill } from "../ui.js";

const DAY_MS = 86400000;
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const parseDay = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const md = (d) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
const tel = (n) => `tel:${n.replace(/[^0-9]/g, "")}`;
const ext = (href, label, cls) => h("a", { href, target: "_blank", rel: "noopener", class: cls }, label);

/** Thanksgiving/Christmas delay: shown from a week before through that Saturday.
 *  From the holiday on, each weekday's pickup moves one day later (Friday's moves to Saturday). */
export function delayNotice(w, now = new Date()) {
  const today = startOfDay(now);
  for (const hol of w.delay_holidays) {
    const d = parseDay(hol.date);
    if (d.getDay() === 0 || d.getDay() === 6) continue;
    const sat = new Date(d.getTime() + (6 - d.getDay()) * DAY_MS);
    const from = new Date(d.getTime() - 7 * DAY_MS);
    if (today < from || today > sat) continue;
    const shifts = []; for (let k = d.getDay(); k <= 5; k++) shifts.push(`${DAYS[k]} → ${DAYS[k + 1]}`);
    const monday = new Date(d.getTime() - (d.getDay() - 1) * DAY_MS);
    const when = today >= monday ? "This week" : "Next week";
    return { holiday: hol.name, date: d, short: `${hol.name}: pickups from ${DAYS[d.getDay()]} run a day late`,
      text: `${when} (${hol.name}, ${md(d)}): no pickup on the holiday. Pickups from then on run one day late: ${shifts.join(", ")}.` };
  }
  return null;
}

/** Upcoming days with no yard-waste or leaf collection, within the next two weeks. */
export function yardOff(w, now = new Date()) {
  const today = startOfDay(now), until = new Date(today.getTime() + 14 * DAY_MS);
  const days = w.yard_holidays.map((x) => ({ ...x, d: parseDay(x.date) })).filter((x) => x.d >= today && x.d <= until);
  if (!days.length) return null;
  const span = days.length > 1 ? `${md(days[0].d)}–${days.at(-1).d.getDate()}` : md(days[0].d);
  return { short: `No yard waste ${span} (${days[0].name})`, text: `No yard-waste, limb or loose-leaf collection ${span} (${days[0].name}).` };
}

/** Remaining yard-waste holidays, with back-to-back days of the same holiday merged: "Thanksgiving (Nov 26–27)". */
function yardHolidayList(w, now = new Date()) {
  const days = w.yard_holidays.map((x) => ({ ...x, d: parseDay(x.date) })).filter((x) => x.d >= startOfDay(now));
  const groups = [];
  for (const x of days) {
    const g = groups.at(-1);
    if (g && g.name === x.name && x.d - g.end === DAY_MS) g.end = x.d; else groups.push({ name: x.name, start: x.d, end: x.d });
  }
  return groups.map((g) => `${g.name} (${md(g.start)}${g.end > g.start ? `–${g.end.getDate()}` : ""})`).join(", ");
}

export function leafSeason(w, now = new Date()) {
  const ls = w.leaf_season, today = startOfDay(now);
  if (today < parseDay(ls.start) || today > parseDay(ls.end)) return null;
  return { short: `Loose-leaf season, through ${md(parseDay(ls.end))}`, text: ls.about };
}

/** Notices for right now, most urgent first. */
export function notices(w, now = new Date()) {
  return [["🦃", delayNotice(w, now)], ["🌿", yardOff(w, now)], ["🍂", leafSeason(w, now)]].filter(([, n]) => n)
    .map(([emoji, n]) => ({ emoji, ...n }));
}

/** The highlighted action: report a missed pickup by phone or email. */
export function missedButtons(w, { compact = false, side = false } = {}) {
  return h("div", { class: `ws-missed${compact ? " compact" : ""}${side ? " side" : ""}` },
    h("a", { class: "kpd-call ws-call", href: tel(w.missed.phone) },
      h("span", { class: "ws-call-icon", "aria-hidden": "true" }, "☎"),
      h("span", {}, h("b", {}, w.missed.phone), h("small", {}, "Call about a missed pickup"))),
    h("a", { class: "kpd-call ws-mail", href: `mailto:${w.missed.email}?subject=${encodeURIComponent("Missed pickup")}` },
      h("span", { class: "ws-call-icon", "aria-hidden": "true" }, "✉"),
      h("span", {}, h("b", {}, compact ? "Email us" : w.missed.email), h("small", {}, compact ? w.missed.email : "Email about a missed pickup"))));
}

export function renderWaste(w) {
  const root = document.getElementById("waste-body");
  const now = notices(w);
  fill(root, 
    h("section", { class: "card ws-hero" },
      h("div", {}, h("div", { class: "bb-next-label" }, "Missed a pickup?"),
        h("h3", {}, "Call or email within 24 hours"),
        h("p", { class: "gem-p" }, w.missed.rule)),
      missedButtons(w)),

    now.length ? h("div", { class: "ws-notices" }, now.map((n) => h("div", { class: "card ws-notice" },
      h("span", { class: "ws-notice-emoji", "aria-hidden": "true" }, n.emoji), h("p", {}, n.text)))) : null,

    h("section", { class: "card" },
      h("h3", {}, "Find your pickup days"),
      h("p", { class: "gem-p" }, w.cartology.about),
      h("div", { class: "gem-actions" }, ext(w.cartology.page, "📅 Find my pickup days ↗", "btn-primary"),
        ext(w.cartology.app_store, "CARTology for iPhone ↗"), ext(w.cartology.google_play, "CARTology for Android ↗"))),

    h("h3", { class: "about-h" }, "What goes where"),
    h("div", { class: "ub-ways ws-services" }, w.services.map((s) => h("div", { class: `card ub-way ws-svc ws-${s.id}` },
      h("b", {}, h("span", { "aria-hidden": "true" }, `${s.emoji} `), s.name),
      h("span", { class: "ed-when" }, s.every), h("span", { class: "tile-meta" }, s.cart),
      h("ul", { class: "pk-rules" }, s.tips.map((t) => h("li", {}, t)))))),

    h("div", { class: "grid" },
      h("section", { class: "card" }, h("h3", {}, "Setting out your carts"), h("ul", { class: "pk-rules" }, w.set_out.map((t) => h("li", {}, t))),
        h("p", { class: "tile-meta" }, "🎄 ", w.christmas_trees)),
      h("section", { class: "card" }, h("h3", {}, "Holidays"), h("p", { class: "gem-p" }, w.delay_rule),
        h("p", { class: "tile-meta" }, "No yard waste, limb or loose-leaf collection on: ",
          yardHolidayList(w) || "none left this year", "."))),

    h("div", { class: "grid" },
      h("section", { class: "card" }, h("h3", {}, "Carts"),
        h("ul", { class: "gem-prices", role: "list" }, w.carts.map((c) => h("li", {}, h("span", {}, c.what), h("b", {}, c.price)))),
        h("p", { class: "tile-meta" }, w.cart_note)),
      h("section", { class: "card" }, h("h3", {}, "Not picked up at the curb"),
        h("ul", { class: "ub-mini ws-elsewhere" }, w.elsewhere.map((e) => h("li", {}, h("b", {}, e.what),
          h("span", {}, e.detail, e.phone ? [" ", h("a", { href: tel(e.phone) }, e.phone)] : null, e.url ? [" ", ext(e.url, "Brochure ↗")] : null)))))),

    h("div", { class: "card kpd-chief" },
      w.director.photo ? h("img", { src: w.director.photo, alt: "" }) : null,
      h("div", {}, h("b", {}, w.director.name), h("span", {}, `${w.director.title} · ${w.phone} · ${w.address} (yard: ${w.physical})`),
        h("div", { class: "pk-links" }, ext(w.links.page, "Garbage, Recycling & Yard Waste ↗"), ext(w.links.directory, "Department directory ↗")))),
    h("p", { class: "note" }, "Machine-parsed from the City's Garbage, Recycling & Yard Waste pages. Holiday delays and the loose-leaf season are worked out on your device from the City's posted schedule."));
}
