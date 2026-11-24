// Transportation: nonstop flights from Concord-Padgett Regional Airport (USA), the closest airport to
// Kannapolis with airline service. Routes from bradspry/kannapolis-travel (the airport's own list);
// the tile's route map is drawn in SVG over Natural Earth land and U.S. state lines.
import { h, fill } from "../ui.js";
import { makeMap, maplibregl } from "../maps.js";

const NS = "http://www.w3.org/2000/svg";
const svgEl = (tag, attrs = {}) => { const el = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, v); return el; };
const tel = (n) => `tel:${n.replace(/[^0-9]/g, "")}`;
const ext = (href, label, cls) => h("a", { href, target: "_blank", rel: "noopener", class: cls }, label);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

export const airlineOf = (F, f) => F.airlines[f.airline];
/** The destination as the airport's page names it ("St. Pete–Clearwater"), else OurAirports' city. */
export const cityName = (f) => f.name || f.city.replace(/, [A-Z]{2}$/, "");
const newOnes = (F) => F.flights.filter((f) => f.new);

/** Route map (SVG): land, state lines, a great-circle arc per route in its airline's color (dashed if new).
 *  mainland: frame only the continental routes (San Juan's arc runs off the edge, with a label there). */
export function routeMap(F, { cls = "", labels = false, mainland = false, aspect = null } = {}) {
  const far = (f) => mainland && f.miles > 1000;
  const inFrame = F.flights.filter((f) => !far(f));
  const pad = mainland ? 1.2 : 1.6;
  const xs = [F.origin.lon, ...inFrame.map((f) => f.lon)], ys = [F.origin.lat, ...inFrame.map((f) => f.lat)];
  let x0 = Math.min(...xs) - pad, x1 = Math.max(...xs) + pad;
  const y0 = Math.min(...ys) - pad, y1 = Math.max(...ys) + pad;
  const k = Math.cos(((y0 + y1) / 2) * Math.PI / 180);
  if (aspect) { const want = (aspect * (y1 - y0)) / k, c = (x0 + x1) / 2; if (want > x1 - x0) { x0 = c - want / 2; x1 = c + want / 2; } }
  const H = 1000, W = Math.round((H * (x1 - x0) * k) / (y1 - y0)), s = H / (y1 - y0);
  const pt = ([x, y]) => [(x - x0) * k * s, H - (y - y0) * s];
  const path = (line, close) => `M${line.map((p) => pt(p).map((v) => v.toFixed(1)).join(",")).join("L")}${close ? "Z" : ""}`;
  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, class: `fl-map-svg ${cls}`, role: "img", preserveAspectRatio: "xMidYMid meet",
    "aria-label": `Map of ${F.flights.length} nonstop flights from Concord-Padgett Regional Airport: ${F.flights.map((f) => `${cityName(f)} (${f.code})`).join(", ")}` });
  svg.append(svgEl("path", { class: "fl-land", d: F.land.map((r) => path(r, true)).join("") }));
  svg.append(svgEl("path", { class: "fl-states", d: F.states.map((r) => path(r, true)).join("") }));
  for (const f of [...F.flights].sort((a, b) => a.new - b.new)) {
    svg.append(svgEl("path", { class: `fl-arc${f.new ? " new" : ""}`, d: path(f.arc), stroke: airlineOf(F, f).color }));
  }
  // Labels: farthest first, skipping any that would overlap one already placed (Florida is crowded; the list names them all).
  const placed = [], fs = 34;
  const label = (text, x, y, anchor = "start") => {
    const w = text.length * fs * 0.62, bx = anchor === "end" ? x - w : x, box = [bx, y - fs, bx + w, y + 4];
    if (placed.some((b) => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1])) return;
    placed.push(box);
    const t = svgEl("text", { class: "fl-code", x: x.toFixed(1), y: y.toFixed(1), "text-anchor": anchor }); t.textContent = text; svg.append(t);
  };
  const [ox, oy] = pt([F.origin.lon, F.origin.lat]);
  const shown = F.flights.filter((f) => !far(f)).map((f) => ({ f, xy: pt([f.lon, f.lat]) }));
  // Every dot (and the origin) blocks labels, so a code never sits on another airport's dot.
  placed.push([ox - 22, oy - 22, ox + 22, oy + 22], ...shown.map(({ xy: [x, y] }) => [x - 13, y - 13, x + 13, y + 13]));
  svg.append(...shown.map(({ f, xy: [x, y] }) => svgEl("circle", { class: "fl-dest", cx: x.toFixed(1), cy: y.toFixed(1), r: 12, fill: airlineOf(F, f).color })),
    svgEl("circle", { class: "fl-origin", cx: ox.toFixed(1), cy: oy.toFixed(1), r: 18 }));
  if (labels) {
    for (const { f, xy: [x, y] } of [...shown].sort((a, b) => b.f.miles - a.f.miles)) {
      const right = x + 18 + f.code.length * fs * 0.62 > W - 4;
      label(f.code, right ? x - 18 : x + 18, y + 12, right ? "end" : "start");
    }
    for (const f of F.flights.filter(far)) { // where its arc leaves the frame
      const exit = f.arc.map(pt).find(([x, y]) => x > W - 6 || y > H - 6 || x < 6 || y < 6);
      if (exit) label(`${f.code} →`, Math.min(exit[0], W - 8), Math.min(exit[1], H - 10), "end");
    }
  }
  return h("div", { class: `fl-map-box ${cls}`, style: { "--ar": `${W} / ${H}` } }, svg);
}

