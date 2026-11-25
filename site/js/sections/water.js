// Lakes & Rivers (City tab): water levels around Kannapolis and where the city's water comes from, from
// bradspry/kannapolis-water-levels (water_map.py). City lakes from the City of Concord, stream flow from USGS,
// Catawba lakes from NOAA, Yadkin lakes from Cube Hydro Carolinas; read daily.
import { h, fill, showTip, hideTip } from "../ui.js";
import { makeMap, maplibregl, firstLabelLayer } from "../maps.js";

const ext = (href, label, cls) => h("a", { href, target: "_blank", rel: "noopener", class: cls }, label);
const parseDay = (s) => { const [y, m, d] = s.slice(0, 10).split("-").map(Number); return new Date(y, m - 1, d); };
const dayText = (s, o = { month: "short", day: "numeric" }) => (s ? parseDay(s).toLocaleDateString("en-US", o) : "");
export const WATER_COLOR = "#2a78d6";

/** Feet below full pool as words: "2.5 ft below full", "Full", "0.3 ft above full". */
export function belowText(ft) {
  if (ft == null) return "No reading";
  if (Math.abs(ft) < 0.05) return "Full";
  return `${Math.abs(ft).toFixed(1)} ft ${ft > 0 ? "below" : "above"} full`;
}
const lakeFt = (l) => (l.inches == null ? null : -l.inches / 12);

/** USGS's streamflow condition classes, by where today's flow ranks for this day of the year. */
export function condition(p) {
  if (p == null) return { key: "none", label: "No rank" };
  if (p < 10) return { key: "much-below", label: "Much below normal" };
  if (p < 25) return { key: "below", label: "Below normal" };
  if (p <= 75) return { key: "normal", label: "Normal" };
  if (p <= 90) return { key: "above", label: "Above normal" };
  return { key: "much-above", label: "Much above normal" };
}

const arrow = (d, eps) => (d == null ? "" : Math.abs(d) < eps ? " →" : d > 0 ? " ↑" : " ↓");

/** Every lake in one list: name, feet below full, source. Hidden map pins still list. */
export function allLakes(w) {
  return [
    ...w.city_lakes.map((l) => ({ name: l.name, short: l.name.replace(/ \(.*\)/, ""), ft: lakeFt(l), change: l.change_in == null ? null : l.change_in / 12, where: l.manual ? "Kannapolis' own lake" : "Concord city lake", manual: l.manual, updated: l.updated, stale: l.stale, status: l.status, status_url: l.status_url, source: l.source })),
    ...w.reservoirs.map((r) => ({ name: r.name, ft: r.ft_below_full, change: r.change_ft, where: r.source === "NOAA" ? "Catawba River" : "Yadkin River", url: r.url, stale: r.stale })),
  ];
}

export function lakeRows(w, n, { skipEmpty = true } = {}) {
  // Kannapolis' own lake first; with no reading it still lists when there's a reason (e.g. lowered for the dam work).
  const all = allLakes(w), own = all.filter((l) => l.manual), rest = all.filter((l) => !l.manual);
  const list = [...own, ...rest].filter((l) => !skipEmpty || l.ft != null || l.status).slice(0, n);
  return h("ul", { class: "wl-rows", role: "list" }, list.map((l) =>
    h("li", { title: l.ft == null && l.status ? l.status : null, class: l.ft == null && l.status ? "status" : null }, h("span", { class: "wl-name" }, l.short || l.name),
      h("b", {}, l.ft == null && l.status ? "Lowered, Dam Construction" : belowText(l.ft) + arrow(l.change == null ? null : -l.change, 0.05)))));
}

export function streamRows(w) {
  return h("ul", { class: "wl-rows", role: "list" }, w.streams.map((s) => {
    const c = condition(s.percentile);
    return h("li", {}, h("span", { class: "wl-name" }, s.name), h("span", { class: `wl-cond ${c.key}` }, h("i", { "aria-hidden": "true" }), c.label),
      h("b", {}, s.flow_cfs == null ? "—" : `${Math.round(s.flow_cfs).toLocaleString("en-US")} cfs${arrow(s.change_cfs, 10)}`));
  }));
}

