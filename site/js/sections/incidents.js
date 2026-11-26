// NCDOT Incidents: crashes, closures and roadwork in and around Kannapolis, from NCDOT's DriveNC events feed
// (data/generated/incidents.json, refreshed with every deploy: every 15 minutes).
import { h, fill } from "../ui.js";
import { makeMap, maplibregl } from "../maps.js";

export const INCIDENTS_COLOR = "#d97706"; // NCDOT work-zone orange
export const KIND = {
  incident: { label: "Crash or incident", short: "Incident", color: "#dc2626", icon: "⚠" },
  closure: { label: "Road closure", short: "Closure", color: "#ea580c", icon: "⛔" },
  roadwork: { label: "Roadwork", short: "Roadwork", color: "#ca8a04", icon: "🚧" },
};
const ext = (href, label, cls) => h("a", { href, target: "_blank", rel: "noopener", class: cls }, label);

/** "vehicleCrash" → "Vehicle crash"; empty → the kind's label. */
export const subtypeLabel = (e) => {
  const s = (e.subtype || "").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").trim().toLowerCase();
  return s ? s[0].toUpperCase() + s.slice(1) : KIND[e.kind].short;
};
const DIR = { Northbound: "NB", Southbound: "SB", Eastbound: "EB", Westbound: "WB" };
/** "I-85 NB" */
export const roadLabel = (e) => {
  // DriveNC sometimes puts the direction in the road name ("I-85 Northbound") and sometimes in DirectionOfTravel
  const road = (e.road || "").replace(/\b(North|South|East|West)bound\b/g, (m) => DIR[m]);
  const dir = DIR[e.direction] && !road.includes(DIR[e.direction]) ? DIR[e.direction] : "";
  return [road, dir].filter(Boolean).join(" ") || "Kannapolis area";
};

/** A short place from DriveNC's description: "Ramp to NC 152", "Mile marker 66", "Exit 58". */
export function place(e) {
  const d = e.description || "";
  const ramp = d.match(/\bramp\b[^.]*?\bto ([^.]+?)\./i);
  if (ramp) return `Ramp to ${ramp[1].trim()}`;
  const m = d.match(/\b(?:near|at) (mile marker|exit) (\d+)/i);
  if (m) return `${m[1][0].toUpperCase()}${m[1].slice(1).toLowerCase()} ${m[2]}`;
  const at = d.match(/\bat ([A-Z][^.]{2,40}?)(?:\.| in )/);
  return at ? at[1].trim() : "";
}

const when = (iso) => (iso ? new Date(iso) : null);
const dayTime = (d, now) => {
  const same = d.toDateString() === now.toDateString();
  const t = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).replace(":00", "");
  return same ? t : `${d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}, ${t}`;
};
/** "Since 2:10 PM" · "Until Fri, Dec 4, 4 PM" · "Mon, Nov 30, 9 AM – Fri, Dec 4, 4 PM" */
export function timeLabel(e, now = new Date(), { short = false } = {}) {
  const s = when(e.start), x = when(e.end);
  if (short && s && x && s > now && s.toDateString() !== x.toDateString()) { // "Nov 30 – Dec 4"
    const d = (v) => v.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return `${d(s)} – ${d(x)}`;
  }
  if (s && s > now) return x ? `${dayTime(s, now)} – ${dayTime(x, now)}` : `From ${dayTime(s, now)}`;
  if (x) return `Until ${dayTime(x, now)}`;
  return s ? `Since ${dayTime(s, now)}` : "";
}

/** Events still on: { now: [...], soon: [...] }, crashes first. Anything past its planned end is gone. */
export function sortEvents(inc, now = new Date()) {
  const live = (inc?.events || []).filter((e) => !e.end || new Date(e.end) >= now);
  return { now: live.filter((e) => !e.start || new Date(e.start) <= now), soon: live.filter((e) => e.start && new Date(e.start) > now) };
}

/** More than 2 hours since the last DriveNC check (the deploy runs every 15 minutes): don't claim "All clear". */
export const stale = (inc, now = new Date()) => !inc?.fetched || now - new Date(inc.fetched) > 2 * 3600e3;

/** The headline: { tone: "bad"|"warn"|"ok", text }. */
export function status(inc, now = new Date()) {
  if (stale(inc, now)) return { tone: "unknown", text: "No recent check of DriveNC" };
  const { now: on, soon } = sortEvents(inc, now);
  const n = (k) => on.filter((e) => e.kind === k).length;
  const plural = (c, w) => `${c} ${w}${c === 1 ? "" : "s"}`;
  if (n("incident")) return { tone: "bad", text: `${plural(n("incident"), "incident")} now${on.find((e) => e.kind === "incident")?.road ? ` · ${roadLabel(on.find((e) => e.kind === "incident"))}` : ""}` };
  if (n("closure")) return { tone: "bad", text: `${plural(n("closure"), "road closure")} now` };
  if (n("roadwork")) return { tone: "warn", text: `${plural(n("roadwork"), "work zone")} now` };
  return { tone: "ok", text: soon.length ? "No crashes or closures" : "All clear" };
}

/** "Updated 3:15 PM" (or a date if it's old). */
export const updated = (inc, now = new Date()) => (inc?.fetched ? `Updated ${dayTime(new Date(inc.fetched), now)}` : "");

