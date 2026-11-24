// Transportation: Rider Transit buses (GTFS schedule + live GTFS-realtime positions and alerts),
// Rider ADA Paratransit (its ¾-mile service corridors), and the City's free West Avenue Express shuttle.
// Service status, next departures and "am I in the paratransit area?" are worked out on the device.
import { h, fill } from "../ui.js";
import { makeMap, maplibregl, firstLabelLayer } from "../maps.js";
import { fetchFeed } from "../gtfsrt.js";

const tel = (n) => `tel:${n.replace(/[^0-9]/g, "")}`;
const ext = (href, label, cls) => h("a", { href, target: "_blank", rel: "noopener", class: cls }, label);
const NS = "http://www.w3.org/2000/svg";
const svgEl = (tag, attrs = {}) => { const el = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, v); return el; };
const MILE_M = 1609.344;

// ---------- time & service ----------
const hm = (s) => { const [a, b] = s.split(":").map(Number); return a * 60 + b; };
export function clock(min) {
  const h24 = Math.floor(min / 60) % 24, m = min % 60;
  return `${h24 % 12 || 12}:${String(m).padStart(2, "0")} ${h24 < 12 ? "AM" : "PM"}`;
}
const nowMin = (d = new Date()) => d.getHours() * 60 + d.getMinutes();
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const nthWeekday = (y, m, wd, n) => { const d = new Date(y, m, 1); d.setDate(1 + ((wd - d.getDay() + 7) % 7) + (n - 1) * 7); return d; };
const lastWeekday = (y, m, wd) => { const d = new Date(y, m + 1, 0); d.setDate(d.getDate() - ((d.getDay() - wd + 7) % 7)); return d; };

/** Rider's six no-service holidays for a year, as { "YYYY-MM-DD": name }. */
export function holidays(y) {
  return {
    [ymd(new Date(y, 0, 1))]: "New Year's Day", [ymd(lastWeekday(y, 4, 1))]: "Memorial Day", [ymd(new Date(y, 6, 4))]: "July 4th",
    [ymd(nthWeekday(y, 8, 1, 1))]: "Labor Day", [ymd(nthWeekday(y, 10, 4, 4))]: "Thanksgiving Day", [ymd(new Date(y, 11, 25))]: "Christmas Day",
  };
}
const holidayOn = (d) => holidays(d.getFullYear())[ymd(d)] || null;
const svcOf = (d) => (d.getDay() === 0 || d.getDay() === 6 ? "weekend" : "weekday");
const dayName = (d, now) => { const t = new Date(now); t.setHours(0, 0, 0, 0); const x = new Date(d); x.setHours(0, 0, 0, 0);
  const diff = Math.round((x - t) / 864e5); return diff === 0 ? "today" : diff === 1 ? "tomorrow" : x.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" }); };

/** Is a service with weekday/weekend hours (and Rider's holidays) running? { running, text, short }. */
export function serviceStatus(hours, now = new Date(), { holidaysOff = true, label = "Buses", line = false } = {}) {
  const today = holidaysOff ? holidayOn(now) : null;
  const [o, c] = (hours[svcOf(now)] || []).map(hm);
  if (!today && o != null && nowMin(now) >= o && nowMin(now) < c) return { running: true, text: line ? `${label} open until ${clock(c)}` : `${label} running now, until ${clock(c)}`, short: `Running until ${clock(c)}` };
  for (let i = 0; i < 8; i++) {
    const d = new Date(now); d.setDate(d.getDate() + i);
    const hol = holidaysOff ? holidayOn(d) : null, [oo] = (hours[svcOf(d)] || []).map(hm);
    if (hol || oo == null || (i === 0 && nowMin(now) >= oo)) continue;
    const when = `${dayName(d, now)} at ${clock(oo)}`;
    return { running: false, text: `${today ? `Closed today (${today}). ` : ""}${line ? `${label} opens ${when}` : `Next ${label.toLowerCase()} ${when}`}`, short: `${today ? today : "Not running"} · next ${when}`, holiday: today };
  }
  return { running: false, text: "No service scheduled", short: "No service scheduled" };
}

/** Next holiday within `days`, for a heads-up line. */
export function upcomingHoliday(now = new Date(), days = 10) {
  for (let i = 1; i <= days; i++) { const d = new Date(now); d.setDate(d.getDate() + i); const n = holidayOn(d); if (n) return { name: n, when: dayName(d, now) }; }
  return null;
}

export const statusLine = (st, cls = "") => h("div", { class: `lib-status tr-status ${cls}` }, h("span", {}, h("i", { class: st.running ? "on" : "off", "aria-hidden": "true" }), st.text));

// ---------- shuttle ----------
/** West Avenue Express: running now / next run / off season. */
export function shuttleStatus(sh, now = new Date()) {
  const [o, c] = sh.hours.map(hm), [s0, s1] = sh.season.map((s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); });
  const end = new Date(s1); end.setHours(23, 59);
  const isDay = (d) => sh.days.includes(d.getDay()) && d >= new Date(s0.getFullYear(), s0.getMonth(), s0.getDate()) && d <= end;
  if (isDay(now) && nowMin(now) >= o && nowMin(now) < c) return { running: true, text: `Running now, about every ${sh.every_minutes} minutes, until ${clock(c)}`, short: `Running until ${clock(c)}` };
  for (let i = 0; i < 400; i++) {
    const d = new Date(now); d.setDate(d.getDate() + i); d.setHours(12, 0, 0, 0);
    if (!isDay(d) || (i === 0 && nowMin(now) >= o)) continue;
    const when = `${dayName(d, now)}, ${clock(o)}–${clock(c)}`;
    return { running: false, text: `Next: ${when}`, short: `Next ${when}` };
  }
  return { running: false, text: `Season over (it ran ${fmtDate(sh.season[0])}–${fmtDate(sh.season[1])}); watch for its return in the spring`, short: "Season over; back in the spring", off: true };
}
const fmtDate = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" }); };

