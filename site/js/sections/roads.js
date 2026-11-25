// City Roads (Transportation tab): which streets in Kannapolis the City maintains and which NCDOT does, from
// bradspry/kannapolis-city-roads. OpenStreetMap road types inside the City's Powell Bill limits; read weekly.
import { h, fill, legend } from "../ui.js";
import { projection, pathOf, svgEl } from "../minimap.js";

const ext = (href, label, cls) => h("a", { href, target: "_blank", rel: "noopener", class: cls }, label);
export const ROADS_COLOR = "#3f7fd9";
export const CITY_ROAD = "#58a6ff"; // the script's colors
export const STATE_ROAD = "#e06c75";
const mi = (v) => `${Math.round(v).toLocaleString("en-US")} mi`;
export const roadName = (n) => n.replace(/;/g, " / ").replace(/^I (\d+)/, "I-$1").replace(/US (\d+)/g, "US $1");

export const share = (r) => r.miles.city / (r.miles.city + r.miles.state);

const decode = (r, flat) => { const [x0, y0] = r.origin, out = []; for (let i = 0; i < flat.length; i += 2) out.push([x0 + flat[i] / r.scale, y0 + flat[i + 1] / r.scale]); return out; };

/** The whole city: every city street (blue) and state road (red, drawn on top), and the city limits. */
export function roadMap(r, { cls = "", thin = false } = {}) {
  const rings = r.boundary.map((b) => decode(r, b));
  const P = projection(rings.flat(), { pad: 0.02 });
  const svg = svgEl("svg", { viewBox: `0 0 ${P.W} ${P.H}`, class: `rd-svg ${cls}`, role: "img", preserveAspectRatio: "xMidYMid meet",
    "aria-label": `Map of Kannapolis streets: ${mi(r.miles.city)} the City maintains (blue) and ${mi(r.miles.state)} NCDOT maintains (red)` });
  svg.append(svgEl("path", { class: "tr-city rd-limits", d: rings.map((ring) => pathOf(P.pt, ring) + "Z").join("") }));
  const layer = (lines, c, w) => svgEl("path", { class: "rd-roads", d: lines.map((l) => pathOf(P.pt, decode(r, l))).join(""), stroke: c, "stroke-width": w });
  svg.append(layer(r.lines.city, CITY_ROAD, thin ? 1.6 : 1.3), layer(r.lines.state, STATE_ROAD, thin ? 3.4 : 2.8));
  return h("div", { class: `rd-map ${cls}` }, svg);
}

/** "313 mi · 84% of the city's road miles" headline. */
export function headline(r, { compact = false } = {}) {
  return h("div", { class: `rd-head${compact ? " compact" : ""}` },
    h("div", { class: "rd-stat" }, h("i", { style: { background: CITY_ROAD }, "aria-hidden": "true" }), h("b", {}, mi(r.miles.city)), h("small", {}, "City-maintained")),
    h("div", { class: "rd-stat" }, h("i", { style: { background: STATE_ROAD }, "aria-hidden": "true" }), h("b", {}, mi(r.miles.state)), h("small", {}, "NCDOT (state)")),
    compact ? null : h("p", { class: "tile-meta" }, `The City keeps up about ${Math.round(100 * share(r))}% of the road miles inside its limits.`));
}

export function topList(list, n) {
  return h("ul", { class: "rd-list", role: "list" }, list.slice(0, n).map((x) => h("li", {}, h("span", {}, roadName(x.name)), h("b", {}, `${x.miles.toFixed(1)} mi`))));
}

const TYPE_LABEL = { residential: "Residential streets", tertiary: "Collector roads (tertiary)", unclassified: "Minor roads (unclassified)", living_street: "Living streets",
  primary: "Primary routes", secondary: "Secondary routes", motorway: "Interstate", trunk: "Trunk routes", road: "Unclassified roads" };

export function renderRoads(r) {
  const root = document.getElementById("roads-body");
  const types = Object.entries(r.by_type).filter(([k]) => !k.endsWith("_link"));
  const links = Object.entries(r.by_type).filter(([k]) => k.endsWith("_link")).reduce((s, [, v]) => s + v, 0);
  const max = Math.max(...types.map(([, v]) => v));
  fill(root,
    h("section", { class: "card rd-hero" }, headline(r),
      h("p", { class: "gem-p" }, "In North Carolina, NCDOT maintains interstates, US and NC routes and secondary state roads. A city maintains the local streets inside its limits, paid for partly by the state's Powell Bill street aid, which is shared out by each city's street miles and population.")),
    h("section", { class: "card" }, h("div", { class: "rd-two" }, roadMap(r),
      h("div", {}, legend([{ label: "City-maintained", color: CITY_ROAD, line: true }, { label: "State-maintained (NCDOT)", color: STATE_ROAD, line: true }]),
        h("h3", {}, "Longest City streets"), topList(r.top_city, 10),
        h("h3", {}, "Longest state roads"), topList(r.top_state, 6)))),
    h("section", { class: "card" }, h("h3", {}, "Miles by road type"),
      h("ul", { class: "rd-types" }, types.map(([k, v]) => h("li", {}, h("span", {}, TYPE_LABEL[k] || k),
        h("span", { class: "rd-bar" }, h("i", { style: { width: `${(100 * v) / max}%`, background: r.state_types.includes(k) ? STATE_ROAD : CITY_ROAD } })), h("b", {}, mi(v))))),
      links ? h("p", { class: "tile-meta" }, `Plus ${links.toFixed(1)} miles of ramps and turn lanes.`) : null,
      h("p", { class: "tile-meta" }, "Divided roads are mapped one way per direction in OpenStreetMap, so their miles count each side.")),
    h("p", { class: "note" }, "An approximation, like Brad Spry's ", ext(r.repo, "kannapolis-city-roads"),
      ": OpenStreetMap's road types stand in for who maintains a road (interstate, trunk, primary and secondary roads count as NCDOT's; everything else as the City's), so some state secondary roads mapped as local streets show as City streets. City limits from ",
      ext(r.links.boundary, "NCDOT's Powell Bill boundary layer"), ". Road data © ", ext(r.links.osm, "OpenStreetMap contributors"), " (ODbL). Read weekly."));
}
