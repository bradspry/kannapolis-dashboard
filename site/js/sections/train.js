// NC By Train: Kannapolis Station (KAN). The station's posted schedule (read daily from ncbytrain.org),
// with the next departures, countdowns and open/closed worked out on the device. Every train runs daily.
import { h, fill } from "../ui.js";

const tel = (n) => `tel:${n.replace(/[^0-9]/g, "")}`;
const ext = (href, label, cls) => h("a", { href, target: "_blank", rel: "noopener", class: cls }, label);
const MIN = 60 * 1000;

/** A station-page item, with the page's own link on the linked words ("Baggage policy ↗"). */
function item(x) {
  if (!x.url) return x.text;
  const i = x.text.indexOf(x.link_text);
  if (i < 0) return ext(x.url, `${x.text} ↗`);
  return [x.text.slice(0, i), ext(x.url, `${x.link_text} ↗`), x.text.slice(i + x.link_text.length)].filter(Boolean);
}
const items = (list) => list.flatMap((x, i) => (i ? [" · ", item(x)] : [item(x)])).flat();

/** "14:45" -> "2:45 PM" */
export function fmtTime(hm) {
  const [hh, mm] = hm.split(":").map(Number);
  return `${hh % 12 || 12}:${String(mm).padStart(2, "0")} ${hh < 12 ? "AM" : "PM"}`;
}

const at = (day, hm) => { const [hh, mm] = hm.split(":").map(Number); const d = new Date(day); d.setHours(hh, mm, 0, 0); return d; };

/** The next `n` departures from now (today's, then tomorrow's), each with its Date. A train stays
 *  "next" until two minutes after its posted time. `direction` limits to one direction. */
export function nextTrains(tr, { n = 8, direction, now = new Date() } = {}) {
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
  const list = tr.trains.filter((t) => !direction || t.direction === direction);
  return [today, tomorrow].flatMap((day) => list.map((t) => ({ ...t, at: at(day, t.time) })))
    .filter((t) => t.at.getTime() > now.getTime() - 2 * MIN).slice(0, n);
}

/** Changes whenever the next train changes, so the home screen knows when to redraw. */
export const nextKey = (tr) => nextTrains(tr, { n: 1 }).map((t) => `${t.number}@${t.at.getDate()}`).join();

/** "Boarding now", "in 25 min", "in 2 hr 10 min", "tomorrow" */
export function countdown(when, now = new Date(), short = false) {
  const mins = Math.round((when.getTime() - now.getTime()) / MIN);
  if (mins <= 1) return "Due now";
  if (when.getDate() !== now.getDate()) return "Tomorrow";
  if (mins < 60) return short ? `${mins}m` : `in ${mins} min`;
  const hrs = Math.floor(mins / 60), rest = mins % 60;
  return short ? `${hrs}h${rest ? ` ${rest}m` : ""}` : `in ${hrs} hr${rest ? ` ${rest} min` : ""}`;
}

/** A countdown that keeps itself current (see tick()). */
const due = (t, cls = "tr-due", short = false) => h("span", { class: cls, "data-due": String(t.at.getTime()), "data-short": short ? "1" : null }, countdown(t.at, new Date(), short));

/** Refresh every live countdown on the page; returns nothing. Called on a timer from main.js. */
export function tick() {
  const now = new Date();
  document.querySelectorAll("[data-due]").forEach((el) => { el.textContent = countdown(new Date(Number(el.dataset.due)), now, el.dataset.short === "1"); });
}

const dirLabel = (t) => `to ${t.to}`;
const arrow = (t) => h("span", { class: `tr-dir ${t.direction}`, title: t.direction === "southbound" ? "Southbound" : "Northbound", "aria-label": t.direction === "southbound" ? "Southbound" : "Northbound" },
  t.direction === "southbound" ? "S" : "N");

export function trainRow(tr, t, { compact = false, live = true, short = false } = {}) {
  return h("li", { class: `tr-row${compact ? " compact" : ""}` },
    h("b", { class: "tr-time" }, fmtTime(t.time)),
    h("span", { class: "tr-what" }, arrow(t), h("span", { class: "tr-to" }, h("span", { class: "tr-to-word" }, "to "), t.to), h("small", {}, ` #${t.number} ${t.service}`)),
    live && t.at ? due(t, "tr-due", short) : null);
}

