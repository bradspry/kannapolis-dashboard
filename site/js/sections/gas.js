// Gas Prices (Transportation tab): bradspry/kannapolis-gas's "Friday Fill-up", read daily. The cheapest regular
// and diesel near Kannapolis (GasBuddy, plus stations read from their own sites), ranked by posted price
// (like gas_prices.py --no-rewards), and aviation fuel at Concord-Padgett and Mid-Carolina Regional (AirNav).
import { shareBar } from "../share.js";
import { h, fill } from "../ui.js";
import { miniMap } from "../minimap.js";

const ext = (href, label, cls) => h("a", { href, target: "_blank", rel: "noopener", class: cls }, label);
export const usd = (v) => `$${v.toFixed(2)}`;
const cents = (v) => `${Math.round(v * 100)}¢`;
const parseDay = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
export const dayText = (s, o = { month: "short", day: "numeric" }) => parseDay(s).toLocaleDateString("en-US", o);
const short = (a) => a.replace(/^\d+\s+/, "");
export const GAS_COLOR = "#e8562a";

export function ago(iso, now = Date.now()) {
  if (!iso) return null;
  const m = Math.round((now - new Date(iso)) / 60000);
  return m < 60 ? `${Math.max(1, m)} min ago` : m < 48 * 60 ? `${Math.round(m / 60)} hr ago` : `${Math.round(m / 1440)} days ago`;
}

export const cheapest = (g, grade = "regular") => g.grades[grade]?.stations[0];

/** "▼ 3¢ since Nov 17" (prices: down is good news, so no red/green, just the arrow and words). */
export function trendText(t) {
  if (!t) return null;
  if (t.direction === "steady") return `Steady since ${dayText(t.since)}`;
  return `${t.direction === "up" ? "▲ Up" : "▼ Down"} ${cents(Math.abs(t.delta))} since ${dayText(t.since)}`;
}

/** Big price for one station: posted price and station. */
export function bigPrice(s, { label = "Regular", compact = false } = {}) {
  return h("div", { class: `gs-big${compact ? " compact" : ""}` },
    h("div", { class: "bb-next-label" }, `Cheapest ${label.toLowerCase()}`),
    h("div", { class: "gs-price" }, h("b", {}, usd(s.price)), h("small", {}, "/gal")),
    h("div", { class: "gs-where" }, h("b", {}, s.name), " · ", short(s.address)));
}

/** Ranked list rows: posted price, station, street. */
export function list(stations, n, { from = 0, numbered = true } = {}) {
  return h("ol", { class: "gs-list", start: from + 1 }, stations.slice(from, from + n).map((s, i) =>
    h("li", {}, numbered ? h("span", { class: "gs-n" }, from + i + 1) : null, h("b", { class: "gs-p" }, usd(s.price)),
      h("span", { class: "gs-name" }, s.name, h("small", {}, short(s.address))))));
}

/** Aviation rows: price, airport, fuel and service. */
export function avList(g, n) {
  return h("ul", { class: "gs-list av", role: "list" }, g.aviation.slice(0, n).map((a) =>
    h("li", {}, h("b", { class: "gs-p" }, usd(a.price)), h("span", { class: "gs-name" }, a.fuel, h("small", {}, `${a.code} · ${a.service}`)))));
}

export function areaLine(g) {
  const nc = g.area?.["North Carolina"], us = g.area?.["United States"];
  return nc ? h("p", { class: "tile-meta" }, `NC average ${usd(nc.average_price)}${us ? ` · U.S. ${usd(us.average_price)}` : ""}`) : null;
}

/** Map of the ranked regular stations, numbered, with the city limits. */
export function stationMap(g, boundaries, { cls = "", grade = "regular", n = 10, aspect = 0.8 } = {}) {
  const st = g.grades[grade].stations.slice(0, n).filter((s) => s.lat != null);
  // Framed on the stations (with a margin), not the whole city: they sit close together along I-85.
  const lons = st.map((s) => s.lon), lats = st.map((s) => s.lat), m = 0.012;
  const fit = [[Math.min(...lons) - m, Math.min(...lats) - m], [Math.max(...lons) + m, Math.max(...lats) + m]];
  return miniMap({ boundaries, fit, aspect, pad: 0.04, cls: `gs-map ${cls}`, label: `Map of the ${st.length} cheapest ${grade} stations near Kannapolis, numbered by price`,
    points: st.map((s, i) => ({ lon: s.lon, lat: s.lat, r: i ? 30 : 38, num: i + 1, fill: i ? "var(--gs-dot)" : GAS_COLOR, cls: i ? "" : "best",
      title: `${i + 1}. ${s.name}, ${s.address}: ${usd(s.price)}` })).reverse() });
}