// ---------- geometry ----------
function meters(a, b) { // [lon, lat] pairs
  const k = Math.cos(((a[1] + b[1]) / 2) * Math.PI / 180);
  return Math.hypot((a[0] - b[0]) * k * 111320, (a[1] - b[1]) * 110540);
}
function toSegment(p, a, b) {
  const k = Math.cos(p[1] * Math.PI / 180), P = [p[0] * k * 111320, p[1] * 110540], A = [a[0] * k * 111320, a[1] * 110540], B = [b[0] * k * 111320, b[1] * 110540];
  const dx = B[0] - A[0], dy = B[1] - A[1], L = dx * dx + dy * dy;
  const t = L ? Math.max(0, Math.min(1, ((P[0] - A[0]) * dx + (P[1] - A[1]) * dy) / L)) : 0;
  return Math.hypot(P[0] - A[0] - t * dx, P[1] - A[1] - t * dy);
}
/** Distance in miles from a point to the nearest regular bus route (the Express isn't a corridor route). */
export function milesToRoute(t, lon, lat) {
  let best = Infinity, route = null;
  for (const r of localRoutes(t)) for (const s of r.shapes) for (let i = 1; i < s.length; i++) {
    const d = toSegment([lon, lat], s[i - 1], s[i]);
    if (d < best) { best = d; route = r; }
  }
  return { miles: best / MILE_M, route };
}
const localRoutes = (t) => t.routes.filter((r) => !/express/i.test(r.name));

// ---------- schedule ----------
/** Next departures from a stop (index), today, as [{ route, at (minutes), toward }]. */
export function nextAt(t, stopIdx, now = new Date(), n = 4) {
  if (holidayOn(now)) return [];
  const svc = svcOf(now), m = nowMin(now), out = [];
  for (const [ri, s, stops, times] of t.trips) {
    if (s !== svc) continue;
    const i = stops.indexOf(stopIdx);
    if (i < 0 || i === stops.length - 1 || times[i] < m) continue;
    out.push({ route: t.routes[ri], at: times[i], toward: t.stops[stops[stops.length - 1]].name });
  }
  return out.sort((a, b) => a.at - b.at).slice(0, n);
}
const nearestStop = (t, lon, lat) => t.stops.map((s, i) => ({ s, i, m: meters([lon, lat], [s.lon, s.lat]) })).sort((a, b) => a.m - b.m)[0];

// ---------- live data (shared by tiles and windows) ----------
const live = { vehicles: null, alerts: [], at: null, timer: null, listeners: new Set() };
export const liveState = () => live;
export function onLive(fn) { live.listeners.add(fn); return () => live.listeners.delete(fn); }
/** Poll Rider's live feeds every 30 s (alerts every 2 min) while the page is visible. */
export function startLive(t) {
  if (live.timer) return;
  live.tracker = t.rider.links.tracker;
  let n = 0;
  const tick = async () => {
    if (document.hidden) return;
    const [vp, al] = await Promise.all([fetchFeed(t.rider.realtime.vehicles), n++ % 4 === 0 ? fetchFeed(t.rider.realtime.alerts) : Promise.resolve(null)]);
    if (vp) { live.vehicles = vp.vehicles.filter((v) => v.lat && v.lon); live.at = new Date(); }
    if (al) live.alerts = al.alerts.filter((a) => a.header || a.description);
    live.listeners.forEach((fn) => { try { fn(live); } catch (e) { console.warn(e); } });
  };
  tick();
  live.timer = setInterval(tick, 30000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) tick(); });
}
const routeById = (t, id) => t.routes.find((r) => r.id === id);
export const busCount = () => live.vehicles?.length ?? null;
/** "6 buses on the road", kept current as the live feed updates. */
export function liveCount(cls = "tile-meta tr-count") {
  const el = h("p", { class: cls, role: "status" });
  // The public feed can come back empty even while buses run (Rider's tracking moved to CK Rider), so an
  // empty feed points to Rider's own live map rather than claiming no buses are out.
  const draw = () => {
    const n = busCount();
    if (n) fill(el, `🚌 ${n} bus${n === 1 ? "" : "es"} on the road now`);
    else if (n === 0 && live.tracker) fill(el, h("a", { class: "tr-link", href: live.tracker, target: "_blank", rel: "noopener" }, "🚌 See buses live on Rider's tracker ↗"));
    else fill(el);
  };
  draw();
  const off = onLive(() => { if (!el.isConnected) { off(); return; } draw(); });
  return el;
}