/** Station building: open now? (The posted hours apply every day.) */
export function stationStatus(tr, now = new Date()) {
  const s = tr.station;
  if (!s.open) return null;
  const hm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const open = hm >= s.open && hm < s.close;
  return h("div", { class: "lib-status tr-status" }, h("span", {}, h("i", { class: open ? "on" : "off", "aria-hidden": "true" }),
    open ? `Station open until ${fmtTime(s.close)}` : `Station closed · opens ${fmtTime(s.open)}`));
}

export function ticketButton(tr, { compact = false } = {}) {
  return h("a", { class: `btn-primary tr-btn${compact ? " compact" : ""}`, href: tr.links.tickets, target: "_blank", rel: "noopener" }, "🎟️ Tickets ↗");
}

export function trackButton(tr, { compact = false } = {}) {
  return h("a", { class: `pill-btn tr-btn${compact ? " compact" : ""}`, href: tr.links.track, target: "_blank", rel: "noopener" }, "📍 Track your train ↗");
}

export function phoneButton(tr, { compact = false } = {}) {
  return h("a", { class: `pill-btn tr-btn${compact ? " compact" : ""}`, href: tel(tr.phones.info_digits), "aria-label": `Call NC By Train, ${tr.phones.info}` }, `📞 ${tr.phones.info}`);
}

export function logo(tr, size = "sm") {
  return tr.logo ? h("span", { class: `tr-logo ${size}` }, h("img", { src: tr.logo, alt: "NC By Train logo" })) : null;
}

