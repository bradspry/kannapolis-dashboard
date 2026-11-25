// Kannapolis Christmas Parade: date, a street map of the route, road closures and parking
// (data/generated/parade.json, from kannapolisnc.gov/christmasparade and the City's parade parking map).
import { h, fill } from "../ui.js";
import { makeMap, maplibregl } from "../maps.js";
import { snowfall } from "./parks.js";

export const ROUTE_COLOR = "#d62c2c", STAGING_COLOR = "#f0a020";
const ext = (href, label, cls) => h("a", { href, target: "_blank", rel: "noopener", class: cls }, label);
const day = (iso) => new Date(`${iso}T12:00`);
const localISO = (d) => d.toLocaleDateString("en-CA");
export const fmtTime = (t) => { const [hh, mm] = t.split(":").map(Number); return new Date(2000, 0, 1, hh, mm).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).replace(":00", ""); };
export const fmtDate = (iso, o = { weekday: "long", month: "long", day: "numeric" }) => day(iso).toLocaleDateString("en-US", o);

/** Where things stand: null outside show_from..parade night. Otherwise { days, tonight, over, label, short }. */
export function paradeStatus(p, now = new Date()) {
  const today = localISO(now);
  if (!p || today < p.show_from || today > p.date) return null;
  const days = Math.round((day(p.date) - day(today)) / 864e5), t = fmtTime(p.time);
  const [hh, mm] = p.time.split(":").map(Number), mins = now.getHours() * 60 + now.getMinutes(), start = hh * 60 + mm;
  if (days === 0 && mins >= start + 150) return null; // about two and a half hours after the start: over
  if (days === 0) return { days, tonight: true, label: mins >= start ? "Happening now" : `Tonight at ${t}`, short: mins >= start ? "Now" : "Tonight" };
  if (days === 1) return { days, label: `Tomorrow at ${t}`, short: "Tomorrow" };
  if (days < 7) return { days, label: `${fmtDate(p.date, { weekday: "long" })} at ${t}`, short: `In ${days} days` };
  return { days, label: `${fmtDate(p.date, { weekday: "short", month: "short", day: "numeric" })} · ${t}`, short: `In ${days} days` };
}

/** The route on a street map: the route in red with start and finish pins, Main Street's staging area in orange,
 *  and City Hall and the Gem Theatre. Drawn above the basemap's roads and labels so it stands out. */
export function paradeMap(box, p, { interactive = true, labels = true } = {}) {
  const pts = [...p.path, ...p.staging], lons = pts.map((q) => q[0]), lats = pts.map((q) => q[1]);
  makeMap(box, { interactive, attribution: interactive, bounds: [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]] }).then((map) => {
    if (typeof ResizeObserver === "function") new ResizeObserver(() => map.resize()).observe(box);
    map.resize();
    const line = (coordinates) => ({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates } });
    map.addSource("pr-staging", { type: "geojson", data: line(p.staging) });
    map.addLayer({ id: "pr-staging", type: "line", source: "pr-staging", paint: { "line-color": STAGING_COLOR, "line-width": 6, "line-opacity": 0.85 }, layout: { "line-cap": "round" } });
    map.addSource("pr-route", { type: "geojson", data: line(p.path) });
    map.addLayer({ id: "pr-route-case", type: "line", source: "pr-route", paint: { "line-color": "#ffffff", "line-width": 9 }, layout: { "line-cap": "round", "line-join": "round" } });
    map.addLayer({ id: "pr-route", type: "line", source: "pr-route", paint: { "line-color": ROUTE_COLOR, "line-width": 6 }, layout: { "line-cap": "round", "line-join": "round" } });
    for (const pin of p.pins) {
      const show = labels || pin.kind !== "place";
      const el = h("div", { class: `pr-pin ${pin.kind}` }, h("i", {}, pin.kind === "start" ? "▶" : pin.kind === "end" ? "■" : ""), show ? h("span", {}, pin.name) : null);
      const m = new maplibregl.Marker({ element: el, anchor: show ? "left" : "center", offset: show ? [-9, 0] : [0, 0] }).setLngLat([pin.lon, pin.lat]);
      if (interactive) m.setPopup(new maplibregl.Popup({ offset: 12 }).setText(`${pin.name}: ${pin.detail}`));
      m.addTo(map);
    }
  });
}