const OWN_LABEL = { own: "Kannapolis' own", neighbor: "From neighbors", unverified: "Ownership unverified" };

/** Today's supply vs. after the planned connections: stacked MGD bars, colored by who owns the water. */
export function supplyBars(w, { compact = false } = {}) {
  const existing = w.supply.filter((s) => !s.planned);
  const planned = w.supply.filter((s) => s.planned && s.mgd != null).sort((a, b) => a.year - b.year);
  const gap = Math.round((w.existing_mgd - existing.reduce((n, s) => n + s.mgd, 0)) * 100) / 100;
  const today = [...existing, ...(gap > 0 ? [{ name: "Unlisted", mgd: gap, owner: "unverified" }] : [])];
  const future = [...today, ...planned];
  const max = future.reduce((n, s) => n + s.mgd, 0);
  const bar = (title, parts) => {
    const total = parts.reduce((n, s) => n + s.mgd, 0);
    const nb = parts.filter((s) => s.owner === "neighbor").reduce((n, s) => n + s.mgd, 0);
    return h("div", { class: "wl-sup-row" },
      h("div", { class: "wl-sup-title" }, h("b", {}, title), h("small", {}, `${total.toFixed(1)} MGD · ${Math.round((100 * nb) / total)}% from neighbors`)),
      h("div", { class: "wl-sup-bar", style: { width: `${(100 * total) / max}%` }, role: "img", "aria-label": `${title}: ${parts.map((s) => `${s.name} ${s.mgd} MGD`).join(", ")}` },
        parts.map((s) => {
          const seg = h("span", { class: `wl-seg ${s.owner}${s.planned ? " planned" : ""}`, style: { flex: `${s.mgd} 1 0` }, tabindex: "0" },
            compact ? null : h("small", {}, `${s.bar_label || s.name} ${s.mgd}`));
          const tip = (e) => showTip(e, s.name, [["Supply", `${s.mgd} MGD`], ["Water", OWN_LABEL[s.owner]], ...(s.planned ? [["Planned", String(s.year)]] : [])]);
          seg.addEventListener("pointermove", tip); seg.addEventListener("focus", tip);
          seg.addEventListener("pointerleave", hideTip); seg.addEventListener("blur", hideTip);
          return seg;
        })));
  };
  return h("div", { class: `wl-supply${compact ? " compact" : ""}` },
    bar("Today", today), bar(`After ${planned.map((s) => `${s.name} (${s.year})`).join(", ")}`, future),
    h("ul", { class: "legend wl-legend" }, ["own", "neighbor", "unverified"].map((k) => h("li", {}, h("span", { class: `swatch wl-sw ${k}` }), OWN_LABEL[k])),
      h("li", {}, h("span", { class: "swatch wl-sw planned" }), "Planned")));
}

const FLOW = { own: "#2a78d6", neighbor: "#eb6834", unverified: "#8a8a8a" };

