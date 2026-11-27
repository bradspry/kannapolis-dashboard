// Stormwater & Flooding (City tab): flood alerts and rain from the National Weather Service (the page's live
// weather), stream flow (water.json, daily), FEMA flood zones on a map (data/generated/geo/floodzones.json,
// loaded only when a map is shown), how to report a problem, the stormwater fee, and how to keep runoff clean.
// From data/manual/stormwater.json (etl/build_stormwater.py). Address lookups go to the State's FRIS site.
import { h, fill, contactButtons } from "../ui.js";
import { makeMap, firstLabelLayer } from "../maps.js";
import { weather } from "../weather.js";
import { streamRows } from "./water.js";

export const STORM_COLOR = "#1f8a8a";
const ext = (href, label, cls) => h("a", { href, target: "_blank", rel: "noopener", class: cls }, label);
const tel = (n) => `tel:${n.replace(/\D/g, "")}`;
const ZONE = { floodway: { color: "#0d3f78", opacity: 0.62, label: "Floodway" }, 100: { color: "#2a78d6", opacity: 0.42, label: "100-year floodplain" },
  500: { color: "#7fb7ee", opacity: 0.34, label: "500-year floodplain" } };

/** A flood watch or warning in effect now (National Weather Service), if any. */
export const floodAlert = () => weather()?.alerts?.find((a) => /flood/i.test(a.event)) || null;

/** One line on what the sky is doing: a flood alert, rain likely today, or all clear. */
export function rainStatus({ compact = false } = {}) {
  const a = floodAlert(), today = weather()?.days?.[0];
  if (a) {
    const until = a.ends ? ` until ${a.ends.toLocaleString("en-US", { weekday: "short", hour: "numeric", ...(a.ends.getMinutes() ? { minute: "2-digit" } : {}) })}` : "";
    return h("div", { class: "sw-status alert" }, h("b", {}, `⚠️ ${a.event}${until}`), compact ? null : h("span", {}, "Never drive through flooded roads: turn around, don't drown."));
  }
  if (today?.pop >= 50) return h("div", { class: "sw-status rain" }, h("b", {}, `🌧️ ${today.pop}% chance of rain ${today.name === "Tonight" ? "tonight" : "today"}`),
    compact ? null : h("span", {}, "Clear leaves from the storm drain near you so water can get in."));
  return h("div", { class: "sw-status" }, h("b", {}, "✓ No flood alerts"), compact ? null : h("span", {}, weather() ? "National Weather Service, live" : "Checking the National Weather Service…"));
}

/** When the weather updates, swap in a fresh alert/rain line instead of redrawing the window (and its map). */
export function refreshRainStatus() {
  document.querySelectorAll("#stormwater-body .sw-status").forEach((el) => el.replaceWith(rainStatus()));
}

export const reportButton = (sw, { compact = false, label = "Report a problem" } = {}) =>
  h("a", { class: `btn-primary el-call${compact ? " compact" : ""}`, href: tel(sw.phone) }, `📞 ${label}`);
export const frisButton = (sw, { compact = false } = {}) => ext(sw.flood.fris, "🏠 Is my address in a flood zone? ↗", `pill-btn el-shop-2${compact ? " compact" : ""}`);

/** Stream flow from the gauges Lakes & Rivers reads (USGS), with a line explaining the ranks. */
export const creeks = (water) => (water?.streams?.length ? streamRows(water) : null);

let zonesPromise = null;
const loadZones = (file) => (zonesPromise ||= fetch(file).then((r) => (r.ok ? r.json() : null)).catch(() => null));

/** A map of FEMA flood zones and the city line. The zones file loads the first time a map needs it. The box needs
 *  its own id: makeMap replaces any earlier map with the same id. */
export function floodMap(box, sw, boundaries, { interactive = true } = {}) {
  const z = sw.flood.zones;
  if (!z) return;
  const [x0, y0, x1, y1] = z.box;
  const zones = loadZones(z.file); // download while the base map loads
  makeMap(box, { interactive, attribution: interactive, bounds: [[x0 + 0.01, y0 + 0.01], [x1 - 0.01, y1 - 0.01]] }).then(async (map) => {
    if (typeof ResizeObserver === "function") new ResizeObserver(() => map.resize()).observe(box);
    map.resize();
    const below = firstLabelLayer(map);
    const fz = await zones;
    if (fz) {
      box.dataset.zones = String(fz.features.length); // drawn (and a hook for checks)
      map.addSource("sw-zones", { type: "geojson", data: fz });
      for (const k of ["500", "100", "floodway"])
        map.addLayer({ id: `sw-${k}`, type: "fill", source: "sw-zones", filter: ["==", ["get", "z"], k], paint: { "fill-color": ZONE[k].color, "fill-opacity": ZONE[k].opacity } }, below);
    } else box.append(h("p", { class: "sw-map-err" }, "The flood map didn't load."));
    const city = boundaries?.features?.find((f) => f.properties.year === "current");
    if (city) {
      map.addSource("sw-city", { type: "geojson", data: { type: "Feature", properties: {}, geometry: city.geometry } });
      map.addLayer({ id: "sw-city-line", type: "line", source: "sw-city", paint: { "line-color": "#2bb3a8", "line-width": 1.4, "line-opacity": 0.85 } }, below);
    }
  });
}