/** The map for the medium, large and extra-large tiles: no zooming or popups, so a tap opens the window. */
export function tileParadeMap(p, id, { labels = true } = {}) {
  const box = h("div", { class: "map pr-tilemap", id, role: "img", "aria-label": `Map of the Christmas Parade route: ${p.route_text}` });
  box.append(h("span", { class: "wl-credit" }, "© OpenFreeMap © OpenStreetMap"));
  const go = (tries) => (box.isConnected ? paradeMap(box, p, { interactive: false, labels }) : tries && requestAnimationFrame(() => go(tries - 1)));
  requestAnimationFrame(() => go(120)); // once os.js has put the tile on the page
  return box;
}

/** Road closures, earliest first: "6 AM  West Avenue closes…". */
export const closureList = (p, n = p.closures.length, { compact = false } = {}) =>
  h("ul", { class: `pr-closures${compact ? " compact" : ""}`, role: "list" }, p.closures.slice(0, n).map((c) =>
    h("li", {}, h("b", {}, fmtTime(c.time)), h("span", {}, compact ? c.what.split(":")[0].split(". ")[0] : c.what))));

export const legend = () => h("div", { class: "pr-legend", "aria-hidden": "true" },
  h("span", {}, h("i", { class: "route" }), "Parade route"), h("span", {}, h("i", { class: "staging" }), "Staging (Main Street)"));

export function renderParade(p) {
  const root = document.getElementById("parade-body");
  const st = paradeStatus(p);
  const mapBox = h("div", { class: "map pr-live", id: "pr-live-map", role: "img", "aria-label": `Map of the Christmas Parade route: ${p.route_text}` });
  fill(root,
    h("section", { class: "card pr-hero" }, snowfall(34, { big: true }),
      h("div", {}, h("div", { class: "bb-next-label" }, st ? (st.days >= 7 ? st.short : st.label) : "Parade"),
        h("div", { class: "pr-when" }, fmtDate(p.date), " · ", fmtTime(p.time)),
        h("p", {}, p.summary)),
      h("div", { class: "pr-actions" }, ext(p.links.page, "Parade page ↗", "btn-primary"), h("a", { href: `tel:${p.phone.replace(/\D/g, "")}`, class: "pr-phone" }, `☎ ${p.phone}`))),
    h("section", { class: "card" }, h("h3", {}, "The route"), h("p", {}, p.route_text), mapBox, legend(),
      h("p", { class: "tile-meta" }, `About ${routeMiles(p).toFixed(1)} miles. `, p.path_source)),
    h("div", { class: "pr-two" },
      h("section", { class: "card" }, h("h3", {}, `Road closures on ${fmtDate(p.date, { month: "long", day: "numeric" })}`), closureList(p), h("p", { class: "tile-meta" }, p.reopen)),
      h("section", { class: "card" }, h("h3", {}, "Parking"),
        h("ul", { class: "pr-parking", role: "list" }, p.parking.map((x) => h("li", { class: x.kind }, h("i", { "aria-hidden": "true" }), h("div", {}, h("b", {}, x.label), h("span", {}, x.where))))),
        h("p", {}, ext(p.links.map, "The City's parking map (restrooms, first aid, food vendors) ↗")))),
    h("section", { class: "card" }, h("h3", {}, "Watching"), h("p", {}, p.viewing), h("p", {}, p.amenities)),
    h("section", { class: "card" }, h("h3", {}, "In the parade"),
      h("p", {}, p.awards, " "), h("div", { class: "pr-links" }, ext(p.links.apply, "Parade application ↗"), ext(p.links.rules, "Rules and regulations (PDF) ↗"), ext(p.links.safety, "Safety guidelines (PDF) ↗"))),
    h("p", { class: "note" }, "From the City's ", ext(p.links.page, "Christmas Parade page"), " and its parade parking map. ",
      "The route is drawn on OpenStreetMap's street lines along the City's map. Plans can change for weather: call ", p.phone, "."));
  paradeMap(mapBox, p);
}

/** Route length in miles. */
export function routeMiles(p) {
  const R = 3958.8, rad = Math.PI / 180;
  let m = 0;
  for (let i = 1; i < p.path.length; i++) {
    const [a, b] = [p.path[i - 1], p.path[i]];
    const dLat = (b[1] - a[1]) * rad, dLon = (b[0] - a[0]) * rad;
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLon / 2) ** 2;
    m += 2 * R * Math.asin(Math.sqrt(x));
  }
  return m;
}