export function alertList(t, { compact = false } = {}) {
  if (!live.alerts.length) return null;
  return h("div", { class: `tr-alerts${compact ? " compact" : ""}` }, live.alerts.slice(0, compact ? 1 : 6).map((a) => h("div", { class: "wx-alert warning tr-alert" },
    h("b", {}, "⚠️ ", a.header || "Service alert"), compact ? null : (a.description ? h("p", {}, a.description) : null),
    !compact && a.routeIds.length ? h("small", {}, a.routeIds.map((id) => routeById(t, id)?.name).filter(Boolean).join(", ")) : null,
    !compact && a.url ? ext(a.url, "More ↗") : null)));
}

// ---------- mini maps (SVG, for tiles) ----------
function project(lines, pad = 0.06) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const l of lines) for (const [x, y] of l) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const k = Math.cos(((y0 + y1) / 2) * Math.PI / 180), dx = (x1 - x0) * k, dy = y1 - y0;
  const W = 1000, H = Math.max(200, Math.round(W * dy / dx)), px = pad * W;
  const sx = (W - 2 * px) / dx, sy = (H - 2 * px) / dy, s = Math.min(sx, sy);
  const ox = (W - dx * s) / 2, oy = (H - dy * s) / 2;
  const pt = ([x, y]) => [ox + (x - x0) * k * s, H - (oy + (y - y0) * s)];
  return { W, H, pt, mPerUnit: 111320 / s / 1 /* meters per svg unit along x, k already applied */ };
}
const pathOf = (pt, line) => `M${line.map((p) => pt(p).map((v) => v.toFixed(1)).join(",")).join("L")}`;

/** Rider system mini-map: every route in its color, the city limits faintly, the Transit Center, live buses. */
export function systemMap(t, boundaries, { corridor = false, kannapolisOnly = false, cls = "" } = {}) {
  // Local routes only: the CCX Express runs to Charlotte and would shrink Kannapolis to a corner.
  const routes = localRoutes(t).filter((r) => corridor || !kannapolisOnly || r.kannapolis_stops);
  const lines = routes.flatMap((r) => r.shapes);
  const P = project(lines);
  const svg = svgEl("svg", { viewBox: `0 0 ${P.W} ${P.H}`, class: `tr-map-svg ${cls}`, role: "img", preserveAspectRatio: "xMidYMid meet",
    "aria-label": corridor ? "Map of Rider ADA Paratransit's service area: three-quarters of a mile either side of each bus route" : "Map of Rider Transit's bus routes" });
  const city = t._city;
  if (city) svg.append(svgEl("path", { class: "tr-city", d: city.geometry.coordinates.map((poly) => poly.map((ring) => pathOf(P.pt, ring) + "Z").join("")).join("") }));
  if (corridor) {
    const w = (2 * t.paratransit.corridor_miles * MILE_M) / P.mPerUnit;
    const g = svgEl("g", { class: "tr-corridor" });
    for (const l of lines) g.append(svgEl("path", { d: pathOf(P.pt, l), "stroke-width": w.toFixed(1) }));
    svg.append(g);
  }
  for (const r of routes) for (const l of r.shapes) svg.append(svgEl("path", { class: "tr-route", d: pathOf(P.pt, l), stroke: corridor ? "var(--text-secondary)" : r.color, "stroke-width": corridor ? 3 : 6 }));
  const tc = P.pt([t.rider.transit_center.lon, t.rider.transit_center.lat]);
  svg.append(svgEl("circle", { class: "tr-hub", cx: tc[0].toFixed(1), cy: tc[1].toFixed(1), r: 13 }));
  if (!corridor) {
    const g = svgEl("g", { class: "tr-live-layer" });
    const draw = () => {
      g.replaceChildren(...(live.vehicles || []).map((v) => {
        const [x, y] = P.pt([v.lon, v.lat]);
        return svgEl("circle", { cx: x.toFixed(1), cy: y.toFixed(1), r: 15, fill: routeById(t, v.routeId)?.color || "#fff", class: "tr-bus" });
      }));
    };
    draw();
    const off = onLive(() => { if (!g.isConnected) { off(); return; } draw(); });
    svg.append(g);
  }
  return h("div", { class: `tr-map-box ${cls}` }, svg);
}