/** The tile's map: no zooming or popups, so a tap opens the window. */
export function tileFloodMap(sw, boundaries, cls) {
  const box = h("div", { class: `map sw-tilemap ${cls}`, id: cls, role: "img", "aria-label": "Map of FEMA flood zones in and around Kannapolis" });
  box.append(h("span", { class: "wl-credit" }, "FEMA · © OpenFreeMap © OpenStreetMap"));
  const go = (tries) => (box.isConnected ? floodMap(box, sw, boundaries, { interactive: false }) : tries && requestAnimationFrame(() => go(tries - 1)));
  requestAnimationFrame(() => go(120));
  return box;
}

export const legend = ({ compact = false } = {}) => h("ul", { class: `sw-legend${compact ? " compact" : ""}`, role: "list" },
  ["floodway", "100", "500"].map((k) => h("li", {}, h("i", { style: { background: ZONE[k].color, opacity: Math.min(1, ZONE[k].opacity + 0.3) } }), ZONE[k].label)),
  h("li", {}, h("i", { class: "city" }), "City limits"));

export function renderStormwater(sw, water, boundaries, director) {
  const root = document.getElementById("stormwater-body");
  const mapBox = h("div", { class: "map sw-live", id: "sw-live-map", role: "img", "aria-label": "Map of FEMA flood zones in and around Kannapolis" });
  fill(root,
    h("section", { class: "card sw-hero" },
      h("div", {}, rainStatus(), h("p", {}, "To report a stormwater problem, an illegal discharge or mud running off a construction site, call Customer Service. ",
        h("a", { href: `mailto:${sw.hotline_email}` }, "Or email the pollution hotline"), ".")),
      h("div", { class: "el-btns" }, reportButton(sw, { label: `Call ${sw.phone}` }), frisButton(sw))),
    h("section", { class: "card" }, h("h3", {}, "Flood zones"),
      h("div", { class: "sw-two" }, mapBox,
        h("div", {}, legend(),
          h("ul", { class: "sw-explain", role: "list" }, sw.flood.explain.map((x) => h("li", {}, h("i", { style: { background: ZONE[x.key].color } }), h("div", {}, h("b", {}, x.name), h("p", {}, x.text))))),
          h("p", {}, sw.flood.insurance),
          h("div", { class: "el-btns" }, frisButton(sw, { compact: true }), ext(sw.flood.fema_msc, "FEMA flood maps ↗", "pill-btn el-shop-2 compact")))),
      h("p", { class: "tile-meta" }, "Flood zones are FEMA's National Flood Hazard Layer, simplified for the map. For an official answer about a property, look it up in FRIS, the State's flood map site.")),
    water?.streams ? h("section", { class: "card" }, h("h3", {}, "Streams right now"), creeks(water),
      h("p", { class: "tile-meta" }, "USGS stream gauges, read daily. \"Much above normal\" means today's flow is in the top tenth for this day of the year; heavy rain sends creeks up within hours.")) : null,
    h("div", { class: "el-two" },
      h("section", { class: "card" }, h("h3", {}, "What is stormwater?"), h("p", {}, sw.what), h("p", {}, sw.two_systems)),
      h("section", { class: "card" }, h("h3", {}, "What to report"),
        h("ul", { class: "sw-report", role: "list" }, sw.report.map((r) => h("li", {}, h("b", {}, r.title), h("span", {}, r.text)))),
        reportButton(sw, { compact: true, label: `Call ${sw.phone}` }))),
    h("section", { class: "card" }, h("h3", {}, "Only rain down the drain"),
      h("ul", { class: "sw-tips", role: "list" }, sw.tips.map((t) => h("li", {}, h("span", { "aria-hidden": "true" }, t.icon), h("span", {}, t.text))))),
    h("div", { class: "el-two" },
      h("section", { class: "card" }, h("h3", {}, "The stormwater fee"), h("p", {}, sw.fee.intro),
        h("ul", { class: "gem-prices", role: "list" }, sw.fee.tiers.map((t) => h("li", {}, h("span", {}, t.tier, h("small", {}, ` · ${t.area}`)), h("b", {}, `$${t.fee.toFixed(2)}/mo`)))),
        h("p", { class: "tile-meta" }, ext(sw.fee.source, "City fee schedule ↗"))),
      h("section", { class: "card" }, h("h3", {}, "The City's stormwater permit"), h("p", {}, sw.permit.intro),
        h("ol", { class: "sw-permit" }, sw.permit.measures.map((m) => h("li", {}, m))),
        h("p", { class: "tile-meta" }, "Questions, educational materials or a presentation for your group: ", h("a", { href: `mailto:${sw.outreach_email}` }, "email stormwater outreach"), "."))),
    h("section", { class: "card" }, h("h3", {}, "Documents"),
      h("p", { class: "el-links" }, sw.documents.flatMap(([l, u], i) => [i ? " · " : null, ext(u, `${l} ↗`)]))),
    director ? h("div", { class: "card kpd-chief" },
      director.photo ? h("img", { src: director.photo, alt: "", loading: "lazy" }) : null,
      h("div", {}, h("b", {}, director.name), h("span", {}, `Director of ${sw.department}`),
        h("div", { class: "pk-links" }, ext(sw.page, "City Stormwater page ↗"), ext(sw.directory, "Staff directory ↗"))),
      contactButtons({ name: director.name, phone: director.phone, email: director.email }, director.name)) : null,
    h("p", { class: "note" }, "From the City of Kannapolis ", ext(sw.page, "Stormwater page"), " and fee schedule; flood zones from FEMA's National Flood Hazard Layer (read weekly); flood alerts and rain chances from the National Weather Service, live; stream flow from USGS gauges, read daily."));
  floodMap(mapBox, sw, boundaries);
}