export function airlineLegend(F, { compact = false } = {}) {
  return h("ul", { class: `tr-legend${compact ? " compact" : ""}`, role: "list" },
    Object.entries(F.airlines).map(([name, a]) => h("li", {}, h("i", { style: { background: a.color }, "aria-hidden": "true" }),
      `${a.short} ${F.flights.filter((f) => f.airline === name).length}`)),
    newOnes(F).length ? h("li", {}, h("i", { class: "fl-dash", "aria-hidden": "true" }), "new") : null);
}

/** "New: Orlando (MCO), Tampa, Fort Myers · November 2026" */
export function newLine(F, cls = "tile-meta") {
  const n = newOnes(F);
  if (!n.length) return null;
  const since = [...new Set(n.map((f) => f.since))].join(", ");
  return h("p", { class: cls }, h("b", {}, "New "), `${since}: ${n.map((f) => `${cityName(f)} (${f.code})`).join(", ")}`);
}

/** Compact destination list for tiles: city (code), airline dot. */
export function destList(F, { n = Infinity, cols = 1 } = {}) {
  return h("ul", { class: `fl-dests${cols > 1 ? " cols" : ""}`, role: "list" }, F.flights.slice(0, n).map((f) =>
    h("li", {}, h("i", { style: { background: airlineOf(F, f).color }, "aria-hidden": "true" }), `${cityName(f)} `, h("small", {}, f.code), f.new ? h("em", { class: "fl-new" }, "new") : null)));
}