/** West Avenue Express mini-map: the loop and its four numbered stops. */
export function shuttleMap(sh, { cls = "" } = {}) {
  // Frame the loop with a little of downtown around it (square-ish), and draw nearby streets faintly.
  const xs = sh.path.map((c) => c[0]), ys = sh.path.map((c) => c[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const hy = ((Math.max(...ys) - Math.min(...ys)) / 2) * 1.35, hx = (hy * 1.6) / Math.cos(cy * Math.PI / 180); // a 1.6:1 frame
  const P = project([[[cx - hx, cy - hy], [cx + hx, cy + hy]]], 0);
  const svg = svgEl("svg", { viewBox: `0 0 ${P.W} ${P.H}`, class: `tr-map-svg sh-map-svg ${cls}`, role: "img", preserveAspectRatio: "xMidYMid meet",
    "aria-label": `Map of the West Avenue Express loop: ${sh.stops.map((s) => s.name).join(", ")}` });
  for (const st of sh.streets || []) svg.append(svgEl("path", { class: "sh-street", d: pathOf(P.pt, st) }));
  svg.append(svgEl("path", { class: "sh-path-casing", d: pathOf(P.pt, sh.path) }));
  svg.append(svgEl("path", { class: "sh-path", d: pathOf(P.pt, sh.path) }));
  sh.stops.forEach((s, i) => {
    const [x, y] = P.pt([s.lon, s.lat]);
    svg.append(svgEl("circle", { class: "sh-stop", cx: x.toFixed(1), cy: y.toFixed(1), r: 34 }));
    const tx = svgEl("text", { class: "sh-stop-n", x: x.toFixed(1), y: (y + 12).toFixed(1), "text-anchor": "middle" }); tx.textContent = String(i + 1); svg.append(tx);
  });
  return h("div", { class: `tr-map-box sh-map-box ${cls}` }, svg);
}

// ---------- shared bits ----------
export function logo(t, cls = "tr-logo-badge") {
  return t.rider.logo ? h("span", { class: cls }, h("img", { src: t.rider.logo, alt: "Rider Transit, Concord Kannapolis Area Transit" })) : null;
}
export const callButton = (label, num, { primary = false, compact = false } = {}) =>
  h("a", { class: `${primary ? "btn-primary" : "pill-btn"} tr-btn${compact ? " compact" : ""}`, href: tel(num), "aria-label": `${label}: ${num}` }, `📞 ${label}`);

export function routeLegend(t, { kannapolisOnly = false, compact = false } = {}) {
  return h("ul", { class: `tr-legend${compact ? " compact" : ""}`, role: "list" }, localRoutes(t).filter((r) => !kannapolisOnly || r.kannapolis_stops).map((r) =>
    h("li", {}, h("i", { style: { background: r.color }, "aria-hidden": "true" }), r.name.replace(/ Route$/, ""))));
}
const every = (r, svc) => (r.every[svc] ? (r.every[svc] <= 62 ? "hourly" : r.every[svc] <= 70 ? "about hourly" : `about every ${r.every[svc]} min`) : "—");

// ---------- Rider window ----------
let routeFilter = "all";
export function renderRider(t) {
  const root = document.getElementById("rider-body");
  const now = new Date(), st = serviceStatus(t.rider.hours, now), hol = upcomingHoliday(now);
  const mapBox = h("div", { class: "map tr-map", id: "rider-map" });
  const chips = h("div", { class: "chips", role: "group", "aria-label": "Routes shown" });
  const liveNote = h("p", { class: "tile-meta tr-live-note", role: "status" });
  const nearOut = h("div", { class: "tr-near-out", role: "status", "aria-live": "polite" });
  const findBtn = h("button", { class: "btn-primary", type: "button" }, "📍 Find my nearest bus stop");
  const alertsBox = h("div", {});
  let mapRef = null;

  const showNear = (idx, label) => {
    const s = t.stops[idx], deps = nextAt(t, idx, new Date());
    nearOut.replaceChildren(h("b", {}, s.name), label ? ` ${label}` : "",
      deps.length ? h("ul", { class: "tr-deps", role: "list" }, deps.map((d) => h("li", {}, h("i", { style: { background: d.route.color }, "aria-hidden": "true" }),
        h("b", {}, clock(d.at)), ` ${d.route.name} toward ${d.toward}`)))
        : h("p", { class: "tile-meta" }, holidayOn(new Date()) ? `No buses today (${holidayOn(new Date())}).` : "No more scheduled buses from this stop today."),
      h("p", { class: "tile-meta" }, "Scheduled times; buses can run a few minutes early or late. ", ext(t.rider.links.app_ios, "Rider app ↗"), " for live arrivals."));
    mapRef?.flyTo({ center: [s.lon, s.lat], zoom: 15 });
  };
  findBtn.addEventListener("click", () => {
    if (!navigator.geolocation) { nearOut.textContent = "Your browser can't share its location."; return; }
    nearOut.textContent = "Finding you…";
    navigator.geolocation.getCurrentPosition((pos) => {
      const n = nearestStop(t, pos.coords.longitude, pos.coords.latitude);
      showNear(n.i, `(${n.m < 1000 ? `${Math.round(n.m / 10) * 10} m` : `${(n.m / MILE_M).toFixed(1)} mi`} away)`);
    }, () => { nearOut.textContent = "Couldn't get your location. Tap a stop on the map instead."; }, { enableHighAccuracy: true, timeout: 15000 });
  });

  const shown = () => t.routes.filter((r) => routeFilter === "all" || (routeFilter === "kan" ? r.kannapolis_stops : r.name === routeFilter));
  const drawChips = () => chips.replaceChildren(...[["all", "All routes"], ["kan", "Kannapolis routes"], ...t.routes.map((r) => [r.name, r.name.replace(/ Route$/, "")])]
    .map(([k, label]) => h("button", { class: "chip", type: "button", "aria-pressed": String(routeFilter === k), onclick: () => { routeFilter = k; drawChips(); applyFilter(); } },
      t.routes.find((r) => r.name === k) ? h("i", { class: "tr-chip-dot", style: { background: t.routes.find((r) => r.name === k).color }, "aria-hidden": "true" }) : null, label)));
  const applyFilter = () => {
    if (!mapRef) return;
    const names = shown().map((r) => r.name);
    mapRef.setFilter("routes", ["in", ["get", "name"], ["literal", names]]);
    mapRef.setFilter("stops", ["any", ...names.map((n) => ["in", n, ["get", "routes"]])]);
  };
  const liveFC = () => ({ type: "FeatureCollection", features: (live.vehicles || []).map((v) => { const r = routeById(t, v.routeId);
    return { type: "Feature", geometry: { type: "Point", coordinates: [v.lon, v.lat] }, properties: { color: r?.color || "#888", route: r?.name || "Rider bus", label: v.label || v.id || "" } }; }) });
  const drawLive = () => {
    const n = busCount();
    if (n) fill(liveNote, `${n} bus${n === 1 ? "" : "es"} on the road · live positions updated ${live.at.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`);
    else if (n === 0 && st.running) fill(liveNote, "Rider's public live feed isn't reporting bus positions right now. ", ext(t.rider.links.tracker, "See buses live on Rider's tracker ↗"));
    else if (n === 0) fill(liveNote, "No buses running now (outside service hours). ", ext(t.rider.links.tracker, "Rider's live tracker ↗"));
    else fill(liveNote, "Live bus positions load from Rider's real-time feed.");
    mapRef?.getSource("buses")?.setData(liveFC());
    alertsBox.replaceChildren(...[alertList(t)].filter(Boolean));
  };

  const routeRows = t.routes.map((r) => h("li", { class: "tr-route-row" },
    h("i", { class: "tr-swatch", style: { background: r.color }, "aria-hidden": "true" }),
    h("div", {}, h("b", {}, r.name), h("small", {}, `Transit Center ↔ ${r.far_end} · ${r.stops} stops${r.kannapolis_stops ? ` (${r.kannapolis_stops} in Kannapolis)` : ""}`)),
    h("div", { class: "tr-route-when" }, h("span", {}, `Weekdays ${r.hours.weekday ? `${clock(r.hours.weekday[0])}–${clock(r.hours.weekday[1])}` : "—"}, ${every(r, "weekday")}`),
      h("span", {}, `Weekends ${r.hours.weekend ? `${clock(r.hours.weekend[0])}–${clock(r.hours.weekend[1])}` : "—"}, ${every(r, "weekend")}`)),
    r.page ? ext(r.page, "Map & schedule ↗") : null));

  fill(root,
    h("section", { class: "card tr-hero-card" },
      logo(t, "tr-hero-logo"),
      h("div", { class: "tr-hero-body" },
        statusLine(st, "big"),
        hol ? h("p", { class: "tile-meta" }, `No buses ${hol.when} (${hol.name}).`) : null,
        h("p", { class: "gem-p" }, `${t.routes.length - 1} routes from the Rider Transit Center in Concord, ${t.routes.filter((r) => r.kannapolis_stops).length} of them through Kannapolis, plus the CCX Express to Charlotte's JW Clay LYNX light-rail station. Fare ${t.rider.fare}. ${t.rider.fare_note}`),
        h("div", { class: "tr-actions" }, callButton(`Rider ${t.rider.phone}`, t.rider.phone, { primary: true }), ext(t.rider.links.app_ios, "Rider app (iPhone) ↗", "pill-btn tr-btn"),
          ext(t.rider.links.app_android, "Rider app (Android) ↗", "pill-btn tr-btn"), ext(t.rider.links.system_map_pdf, "System map (PDF) ↗", "pill-btn tr-btn")))),
    alertsBox,
    h("section", { class: "card" }, h("h3", {}, "System map"), chips, mapBox, liveNote,
      h("p", { class: "tile-meta" }, "Tap a stop for its next scheduled buses. Colored dots are buses, live from Rider's GPS feed.")),
    h("section", { class: "card tr-near" }, h("h3", {}, "When's the next bus?"), findBtn, nearOut),
    h("section", { class: "card" }, h("h3", {}, "Routes"), h("ul", { class: "tr-routes", role: "list" }, routeRows)),
    h("div", { class: "grid" },
      h("section", { class: "card" }, h("h3", {}, "Hours"), h("p", { class: "gem-p" }, t.rider.hours_text),
        h("p", { class: "gem-p" }, `No buses on ${t.rider.holidays.join(", ").replace(/, ([^,]*)$/, " or $1")}.`),
        h("p", { class: "tile-meta" }, `${t.rider.transit_center.name}, ${t.rider.transit_center.address}. ${t.rider.transit_center.lobby}`)),
      h("section", { class: "card" }, h("h3", {}, "Good to know"),
        h("ul", { class: "pk-rules" }, h("li", {}, t.rider.bikes), h("li", {}, "Every bus is wheelchair accessible, with a ramp and two securement spots."),
          h("li", {}, "Can't use the bus because of a disability? See Rider ADA Paratransit."), h("li", {}, `TDD ${t.rider.tdd}`)))),
    h("div", { class: "pk-links" }, ext(t.rider.links.home, "ckrider.com ↗"), ext(t.rider.links.system_map, "System map ↗"), ext(t.rider.links.detours, "Service changes & detours ↗"),
      ext(t.rider.links.fares, "Fares & passes ↗"), ext(t.rider.links.how_to_ride, "How to ride ↗"), ext(t.rider.links.facebook, "Facebook ↗")),
    h("p", { class: "note" }, `Routes, stops and schedules from Rider's official GTFS feed (Passio; feed ${t.gtfs.start ? `${t.gtfs.start.slice(4, 6)}/${t.gtfs.start.slice(6)}` : ""}–${t.gtfs.end ? `${t.gtfs.end.slice(4, 6)}/${t.gtfs.end.slice(6)}/${t.gtfs.end.slice(0, 4)}` : ""}), read weekly; bus positions and alerts live from its GTFS-realtime feed. Hours, fares and holidays from ckrider.com.`));
  drawChips();
  drawLive();
  startLive(t);
  const off = onLive(() => { if (!root.isConnected) { off(); return; } drawLive(); });

  const fc = { type: "FeatureCollection", features: t.routes.flatMap((r) => r.shapes.map((s) => ({ type: "Feature", geometry: { type: "LineString", coordinates: s }, properties: { name: r.name, color: r.color } }))) };
  const stopsFC = { type: "FeatureCollection", features: t.stops.map((s, i) => ({ type: "Feature", id: i, geometry: { type: "Point", coordinates: [s.lon, s.lat] },
    properties: { i, name: s.name, routes: s.routes.map((ri) => t.routes[ri].name) } })) };
  const xs = localRoutes(t).flatMap((r) => r.shapes.flat()); // open framed on the local routes; zoom out for the Express to Charlotte
  makeMap(mapBox, { bounds: [[Math.min(...xs.map((c) => c[0])), Math.min(...xs.map((c) => c[1]))], [Math.max(...xs.map((c) => c[0])), Math.max(...xs.map((c) => c[1]))]] }).then((map) => {
    mapRef = map;
    map.addSource("routes", { type: "geojson", data: fc });
    map.addLayer({ id: "routes-casing", type: "line", source: "routes", paint: { "line-color": "#fff", "line-width": 6, "line-opacity": 0.6 }, layout: { "line-join": "round", "line-cap": "round" } }, firstLabelLayer(map));
    // Local routes draw over the Express where they share a road (I-85).
    map.addLayer({ id: "routes", type: "line", source: "routes", paint: { "line-color": ["get", "color"], "line-width": 3.5 },
      layout: { "line-join": "round", "line-cap": "round", "line-sort-key": ["case", ["in", "Express", ["get", "name"]], 0, 1] } }, firstLabelLayer(map));
    map.addSource("stops", { type: "geojson", data: stopsFC });
    map.addLayer({ id: "stops", type: "circle", source: "stops", minzoom: 12, paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 12, 2.5, 16, 6], "circle-color": "#fff", "circle-stroke-color": "#333", "circle-stroke-width": 1.2 } });
    map.addSource("buses", { type: "geojson", data: liveFC() });
    map.addLayer({ id: "buses", type: "circle", source: "buses", paint: { "circle-radius": 8, "circle-color": ["get", "color"], "circle-stroke-color": "#fff", "circle-stroke-width": 2.5 } });
    new maplibregl.Marker({ element: h("div", { class: "tr-hub-marker", title: t.rider.transit_center.name }, "R") }).setLngLat([t.rider.transit_center.lon, t.rider.transit_center.lat])
      .setPopup(new maplibregl.Popup({ offset: 14 }).setHTML(`<b>${t.rider.transit_center.name}</b><br>${t.rider.transit_center.address}<br>Every route starts here.`)).addTo(map);
    map.on("click", "stops", (e) => {
      const i = e.features[0].properties.i, deps = nextAt(t, i, new Date(), 3);
      new maplibregl.Popup({ offset: 8 }).setLngLat(e.lngLat).setDOMContent(h("div", { class: "tr-pop" }, h("b", {}, t.stops[i].name),
        deps.length ? h("ul", {}, deps.map((d) => h("li", {}, h("i", { style: { background: d.route.color } }), `${clock(d.at)} ${d.route.name.replace(/ Route$/, "")}`))) : h("div", {}, "No more buses today"))).addTo(map);
      showNear(i, "");
    });
    map.on("click", "buses", (e) => { const p = e.features[0].properties; new maplibregl.Popup({ offset: 10 }).setLngLat(e.lngLat).setHTML(`<b>${p.route}</b>${p.label ? `<br>Bus ${p.label}` : ""}`).addTo(map); });
    for (const id of ["stops", "buses"]) { map.on("mouseenter", id, () => { map.getCanvas().style.cursor = "pointer"; }); map.on("mouseleave", id, () => { map.getCanvas().style.cursor = ""; }); }
    applyFilter();
  });
}