/** The window's map: the same lakes, gauges and supply lines as the tile's drawing, on a street map you can zoom. */
export function liveWaterMap(box, w, boundaries, { interactive = true, labels = true, sourceLabels = labels } = {}) {
  const lakes = [...w.city_lakes.filter((l) => !l.hidden), ...w.reservoirs.filter((r) => !r.hidden)];
  const frame = [...lakes, ...w.streams, ...w.supply.filter((s) => s.lat != null)].map((p) => [p.lon, p.lat]);
  const lons = frame.map((p) => p[0]), lats = frame.map((p) => p[1]);
  makeMap(box, { interactive, attribution: interactive, bounds: [[Math.min(...lons) - 0.03, Math.min(...lats) - 0.02], [Math.max(...lons) + 0.03, Math.max(...lats) + 0.02]] }).then((map) => {
    // Tiles change size (Edit mode, phone rotation): keep the canvas filling its box.
    if (typeof ResizeObserver === "function") new ResizeObserver(() => map.resize()).observe(box);
    map.resize();
    const below = firstLabelLayer(map);
    const city = boundaries?.features?.find((f) => f.properties.year === "current");
    if (city) {
      map.addSource("wl-city", { type: "geojson", data: { type: "Feature", properties: {}, geometry: city.geometry } });
      map.addLayer({ id: "wl-city-fill", type: "fill", source: "wl-city", paint: { "fill-color": "#2a78d6", "fill-opacity": 0.22 } }, below);
      map.addLayer({ id: "wl-city-line", type: "line", source: "wl-city", paint: { "line-color": "#2a78d6", "line-width": 0.8, "line-opacity": 0.7 } }, below);
    }
    const flows = w.supply.filter((s) => s.lat != null).map((s) => ({ type: "Feature",
      properties: { color: FLOW[s.owner] || FLOW.unverified, width: Math.max(2.5, s.mgd * 1.6), planned: !!s.planned },
      geometry: { type: "LineString", coordinates: [[s.lon, s.lat], [w.hub.lon, w.hub.lat]] } }));
    map.addSource("wl-flows", { type: "geojson", data: { type: "FeatureCollection", features: flows } });
    const paint = { "line-color": ["get", "color"], "line-width": ["get", "width"] };
    map.addLayer({ id: "wl-flow-now", type: "line", source: "wl-flows", filter: ["!", ["get", "planned"]], paint: { ...paint, "line-opacity": 0.8 }, layout: { "line-cap": "round" } });
    map.addLayer({ id: "wl-flow-planned", type: "line", source: "wl-flows", filter: ["get", "planned"], paint: { ...paint, "line-opacity": 0.6, "line-dasharray": [2, 1.6] } });
    const pin = (lon, lat, cls, label, html, color, left = false) => {
      const show = cls === "src" ? sourceLabels : labels;
      const el = h("div", { class: `wl-pin ${cls}${left ? " left" : ""}`, title: interactive ? null : html.replace(/<br>/g, ": ").replace(/<[^>]+>/g, "") },
        h("i", { style: color ? { background: color } : null }), show ? h("span", {}, label) : null);
      const m = new maplibregl.Marker({ element: el, anchor: show ? (left ? "right" : "left") : "center", offset: show ? [left ? 8 : -8, 0] : [0, 0] }).setLngLat([lon, lat]);
      if (interactive) m.setPopup(new maplibregl.Popup({ offset: 12 }).setHTML(html));
      m.addTo(map);
    };
    const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
    for (const l of lakes) {
      const ft = l.ft_below_full ?? lakeFt(l), status = l.status && ft == null ? "Lowered, Dam Construction" : belowText(ft);
      pin(l.lon, l.lat, "lake", l.name.replace(/ \(.*\)/, ""), `<b>${esc(l.name)}</b><br>${esc(status)}`, WATER_COLOR);
    }
    for (const st of w.streams) {
      const c = condition(st.percentile);
      pin(st.lon, st.lat, `gauge ${c.key}`, st.name, `<b>${esc(st.name)}</b><br>${esc(c.label)}${st.flow_cfs != null ? ` · ${Math.round(st.flow_cfs).toLocaleString("en-US")} cfs` : ""}`);
    }
    for (const s of w.supply.filter((x) => x.planned && x.lat != null))
      pin(s.lon, s.lat, "src", `${s.bar_label === "CLT" ? "Charlotte Water" : s.name} (${s.year})`, `<b>${esc(s.name)}</b><br>${s.mgd} MGD planned for ${s.year}`, null, true);
  });
}

