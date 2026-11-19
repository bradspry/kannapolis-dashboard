// Small DOM helpers shared by every section: card scaffolding, legends, data tables,
// segmented bars and a hover tooltip.
import { tokens } from "./theme.js";

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

/** Fill a <figure class="card"> with title/subtitle and return its parts. */
export function card(id, { title, sub, note }) {
  const fig = document.getElementById(id);
  fig.replaceChildren();
  const body = h("div", { class: "chart" });
  fig.append(
    h("figcaption", {}, h("h3", {}, title), sub ? h("p", { class: "sub" }, sub) : null),
    body,
  );
  if (note) fig.append(h("p", { class: "note" }, note));
  return { fig, body };
}

export function legend(items) {
  return h("ul", { class: "legend" },
    items.map(({ label, color, line }) =>
      h("li", {}, h("span", { class: `swatch${line ? " line" : ""}`, style: { background: color } }), label)));
}

/** <details> "Show data" table — the accessible / exact-value view of every chart. */
export function dataTable(columns, rows, summary = "Show data") {
  const table = h("table", {},
    h("thead", {}, h("tr", {}, columns.map((c) => h("th", { class: c.num ? "num" : null, scope: "col" }, c.label)))),
    h("tbody", {}, rows.map((r) => h("tr", {}, columns.map((c) =>
      h("td", { class: c.num ? "num" : null }, c.format ? c.format(r[c.key], r) : r[c.key]))))));
  return h("details", { class: "data" }, h("summary", {}, summary), h("div", { class: "table-wrap" }, table));
}

// ---------- tooltip ----------
const tip = () => document.getElementById("tooltip");
export function showTip(evt, title, rows) {
  const el = tip();
  el.replaceChildren(
    h("div", { class: "t-title" }, title),
    ...rows.map(([k, v]) => h("div", { class: "t-row" }, h("span", {}, k), h("b", {}, v))),
  );
  el.hidden = false;
  const pad = 14;
  const { innerWidth: W, innerHeight: H } = window;
  const r = el.getBoundingClientRect();
  let x = (evt.clientX ?? 0) + pad, y = (evt.clientY ?? 0) + pad;
  if (evt.clientX == null && evt.target?.getBoundingClientRect) {
    const b = evt.target.getBoundingClientRect();
    x = b.left; y = b.bottom + 6;
  }
  if (x + r.width > W - 8) x = Math.max(8, W - r.width - 8);
  if (y + r.height > H - 8) y = Math.max(8, (evt.clientY ?? y) - r.height - pad);
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
}
export function hideTip() { tip().hidden = true; }

/** Text color for a label sitting inside a colored fill (white, or near-black on yellow). */
export function inkOn(color) {
  const t = tokens();
  const c = color.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16) / 255);
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.55 ? "#0b0b0b" : (t.dark && lum > 0.6 ? "#0b0b0b" : "#ffffff");
}

/**
 * Tall segmented bar (one whole split into parts). rows: [{name, parts:[{label, value, color}]}]
 * Shares print inside a block only when they fit; hover/focus gives every part's name and share.
 */
export function segmentedBars(rows, { format = (v) => `${Math.round(v)}%` } = {}) {
  const wrap = h("div", {});
  for (const row of rows) {
    const total = row.parts.reduce((s, p) => s + (p.value || 0), 0);
    const bar = h("div", { class: "segbar", role: "img",
      "aria-label": `${row.name}: ${row.parts.map((p) => `${p.label} ${format(p.value)}`).join(", ")}` });
    for (const p of row.parts) {
      if (!p.value) continue;
      const share = (100 * p.value) / total;
      const seg = h("div", { class: "seg", tabindex: "0",
        style: { flex: `${p.value} 1 0`, background: p.color, color: inkOn(p.color) },
        "aria-label": `${p.label}: ${format(p.value)}` });
      const label = h("span", {}, format(p.value));
      seg.append(label);
      const show = (e) => showTip(e, p.label, [[row.name, format(p.value)]]);
      seg.addEventListener("pointermove", show);
      seg.addEventListener("focus", show);
      seg.addEventListener("pointerleave", hideTip);
      seg.addEventListener("blur", hideTip);
      seg.dataset.share = share;
      bar.append(seg);
    }
    wrap.append(h("div", { class: "segbar-row" }, h("span", { class: "name" }, row.name), bar));
  }
  // After layout: hide labels that don't fit their block (never clip).
  requestAnimationFrame(() => {
    wrap.querySelectorAll(".seg").forEach((seg) => {
      const span = seg.firstChild;
      span.style.visibility = span.scrollWidth + 10 > seg.clientWidth ? "hidden" : "visible";
    });
  });
  return wrap;
}

/** Inset (px, each side) that caps band-scale bars at `max` px thick. */
export function capInset(width, n, { marginLeft = 48, marginRight = 20, padding = 0.1, max = 24 } = {}) {
  const inner = width - marginLeft - marginRight;
  const step = inner / (n - padding + 2 * padding);
  const band = step * (1 - padding);
  return Math.max(0, (band - max) / 2);
}

/** Common Plot options so every chart shares the same quiet chrome. */
export function plotBase(width, extra = {}) {
  const t = tokens();
  return {
    width,
    style: { background: "transparent", color: t.axis, fontSize: "12px", fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif", overflow: "visible" },
    marginLeft: 48,
    ...extra,
  };
}

/** Round ☎ call and ✉ email buttons for a person (only for published numbers/addresses). */
export function contactButtons(p, who = p.name) {
  const btns = [
    p.phone ? h("a", { class: "contact-btn", href: `tel:${p.phone.replace(/[^0-9+]/g, "")}`, title: `Call ${p.phone}`, "aria-label": `Call ${who}, ${p.phone}` }, "☎") : null,
    p.email ? h("a", { class: "contact-btn", href: `mailto:${p.email}`, title: `Email ${p.email}`, "aria-label": `Email ${who}` }, "✉") : null,
  ].filter(Boolean);
  return btns.length ? h("span", { class: "contact-btns" }, btns) : null;
}