// ---------- Paratransit window ----------
export function renderParatransit(t) {
  const p = t.paratransit, root = document.getElementById("paratransit-body");
  const now = new Date(), bus = serviceStatus(t.rider.hours, now, { label: "Rides" }), res = serviceStatus(p.reservation_hours, now, { holidaysOff: true, label: "Reservations line", line: true });
  const mapBox = h("div", { class: "map tr-map", id: "para-map" });
  const out = h("div", { class: "tr-near-out", role: "status", "aria-live": "polite" });
  const btn = h("button", { class: "btn-primary", type: "button" }, "📍 Am I in the service area?");
  let mapRef = null;
  btn.addEventListener("click", () => {
    if (!navigator.geolocation) { out.textContent = "Your browser can't share its location."; return; }
    out.textContent = "Finding you…";
    navigator.geolocation.getCurrentPosition((pos) => {
      const { miles, route } = milesToRoute(t, pos.coords.longitude, pos.coords.latitude), inside = miles <= p.corridor_miles;
      out.replaceChildren(h("b", {}, inside ? "✅ Yes, you're in the service area." : "❌ You're outside the service area."), " ",
        `You're about ${miles < 0.1 ? "less than 0.1" : miles.toFixed(1)} mile${miles >= 0.95 && miles < 1.05 ? "" : "s"} from the ${route?.name || "nearest route"}; paratransit covers ${p.corridor_miles === 0.75 ? "¾" : p.corridor_miles} mile either side of each route. `,
        "Both ends of a trip need to be in the area. Rider makes the final call: ", h("a", { href: tel(p.phones.eligibility) }, p.phones.eligibility), ".");
      mapRef?.flyTo({ center: [pos.coords.longitude, pos.coords.latitude], zoom: 13 });
      if (mapRef) new maplibregl.Marker({ color: inside ? "#1baf7a" : "#e34948" }).setLngLat([pos.coords.longitude, pos.coords.latitude]).addTo(mapRef);
    }, () => { out.textContent = "Couldn't get your location."; }, { enableHighAccuracy: true, timeout: 15000 });
  });
  fill(root,
    h("section", { class: "card tr-hero-card para" },
      logo(t, "tr-hero-logo"),
      h("div", { class: "tr-hero-body" },
        h("p", { class: "gem-p" }, p.what),
        statusLine(res, "big"),
        h("p", { class: "tile-meta" }, `Reservations ${p.reservation_hours_text}. Rides run ${t.rider.hours_text.replace(/;/, ",")}. ${bus.running ? "Rides are running now." : ""}`),
        h("div", { class: "tr-actions" }, callButton(`Book a ride ${p.phones.reservations}`, p.phones.reservations, { primary: true }),
          callButton(`Eligibility ${p.phones.eligibility}`, p.phones.eligibility), callButton(`TDD ${p.phones.tdd}`, p.phones.tdd)))),
    h("div", { class: "grid" },
      h("section", { class: "card" }, h("h3", {}, "Fare"), h("p", { class: "tr-fare" }, h("b", {}, p.fare), ` ${p.fare_note}`),
        h("p", { class: "tile-meta" }, "Buy a ticket book before your first ride: ", h("a", { href: tel(p.phones.tickets) }, p.phones.tickets), ".")),
      h("section", { class: "card" }, h("h3", {}, "No rides on"), h("p", { class: "gem-p" }, t.rider.holidays.join(", ").replace(/, ([^,]*)$/, " or $1") + "."), h("p", { class: "tile-meta" }, p.visitors))),
    h("section", { class: "card" }, h("h3", {}, "Service area"),
      h("p", { class: "sub" }, `Shaded: within ${p.corridor_miles === 0.75 ? "¾" : p.corridor_miles} mile of a Rider bus route, as the ADA requires. You don't have to live there; both ends of each trip do.`),
      mapBox, h("div", { class: "tr-near" }, btn, out)),
    h("section", { class: "card" }, h("h3", {}, "How it works"), h("ol", { class: "tr-steps" }, p.how.map((x) => h("li", {}, x))),
      h("div", { class: "tr-actions" }, ext(p.links.application_en, "Application (English, Word) ↗", "pill-btn tr-btn"), ext(p.links.application_es, "Solicitud (español, Word) ↗", "pill-btn tr-btn"))),
    h("div", { class: "pk-links" }, ext(p.links.page, "Rider accessibility & paratransit page ↗"), ext(t.rider.links.home, "ckrider.com ↗")),
    h("p", { class: "note" }, "Rules, phones and fares from Rider Transit's accessibility page; the service area is drawn from the bus routes in Rider's GTFS feed (¾ mile either side of each local route; the CCX Express isn't included)."));

  const lines = localRoutes(t).flatMap((r) => r.shapes);
  const fc = { type: "FeatureCollection", features: lines.map((s) => ({ type: "Feature", geometry: { type: "LineString", coordinates: s }, properties: {} })) };
  const xs = lines.flat();
  makeMap(mapBox, { bounds: [[Math.min(...xs.map((c) => c[0])) - 0.015, Math.min(...xs.map((c) => c[1])) - 0.012], [Math.max(...xs.map((c) => c[0])) + 0.015, Math.max(...xs.map((c) => c[1])) + 0.012]] }).then((map) => {
    mapRef = map;
    // A line exactly 1.5 miles wide on the ground: Web Mercator meters per pixel at this latitude, per zoom.
    const lat = 35.45, mpp = (z) => (156543.03392 * Math.cos(lat * Math.PI / 180)) / 2 ** z, width = 2 * p.corridor_miles * MILE_M;
    map.addSource("corr", { type: "geojson", data: fc });
    map.addLayer({ id: "corr", type: "line", source: "corr", layout: { "line-join": "round", "line-cap": "round" },
      paint: { "line-color": p.color, "line-opacity": 0.22, "line-width": ["interpolate", ["exponential", 2], ["zoom"], 8, width / mpp(8), 18, width / mpp(18)] } }, firstLabelLayer(map));
    map.addLayer({ id: "corr-route", type: "line", source: "corr", paint: { "line-color": p.color, "line-width": 2 } }, firstLabelLayer(map));
  });
}