/** The street map for the large and extra-large tiles: no zooming or popups, so a tap opens the window. */
export function tileWaterMap(w, boundaries, id, { labels = true } = {}) {
  const box = h("div", { class: "map wl-tilemap", id, role: "img", "aria-label": "Map of lakes and stream gauges around Kannapolis, with lines from each water source into the city" });
  box.append(h("span", { class: "wl-credit" }, "© OpenFreeMap © OpenStreetMap"));
  const go = (tries) => (box.isConnected ? liveWaterMap(box, w, boundaries, { interactive: false, labels, sourceLabels: false }) : tries && requestAnimationFrame(() => go(tries - 1)));
  requestAnimationFrame(() => go(120)); // once os.js has put the tile on the page
  return box;
}

function lakeTable(w) {
  return h("div", { class: "table-wrap" }, h("table", {},
    h("thead", {}, h("tr", {}, ["Lake", "Level", "Since yesterday", "River", "Reading"].map((x) => h("th", { scope: "col" }, x)))),
    h("tbody", {}, allLakes(w).map((l) => h("tr", {},
      h("td", {}, l.url ? ext(l.url, l.name) : l.name),
      h("td", {}, l.ft == null && l.status ? h("b", {}, "Lowered, Dam Construction") : h("b", {}, belowText(l.ft))),
      h("td", {}, l.change == null ? "—" : Math.abs(l.change) < 0.05 ? "steady" : `${l.change > 0 ? "▲" : "▼"} ${Math.abs(l.change).toFixed(2)} ft`),
      h("td", {}, l.where),
      h("td", {}, l.manual ? (l.updated ? `Reported ${dayText(l.updated)}${l.source ? ` by the ${l.source}` : ""}` : "No public sensor") : l.stale ? "Last reading (source didn't answer)" : l.updated ? `Updated ${dayText(l.updated)}` : "Hourly"))))));
}

export function renderWater(w, boundaries) {
  const root = document.getElementById("water-body");
  const missingCube = !w.reservoirs.some((r) => r.source !== "NOAA");
  const mapBox = h("div", { class: "map wl-live", id: "wl-live-map", role: "img", "aria-label": "Map of lakes and stream gauges around Kannapolis, with lines from each water source into the city" });
  fill(root,
    h("section", { class: "card" }, h("h3", {}, "Where Kannapolis' water comes from"),
      h("p", { class: "tile-meta" }, `About ${w.existing_mgd} million gallons a day (MGD) of supply today. Line thickness on the map is MGD.`),
      supplyBars(w), h("p", { class: "tile-meta" }, w.supply_note)),
    h("section", { class: "card" }, h("div", { class: "wl-two" }, mapBox,
      h("div", {}, h("h3", {}, "Streams"), streamRows(w),
        h("p", { class: "tile-meta" }, "Condition ranks today's flow among this calendar day's flows in each gauge's record (USGS)."),
        h("h3", {}, "Lakes"), lakeRows(w, 20)))),
    h("section", { class: "card" }, h("h3", {}, "Every lake"), lakeTable(w),
      ...allLakes(w).filter((l) => l.status).map((l) => h("p", { class: "tile-meta" }, `${l.short}: ${l.status} `, l.status_url ? ext(l.status_url, "City news release") : null)),
      missingCube ? h("p", { class: "tile-meta" }, "High Rock, Tuckertown and Badin (Cube Hydro Carolinas) will appear when its page answers.") : null),
    h("p", { class: "note" }, "From Brad Spry's ", ext(w.repo, "kannapolis-water-levels"), " (water_map.py), read daily: ",
      ext(w.links.concord, "City of Concord lake levels"), ", USGS stream gauges, NOAA's National Water Prediction Service and ", ext(w.links.cube, "Cube Hydro Carolinas"),
      ". Kannapolis Lake has no public sensor; its level comes from the Kannapolis Water Treatment Plant when reported."));
  liveWaterMap(mapBox, w, boundaries);
}