function table(stations, grade) {
  return h("div", { class: "table-wrap" }, h("table", { class: "gs-table" },
    h("thead", {}, h("tr", {}, ["#", "Price", "Station", "Reported"].map((x, i) => h("th", { scope: "col", class: i === 1 ? "num" : null }, x)))),
    h("tbody", {}, stations.map((s, i) => h("tr", {},
      h("td", {}, i + 1), h("td", { class: "num" }, h("b", {}, usd(s.price))),
      h("td", {}, ext(s.url, s.name), h("small", { class: "gs-addr" }, `${s.address}${s.city ? `, ${s.city}` : ""}`)),
      h("td", {}, s.updated ? ago(s.updated) : "from its own site"))))),
    h("p", { class: "tile-meta" }, `${grade} ranked by posted price.`));
}

/** A notice in force now (data/manual/gas.json notices): the NC gas tax suspension, with days left. */
export function activeNotice(g, now = new Date()) {
  const today = now.toLocaleDateString("en-CA");
  const n = (g.notices || []).find((x) => today >= (x.show_from || "") && today <= x.until);
  if (!n) return null;
  const days = Math.round((new Date(`${n.until}T12:00`) - new Date(`${today}T12:00`)) / 864e5);
  return { ...n, days, left: days === 0 ? "ends today" : days === 1 ? "ends tomorrow" : `${days} days left` };
}
export function noticeLine(g, { compact = false } = {}) {
  const n = activeNotice(g);
  return n ? h("p", { class: `gs-notice${compact ? " compact" : ""}` }, h("b", {}, "⚠ ", n.short), h("span", {}, ` · ${n.left}`)) : null;
}

export function renderGas(g, boundaries) {
  const root = document.getElementById("gas-body");
  const reg = g.grades.regular, dsl = g.grades.diesel;
  const stale = Object.values(g.grades).find((x) => x.stale);
  fill(root,
    h("div", { class: "share-row" }, h("span", { class: "share-label" }, "Share today's prices"),
      shareBar("gas", { title: `Gas in Kannapolis: $${reg.stations[0].price.toFixed(2)} at ${reg.stations[0].name}`, text: "Today's cheapest gas in Kannapolis" })),
    stale ? h("p", { class: "note" }, `GasBuddy didn't answer this morning; these are the prices from ${dayText(stale.checked, { month: "long", day: "numeric" })}.`) : null,
    (() => { const n = activeNotice(g); return n ? h("section", { class: "card gs-notice-card" }, h("h3", {}, `⚠ ${n.title}`, h("span", { class: "gs-notice-left" }, ` · ${n.left}`)),
      h("p", {}, n.detail), h("p", { class: "tile-meta" }, n.note), h("p", {}, h("a", { href: n.url, target: "_blank", rel: "noopener" }, n.link_label))) : null; })(),
    h("section", { class: "card gs-hero" },
      h("div", { class: "gs-hero-grid" },
        h("div", {}, bigPrice(reg.stations[0]), h("p", { class: "tile-meta" }, trendText(reg.trend) || "Week-over-week trend starts after a week of readings."), areaLine(g)),
        dsl?.stations.length ? h("div", {}, bigPrice(dsl.stations[0], { label: "Diesel" }), h("p", { class: "tile-meta" }, trendText(dsl.trend) || "")) : null,
        g.aviation.length ? h("div", {}, h("div", { class: "bb-next-label" }, "Cheapest aviation fuel"),
          h("div", { class: "gs-price" }, h("b", {}, usd(g.aviation[0].price)), h("small", {}, "/gal")),
          h("div", { class: "gs-where" }, h("b", {}, g.aviation[0].fuel), " · ", g.aviation[0].airport_name || g.aviation[0].airport),
          h("div", { class: "tile-meta" }, g.aviation[0].service)) : null)),
    h("section", { class: "card" }, h("h3", {}, `Regular · the ${reg.stations.length} cheapest`), h("div", { class: "gs-two" }, stationMap(g, boundaries), table(reg.stations, "Regular"))),
    dsl?.stations.length ? h("section", { class: "card" }, h("h3", {}, "Diesel"), table(dsl.stations, "Diesel")) : null,
    g.aviation.length ? h("section", { class: "card" }, h("h3", {}, "Aviation fuel"),
      h("div", { class: "table-wrap" }, h("table", { class: "gs-table" },
        h("thead", {}, h("tr", {}, ["Price", "Fuel", "Service", "Airport"].map((x, i) => h("th", { scope: "col", class: i === 0 ? "num" : null }, x)))),
        h("tbody", {}, g.aviation.map((a) => h("tr", {}, h("td", { class: "num" }, h("b", {}, usd(a.price))), h("td", {}, a.fuel), h("td", {}, a.service),
          h("td", {}, ext(a.url, `${a.airport_name || a.airport} (${a.code})`))))))),
      h("p", { class: "tile-meta" }, "Posted by each airport's fuel business (FBO) on AirNav.")) : null,
    h("p", { class: "note" }, g.note, " Rules and stations from Brad Spry's ", ext(g.repo, "kannapolis-gas"),
      ` (gas_prices.py): ZIP ${g.zips.join(", ")}, read daily. Sources: GasBuddy, Dash In's own site, AirNav.`));
}