/** The big "next train" block: time, where it's going, countdown. */
export function nextCard(tr, t, { compact = false, short = false, service = true } = {}) {
  if (!t) return null;
  return h("div", { class: `tr-next${compact ? " compact" : ""}` },
    h("div", { class: "bb-next-label" }, "Next train"),
    h("div", { class: "tr-next-time" }, fmtTime(t.time), " ", due(t, "tr-next-due")),
    h("div", { class: "tr-next-what" }, arrow(t), ` ${short ? "" : `${t.direction === "southbound" ? "Southbound" : "Northbound"} `}to ${t.to}${short || !service ? "" : ` · #${t.number} ${t.service}`}`));
}

function dayColumn(tr, direction, now) {
  const list = tr.trains.filter((t) => t.direction === direction);
  const next = nextTrains(tr, { n: 1, direction, now })[0];
  const towards = [...new Set(list.map((t) => t.to))].sort((a, b) => (a === "New York") - (b === "New York")).join(" & ");
  return h("section", { class: "card" },
    h("h3", {}, `${direction === "southbound" ? "Southbound" : "Northbound"} to ${towards}`),
    h("ul", { class: "tr-list", role: "list" }, list.map((t) => {
      const when = at(now, t.time);
      const gone = when.getTime() < now.getTime() - 2 * MIN;
      const isNext = next && next.number === t.number && next.at.getDate() === now.getDate();
      return h("li", { class: `tr-row${gone ? " gone" : ""}${isNext ? " next" : ""}` },
        h("b", { class: "tr-time" }, fmtTime(t.time)),
        h("span", { class: "tr-what" }, h("span", { class: "tr-to" }, `#${t.number} ${t.service}`), h("small", {}, ` ${t.route}`)),
        gone ? h("span", { class: "tr-due" }, "Departed") : h("span", { class: "tr-due", "data-due": String(when.getTime()) }, countdown(when, now)));
    })));
}

export function renderTrain(tr) {
  const root = document.getElementById("train-body");
  const now = new Date();
  const next = nextTrains(tr, { n: 1, now })[0];
  const s = tr.station;
  const svc = (name) => tr.station_services.find((x) => x.name === name);
  const ticketing = svc("Ticketing");
  const longDate = (d) => new Date(`${d}T12:00`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const routeDates = Object.entries(tr.routes || {}).filter(([, r]) => r.modified).map(([name, r]) => `${name} ${longDate(r.modified)}`).join(", ");
  const differs = (tr.station_page_differs || []).filter((d) => d.station_page && d.route_page);

  fill(root, 
    h("section", { class: "card tr-hero" },
      tr.photo ? h("figure", { class: "tr-photo" }, h("img", { src: tr.photo, alt: "Kannapolis Station, with a Piedmont locomotive at the platform", loading: "lazy" })) : null,
      h("div", { class: "tr-hero-text" },
        h("div", { class: "tr-hero-top" }, nextCard(tr, next), logo(tr, "lg")),
        stationStatus(tr, now),
        h("div", { class: "tr-actions" }, ticketButton(tr), trackButton(tr),
          h("a", { class: "pill-btn tr-btn", href: tel(tr.phones.info_digits) }, `📞 ${tr.phones.info}`)),
        h("p", { class: "tile-meta" }, "Times are scheduled departures from Kannapolis. Running late? Track your train with Amtrak before you leave."))),

    h("div", { class: "grid" }, dayColumn(tr, "southbound", now), dayColumn(tr, "northbound", now)),

    h("div", { class: "grid" }, Object.entries(tr.services).map(([name, about]) => h("section", { class: "card ub-way" },
      h("h3", {}, `The ${name}`), h("p", { class: "gem-p" }, about, ` ${tr.trains.filter((t) => t.service === name).length} ${name} trains a day stop in Kannapolis.`),
      ext(tr.links[name.toLowerCase()], `Full ${name} schedule ↗`)))),

    h("div", { class: "grid" },
      h("section", { class: "card" }, h("h3", {}, "The station"),
        stationFacts(tr)),
      h("section", { class: "card" }, h("h3", {}, "Tickets"),
        ticketing ? h("ul", { class: "pk-rules" }, ticketing.items.map((x) => h("li", {}, ...[item(x)].flat()))) : null,
        h("p", { class: "tile-meta" }, `${tr.kids} `, ext(tr.links.kids, "Details ↗"), " · ", ext(tr.links.deals, "All deals ↗")))),

    h("div", { class: "grid" },
      h("section", { class: "card" }, h("h3", {}, "At the station"),
        h("dl", { class: "facts tr-facts" }, tr.station_services.filter((x) => x.name !== "Ticketing").flatMap((x) => [h("dt", {}, x.name), h("dd", {}, ...items(x.items))]))),
      h("section", { class: "card" }, h("h3", {}, "Getting to and from the station"),
        h("dl", { class: "facts tr-facts" }, tr.transport.flatMap((x) => [h("dt", {}, x.name), h("dd", {}, ...items(x.items))])))),

    h("div", { class: "pk-links" }, ext(tr.links.station, "Kannapolis station page ↗"), ext(tr.links.piedmont, "Piedmont schedule ↗"), ext(tr.links.carolinian, "Carolinian schedule ↗"),
      ext(tr.links.track, "Track your train (Amtrak) ↗"), ext(tr.links.baggage, "Baggage policy ↗"), ext(tr.links.amtrak_app, "Amtrak app ↗"), ext(tr.links.home, "NC By Train ↗")),
    differs.length ? h("p", { class: "note" }, `NC By Train's Kannapolis station page lists ${differs.map((d) => `#${d.number} at ${fmtTime(d.station_page)}`).join(" and ")}; the newer route schedules say ${differs.map((d) => fmtTime(d.route_page)).join(" and ")}, which is what this page shows.`) : null,
    h("p", { class: "note" }, `Departure times read daily from NC By Train's Piedmont and Carolinian schedules${routeDates ? ` (last changed ${routeDates})` : ""}; station hours, services, tickets and connections from its Kannapolis station page (N.C. Department of Transportation; read ${tr.generated}). Schedules can change without notice. ${tr.photo_credit ? `Photo: ${tr.photo_credit}.` : ""}`));
}

function stationFacts(tr) {
  const s = tr.station;
  return h("dl", { class: "facts tr-facts" }, [
    h("dt", {}, "Address"), h("dd", {}, ext(s.map, `${s.address} ↗`)),
    h("dt", {}, "Phone"), h("dd", {}, h("a", { href: tel(s.phone) }, s.phone)),
    ...(s.hours_text ? [h("dt", {}, "Building"), h("dd", {}, `Open ${s.hours_text}, every day`)] : []),
    ...(s.attendant ? [h("dt", {}, "Attendant"), h("dd", {}, s.attendant.replace(/^Station attendant is on duty/, "On duty"))] : []),
    ...(s.note ? [h("dt", {}, "Nearby"), h("dd", {}, s.note)] : []),
  ]);
}
