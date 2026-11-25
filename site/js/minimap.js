// A small SVG map for widgets (Gas, Lakes & Rivers, City Roads): the city limits faintly, plus points, lines
// and labels in lon/lat. Same projection and look as the Rider Transit mini-maps (equirectangular,
// corrected for latitude), so the maps read as one family.
import { h } from "./ui.js";

const NS = "http://www.w3.org/2000/svg";
export const svgEl = (tag, attrs = {}) => { const el = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, v); return el; };

/** Fit [lon, lat] points into a W-wide box. aspect = H/W (null: from the data). */
export function projection(pts, { pad = 0.06, W = 1000, aspect = null } = {}) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const k = Math.cos(((y0 + y1) / 2) * Math.PI / 180), dx = (x1 - x0) * k || 1e-6, dy = y1 - y0 || 1e-6;
  const H = aspect ? Math.round(W * aspect) : Math.max(200, Math.round(W * dy / dx)), px = pad * W;
  const s = Math.min((W - 2 * px) / dx, (H - 2 * px) / dy);
  const ox = (W - dx * s) / 2, oy = (H - dy * s) / 2;
  return { W, H, s, pt: ([x, y]) => [ox + (x - x0) * k * s, H - (oy + (y - y0) * s)] };
}

export const pathOf = (pt, line) => `M${line.map((p) => pt(p).map((v) => v.toFixed(1)).join(",")).join("L")}`;

/** The current city limits (boundaries.geojson's "current" feature) as rings of [lon, lat]. */
export const cityRings = (boundaries) => boundaries?.features?.find((f) => f.properties.year === "current")?.geometry.coordinates.flat() || [];

/**
 * points: [{ lon, lat, r, fill, cls, label, title }]; lines: [{ coords: [[lon,lat],…], stroke, width, cls, dash }].
 * fit: extra [lon,lat] to include in the frame (defaults to points + the city).
 */
export function miniMap({ boundaries, points = [], lines = [], fit = null, aspect = null, cls = "", label = "Map", pad = 0.07, labels = true }) {
  const city = cityRings(boundaries);
  const frame = fit || [...points.map((p) => [p.lon, p.lat]), ...city.flat()];
  const P = projection(frame, { aspect, pad });
  const svg = svgEl("svg", { viewBox: `0 0 ${P.W} ${P.H}`, class: `mm-svg ${cls}`, role: "img", "aria-label": label, preserveAspectRatio: "xMidYMid meet" });
  if (city.length) svg.append(svgEl("path", { class: "tr-city", d: city.map((r) => pathOf(P.pt, r) + "Z").join("") }));
  for (const l of lines) svg.append(svgEl("path", { class: `mm-line ${l.cls || ""}`, d: pathOf(P.pt, l.coords), stroke: l.stroke, "stroke-width": l.width ?? 6, "stroke-dasharray": l.dash }));
  const lab = svgEl("g", { class: "mm-labels" });
  for (const p of points) {
    const [x, y] = P.pt([p.lon, p.lat]);
    const c = svgEl("circle", { cx: x.toFixed(1), cy: y.toFixed(1), r: p.r ?? 12, fill: p.fill, class: `mm-dot ${p.cls || ""}` });
    if (p.title) { const t = svgEl("title"); t.textContent = p.title; c.append(t); }
    svg.append(c);
    if (p.num != null) { const n = svgEl("text", { x: x.toFixed(1), y: (y + (p.r ?? 12) * 0.36).toFixed(1), "text-anchor": "middle", class: "mm-num", "font-size": ((p.r ?? 12) * 1.05).toFixed(0) }); n.textContent = p.num; svg.append(n); }
    if (labels && p.label) {
      const right = p.side ? p.side === "right" : x < P.W * 0.7;
      const t = svgEl("text", { x: (x + (right ? 1 : -1) * ((p.r ?? 12) + 8)).toFixed(1), y: (y + 9).toFixed(1), "text-anchor": right ? "start" : "end", class: "mm-label" });
      t.textContent = p.label;
      lab.append(t);
    }
  }
  svg.append(lab);
  return h("div", { class: `mm-box ${cls}` }, svg);
}