// ---------- window ----------
export function renderFlights(F) {
  const root = document.getElementById("flights-body"), A = F.airport;
  const mapBox = h("div", { class: "map tr-map fl-map", id: "flights-map" });
  const dirs = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(A.terminal)}`;
  const byAirline = Object.entries(F.airlines).map(([name, a]) => {
    const list = F.flights.filter((f) => f.airline === name);
    return h("section", { class: "card fl-airline", style: { borderTopColor: a.color } },
      h("div", { class: "fl-air-head" }, h("h3", {}, name), h("span", { class: "tile-meta" }, `${list.length} nonstop${list.length === 1 ? "" : "s"}`)),
      h("ul", { class: "fl-rows", role: "list" }, list.map((f) => h("li", {},
        h("b", {}, f.code),
        h("span", {}, cityName(f), h("small", {}, f.airport)),
        h("span", { class: "fl-mi" }, `${f.miles.toLocaleString()} mi`, f.new ? h("em", { class: "fl-new" }, `new · ${f.since}`) : null)))),
      h("div", { class: "tr-actions" }, ext(a.site, `Book on ${a.short} ↗`, "btn-primary tr-btn"),
        h("a", { class: "pill-btn tr-btn", href: tel(a.phone), "aria-label": `Call ${name}: ${a.phone}` }, `📞 ${a.phone}`)));
  });
  const p = A.parking;
  fill(root,
    h("section", { class: "card tr-hero-card fl-hero" },
      h("div", { class: "fl-badge", "aria-hidden": "true" }, A.code),
      h("div", { class: "tr-hero-body" },
        h("p", { class: "tr-status big" }, `${F.flights.length} nonstop destinations on ${Object.keys(F.airlines).length} airlines`),
        h("p", { class: "gem-p" }, `${A.name} is about ${Math.round(milesFromKannapolis(F))} miles southwest of downtown Kannapolis (straight line). Arrive at least ${A.arrive_hours} hours before your flight.`),
        h("p", { class: "gem-p" }, h("b", {}, "Terminal: "), A.terminal, ". ", A.terminal_note),
        h("div", { class: "tr-actions" }, ext(dirs, "Directions to the terminal ↗", "btn-primary tr-btn"), ext(A.links.parking, "Parking ↗", "pill-btn tr-btn"),
          h("a", { class: "pill-btn tr-btn", href: tel(A.phone), "aria-label": `Call the airport: ${A.phone}` }, `📞 Airport ${A.phone}`)))),
    h("section", { class: "card" }, h("h3", {}, "Route map"), airlineLegend(F), mapBox,
      h("p", { class: "tile-meta" }, "Lines are great-circle routes, the way planes fly; dashed lines are routes the airport lists as new. Click an airport for details.")),
    newLine(F, "gem-p fl-new-line"),
    h("div", { class: "grid fl-grid" }, ...byAirline),
    h("div", { class: "grid fl-grid" },
      h("section", { class: "card" }, h("h3", {}, "Parking"), h("p", { class: "tr-fare" }, h("b", {}, p.rate), " on both deck levels and the overflow lot"),
        h("ul", { class: "fl-facts" }, h("li", {}, p.free), h("li", {}, p.where), h("li", {}, p.pay), h("li", {}, p.overflow))),
      h("section", { class: "card" }, h("h3", {}, "Charter flights"), h("p", { class: "gem-p" }, F.charter.text),
        h("div", { class: "tr-actions" }, ext(F.charter.url, "Caesars Rewards Air ↗", "pill-btn tr-btn"),
          h("a", { class: "pill-btn tr-btn", href: tel(F.charter.phone), "aria-label": `Call Caesars Rewards Air: ${F.charter.phone}` }, `📞 ${F.charter.phone}`)),
        h("p", { class: "tile-meta" }, `Phone ${F.charter.phone_hours}.`))),
    h("div", { class: "pk-links" }, ext(A.links.airlines, "Airport: airlines and routes ↗"), ext(A.links.directions, "Driving directions ↗"), ext(A.links.home, "concordairportnc.com ↗")),
    h("p", { class: "note" }, `Routes from the airport's Airlines page (read ${fmtDay(F.fetched["Concord-Padgett Regional Airport"]?.fetched)}) via kannapolis-travel; airport locations from OurAirports. Avelo and Allegiant block automated requests, so their schedules aren't read here: check the airline before you book, since routes can be seasonal. Map outline from Natural Earth and the U.S. Census Bureau.`));

  const pts = [[F.origin.lon, F.origin.lat], ...F.flights.map((f) => [f.lon, f.lat])];
  makeMap(mapBox, { bounds: [[Math.min(...pts.map((c) => c[0])) - 1.5, Math.min(...pts.map((c) => c[1])) - 1.5], [Math.max(...pts.map((c) => c[0])) + 1.5, Math.max(...pts.map((c) => c[1])) + 1.5]] }).then((map) => {
    const feats = F.flights.map((f) => ({ type: "Feature", properties: { color: airlineOf(F, f).color, isNew: f.new }, geometry: { type: "LineString", coordinates: f.arc } }));
    map.addSource("arcs", { type: "geojson", data: { type: "FeatureCollection", features: feats } });
    map.addLayer({ id: "arcs", type: "line", source: "arcs", filter: ["!", ["get", "isNew"]], paint: { "line-color": ["get", "color"], "line-width": 2.5, "line-opacity": 0.85 }, layout: { "line-cap": "round" } });
    map.addLayer({ id: "arcs-new", type: "line", source: "arcs", filter: ["get", "isNew"], paint: { "line-color": ["get", "color"], "line-width": 2.5, "line-dasharray": [2, 1.5] } });
    for (const f of F.flights) {
      const a = airlineOf(F, f);
      new maplibregl.Marker({ element: h("div", { class: "fl-marker", style: { background: a.color }, title: `${cityName(f)} (${f.code})` }) }).setLngLat([f.lon, f.lat])
        .setPopup(new maplibregl.Popup({ offset: 10 }).setHTML(`<b>${esc(cityName(f))} (${esc(f.code)})</b><br>${esc(f.airport)}<br>${esc(f.airline)} · ${f.miles.toLocaleString()} miles${f.new ? `<br><em>New route (${esc(f.since)})</em>` : ""}<br><a href="${esc(a.site)}" target="_blank" rel="noopener">Book on ${esc(a.short)} ↗</a>`)).addTo(map);
    }
    new maplibregl.Marker({ element: h("div", { class: "fl-marker origin", title: A.name }, "✈") }).setLngLat([F.origin.lon, F.origin.lat])
      .setPopup(new maplibregl.Popup({ offset: 14 }).setHTML(`<b>${esc(A.name)} (${esc(A.code)})</b><br>Terminal: ${esc(A.terminal)}`)).addTo(map);
  });
}

// Downtown Kannapolis (the Amtrak station, from kannapolis-travel's data) to the airport, straight line.
const KANNAPOLIS = [-80.624928, 35.496172];
function milesFromKannapolis(F) {
  const r = Math.PI / 180, [lo1, la1] = KANNAPOLIS, { lon: lo2, lat: la2 } = F.origin;
  const a = Math.sin(((la2 - la1) * r) / 2) ** 2 + Math.cos(la1 * r) * Math.cos(la2 * r) * Math.sin(((lo2 - lo1) * r) / 2) ** 2;
  return 2 * 3958.8 * Math.asin(Math.sqrt(a));
}
const fmtDay = (iso) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "weekly");
