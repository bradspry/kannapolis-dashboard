// Dashboard dial gauges (SVG). On first appearance each needle does a car-style "ignition sweep":
// up to the top of the dial, then settles on its value. Colors come from CSS variables, so a theme
// change needs no redraw. Respects prefers-reduced-motion.
import { h } from "./ui.js";

const NS = "http://www.w3.org/2000/svg";
const SWEEP = 240;               // degrees of dial
const START = -SWEEP / 2;        // angle of min (0° = straight up)
const CX = 100, CY = 96, R = 78; // geometry in a 200×160 viewBox
const sweepStart = new Map();    // gauge id -> when its ignition sweep started (performance.now()), this page load
const UP = 650, SETTLE = 1100;    // sweep up, then settle (ms)
let io;

const s = (tag, attrs = {}) => {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, v);
  return el;
};
const polar = (deg, r) => {
  const a = ((deg - 90) * Math.PI) / 180;
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)];
};
const arcPath = (a0, a1, r) => {
  const [x0, y0] = polar(a0, r), [x1, y1] = polar(a1, r);
  return `M${x0.toFixed(2)},${y0.toFixed(2)} A${r},${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(2)},${y1.toFixed(2)}`;
};
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const easeOut = (t) => 1 - (1 - t) ** 3;
const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * gauge({ id, label, value, min, max, format, context, zones: [{from, to}], marker: {value, label},
 *         ticks: 4, tickFormat, ariaLabel })
 * Returns an element. `zones` are drawn as a red line (limits); `marker` is a comparison tick.
 */
export function gauge(o) {
  const { id, label, value, min = 0, max, format = String, tickFormat = format, ticks = 4 } = o;
  const clamp = (v) => Math.max(min, Math.min(max, v));
  const angle = (v) => START + (SWEEP * (clamp(v) - min)) / (max - min);

  const svg = s("svg", { viewBox: "0 0 200 160", class: "gauge-svg", "aria-hidden": "true" });
  svg.append(s("path", { d: arcPath(START, START + SWEEP, R), class: "g-track" }));
  for (const z of o.zones || []) {
    svg.append(s("path", { d: arcPath(angle(z.from), angle(z.to), R + 11), class: "g-zone" }));
  }
  // ticks: major with labels, minor between
  for (let i = 0; i <= ticks * 2; i++) {
    const v = min + ((max - min) * i) / (ticks * 2), a = angle(v), major = i % 2 === 0;
    const [x0, y0] = polar(a, R - 12), [x1, y1] = polar(a, R - (major ? 22 : 17));
    svg.append(s("line", { x1: x0, y1: y0, x2: x1, y2: y1, class: major ? "g-tick major" : "g-tick" }));
    if (major && (i === 0 || i === ticks * 2)) {
      const [tx] = polar(a, R);
      const t = s("text", { x: tx, y: 156, class: "g-ticklabel", "text-anchor": "middle" });
      t.textContent = tickFormat(v);
      svg.append(t);
    }
  }
  const valueArc = s("path", { class: "g-value" });
  svg.append(valueArc);
  if (o.marker) {
    const a = angle(o.marker.value);
    const [x0, y0] = polar(a, R - 9), [x1, y1] = polar(a, R + 9);
    svg.append(s("line", { x1: x0, y1: y0, x2: x1, y2: y1, class: "g-marker" }));
  }
  const needle = s("g", { class: "g-needle" });
  needle.append(
    s("path", { d: `M${CX - 3},${CY} L${CX},${CY - (R - 8)} L${CX + 3},${CY} Z` }),
    s("circle", { cx: CX, cy: CY, r: 7, class: "g-hub" }));
  svg.append(needle);
  const readout = s("text", { x: CX, y: CY + 40, class: "g-readout", "text-anchor": "middle" });
  svg.append(readout);

  const draw = (v) => {
    const a = angle(v);
    needle.setAttribute("transform", `rotate(${a.toFixed(2)} ${CX} ${CY})`);
    valueArc.setAttribute("d", a - START < 0.5 ? "" : arcPath(START, a, R));
    readout.textContent = format(v);
  };

  const el = h("div", {
    class: "gauge", role: "meter", "aria-valuemin": String(min), "aria-valuemax": String(max),
    "aria-valuenow": String(value), "aria-valuetext": o.ariaLabel || `${label}: ${format(value)}`,
    "aria-label": label,
  },
    svg,
    h("div", { class: "gauge-label" }, label),
    o.context ? h("div", { class: "gauge-context" }, o.context) : null,
    o.marker ? h("div", { class: "gauge-key" }, h("span", { class: "g-marker-key", "aria-hidden": "true" }), o.marker.label) : null);

  // Sweep, timed from when this gauge id first started. If the home screen redraws mid-sweep (e.g. live
  // weather arriving), the rebuilt gauge picks the sweep up where it was instead of jumping to the end.
  const run = (t0) => {
    const frame = (now) => {
      const t = now - t0;
      if (t < UP) draw(min + (max - min) * easeInOut(t / UP));
      else if (t < UP + SETTLE) draw(max + (value - max) * easeOut((t - UP) / SETTLE));
      else return draw(value);
      if (el.isConnected || t < 50) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  };
  if (reducedMotion()) { draw(value); return el; }
  if (sweepStart.has(id)) {
    const t0 = sweepStart.get(id);
    if (performance.now() - t0 >= UP + SETTLE) { draw(value); return el; }
    draw(min);
    run(t0);
    return el;
  }
  draw(min);
  el._play = () => {
    if (sweepStart.has(id)) return;
    const t0 = performance.now();
    sweepStart.set(id, t0);
    run(t0);
  };
  io ??= new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) { io.unobserve(e.target); e.target._play?.(); }
    }
  }, { threshold: 0.6 });
  // Observe once attached; a gauge replaced before it ever reached the page doesn't count as having animated.
  requestAnimationFrame(() => { if (el.isConnected) io.observe(el); });
  return el;
}