/** One event row: colored kind dot, what and where, when. */
export function row(e, { compact = false, now = new Date() } = {}) {
  const k = KIND[e.kind];
  return h("li", { class: `ic-row ${e.kind}${compact ? " compact" : ""}` },
    h("i", { class: "ic-dot", style: { background: k.color }, "aria-hidden": "true" }),
    h("div", {},
      h("div", { class: "ic-what" }, h("b", {}, roadLabel(e)), " · ", subtypeLabel(e), compact && place(e) ? ` · ${place(e)}` : null, e.full_closure ? h("span", { class: "ic-tag" }, "All lanes closed") : null),
      compact ? null : h("div", { class: "ic-desc" }, e.description.replace(/\s*Id: \d+\.?$/, "")),
      h("div", { class: "tile-meta" }, [timeLabel(e, now, { short: compact }), compact || !e.lanes || e.description.toLowerCase().includes(e.lanes.toLowerCase()) ? null : e.lanes].filter(Boolean).join(" · "))));
}
export const list = (events, n, o) => h("ul", { class: "ic-list", role: "list" }, events.slice(0, n).map((e) => row(e, o)));

/** A map of the Kannapolis area with a pin per event (and its stretch of road, when DriveNC gives one). */
export function incidentMap(box, inc, events, { interactive = true } = {}) {
  const [la0, la1, lo0, lo1] = inc.bbox;
  makeMap(box, { interactive, attribution: interactive, bounds: [[lo0, la0], [lo1, la1]] }).then((map) => {
    if (typeof ResizeObserver === "function") new ResizeObserver(() => map.resize()).observe(box);
    map.resize();
    for (const e of events) {
      if (typeof e.lat !== "number" || typeof e.lon !== "number") continue;
      const el = h("div", { class: `ic-pin ${e.kind}`, style: { background: KIND[e.kind].color } }, KIND[e.kind].icon);
      const m = new maplibregl.Marker({ element: el }).setLngLat([e.lon, e.lat]);
      if (interactive) m.setPopup(new maplibregl.Popup({ offset: 14 }).setText(`${roadLabel(e)} · ${subtypeLabel(e)}: ${e.description.replace(/\s*Id: \d+\.?$/, "")}`));
      m.addTo(map);
    }
  });
}

/** Tile map: no zooming, so a tap opens the window. */
export function tileMap(inc, events, id) {
  const box = h("div", { class: "map ic-tilemap", id, role: "img", "aria-label": `Map of ${events.length} traffic events around Kannapolis` });
  box.append(h("span", { class: "wl-credit" }, "© OpenFreeMap © OpenStreetMap"));
  const go = (tries) => (box.isConnected ? incidentMap(box, inc, events, { interactive: false }) : tries && requestAnimationFrame(() => go(tries - 1)));
  requestAnimationFrame(() => go(120));
  return box;
}

export const legend = () => h("div", { class: "ic-legend", "aria-hidden": "true" },
  Object.values(KIND).map((k) => h("span", {}, h("i", { style: { background: k.color } }), k.short)));

/** NCDOT's logo on a white badge: top-right on tiles, beside the status in the window. */
export const logo = (inc, cls = "ic-logo") => (inc?.logo ? h("span", { class: cls }, h("img", { src: inc.logo, alt: "NCDOT logo" })) : null);

export function statusLine(inc, now = new Date()) {
  const st = status(inc, now);
  return h("div", { class: `ic-status ${st.tone}` }, h("i", { "aria-hidden": "true" }), st.text);
}

export function renderIncidents(inc) {
  const root = document.getElementById("incidents-body");
  const now = new Date(), { now: on, soon } = sortEvents(inc, now);
  const mapBox = h("div", { class: "map ic-live", id: "ic-live-map", role: "img", "aria-label": `Map of ${on.length + soon.length} traffic events around Kannapolis` });
  fill(root,
    h("section", { class: "card ic-hero" }, logo(inc, "ic-logo lg"),
      h("div", { class: "ic-hero-text" }, statusLine(inc, now), h("p", { class: "tile-meta" }, `${updated(inc, now)} · checked every 15 minutes`)),
      ext("https://www.drivenc.gov/", "Live map on DriveNC ↗", "btn-primary")),
    h("section", { class: "card" }, h("h3", {}, "Around Kannapolis"), mapBox, legend(),
      h("p", { class: "tile-meta" }, "I-85 from Kannapolis Parkway (exit 54) to Old Beatty Ford Road (exit 65), and the streets in and around the city.")),
    h("section", { class: "card" }, h("h3", {}, "Right now"),
      on.length ? list(on, on.length, { now }) : h("p", { class: "tile-meta" }, "No crashes, closures or work zones reported around Kannapolis.")),
    soon.length ? h("section", { class: "card" }, h("h3", {}, "Coming up"), list(soon, soon.length, { now })) : null,
    h("p", { class: "note" }, "From NCDOT's ", ext("https://www.drivenc.gov/developers/doc", "DriveNC events feed"),
      ", the same reports as the DriveNC.gov map: crashes, closures and roadwork. The site checks it every 15 minutes, so a new crash can take a few minutes to show. Call 911 for an emergency, or *HP (*47) for the Highway Patrol."));
  incidentMap(mapBox, inc, [...on, ...soon]);
}