// ---------- Shuttle window ----------
export function renderShuttle(t) {
  const sh = t.shuttle, root = document.getElementById("shuttle-body"), st = shuttleStatus(sh);
  const mapBox = h("div", { class: "map tr-map sh-map", id: "shuttle-map" });
  fill(root,
    h("section", { class: "card tr-hero-card shuttle" },
      h("div", { class: "sh-badge", "aria-hidden": "true" }, "⚡"),
      h("div", { class: "tr-hero-body" },
        statusLine(st, "big"),
        h("p", { class: "gem-p" }, `${sh.fare}, ADA-accessible shuttles (${sh.nicknames.join(" and ")}) loop between four downtown stops ${sh.days_text}, ${clock(hm(sh.hours[0]))}–${clock(hm(sh.hours[1]))}, ${fmtDate(sh.season[0])}–${fmtDate(sh.season[1])}, ${sh.season[1].slice(0, 4)}. A shuttle reaches each stop about every ${sh.every_minutes} minutes: park once and ride to the ballpark, the Swanee or dinner.`),
        h("div", { class: "tr-actions" }, ext(sh.links.parking, "Downtown parking ↗", "btn-primary tr-btn"), ext(sh.links.parking_map, "Parking map ↗", "pill-btn tr-btn"), callButton(`City ${sh.phone}`, sh.phone)))),
    h("div", { class: "grid sh-grid" },
      h("section", { class: "card" }, h("h3", {}, "The loop"), mapBox),
      h("section", { class: "card" }, h("h3", {}, "Stops"), h("ol", { class: "sh-stops" }, sh.stops.map((s) => h("li", {}, s.name))),
        h("p", { class: "tile-meta" }, `The shuttles run the loop continuously; there's no timetable. Wait at any stop and one comes within about ${sh.every_minutes} minutes.`))),
    h("div", { class: "pk-links" }, ext(sh.links.news, "City announcement ↗"), ext(sh.links.parking, "Parking in downtown Kannapolis ↗")),
    h("p", { class: "note" }, `${sh.note} ${sh.stops_source}`));
  const coords = [...sh.path, ...sh.stops.map((s) => [s.lon, s.lat])];
  makeMap(mapBox, { bounds: [[Math.min(...coords.map((c) => c[0])) - 0.0025, Math.min(...coords.map((c) => c[1])) - 0.0015], [Math.max(...coords.map((c) => c[0])) + 0.0025, Math.max(...coords.map((c) => c[1])) + 0.0015]] }).then((map) => {
    map.addSource("loop", { type: "geojson", data: { type: "Feature", geometry: { type: "LineString", coordinates: sh.path } } });
    map.addLayer({ id: "loop-casing", type: "line", source: "loop", paint: { "line-color": "#fff", "line-width": 9, "line-opacity": 0.8 }, layout: { "line-join": "round", "line-cap": "round" } });
    map.addLayer({ id: "loop", type: "line", source: "loop", paint: { "line-color": sh.color, "line-width": 5 }, layout: { "line-join": "round", "line-cap": "round" } });
    sh.stops.forEach((s, i) => new maplibregl.Marker({ element: h("div", { class: "sh-marker", title: s.name }, String(i + 1)) }).setLngLat([s.lon, s.lat])
      .setPopup(new maplibregl.Popup({ offset: 14 }).setHTML(`<b>${i + 1}. ${s.name}</b><br>West Avenue Express stop`)).addTo(map));
  });
}
