// KANDEX, the Kannapolis-Area Index (Jobs tab): ten companies with a big presence around Kannapolis,
// from bradspry/kannapolis-stocks. Daily closes from Yahoo Finance; the composite is equal-weighted and
// compounds the average daily change from 1,000, the way kandex.py does.
import * as Plot from "@observablehq/plot";
import { h, fill, plotBase, dataTable } from "../ui.js";
import { tokens } from "../theme.js";

const ext = (href, label, cls) => h("a", { href, target: "_blank", rel: "noopener", class: cls }, label);
const parseDay = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
export const dayText = (s, o = { month: "short", day: "numeric" }) => parseDay(s).toLocaleDateString("en-US", o);
export const money = (v) => `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const pts = (v) => v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const sign = (v) => (v > 0.0005 ? "+" : v < -0.0005 ? "−" : "");
export const pctText = (v, d = 1) => (v == null ? "—" : `${sign(v)}${Math.abs(v).toFixed(d)}%`);
export const arrow = (v) => (v > 0.0005 ? "▲" : v < -0.0005 ? "▼" : "▶");
const cls = (v) => (v > 0.0005 ? "up" : v < -0.0005 ? "down" : "flat");

/** "▲ +1.4%", green up / red down, with the arrow so it never relies on color alone. */
export function change(v, d = 1, extra = "") {
  return h("span", { class: `kx-chg ${cls(v)}${extra ? ` ${extra}` : ""}` }, h("span", { "aria-hidden": "true" }, arrow(v)), ` ${pctText(v, d)}`);
}

export const latest = (s) => s.index.at(-1);
export const mood = (s) => (s.day_pct >= 0 ? "🐂📈" : "🐻📉");
export const sinceStart = (s) => (latest(s) / s.baseline - 1) * 100;
export const movers = (s) => [...s.companies].sort((a, b) => b.change_pct - a.change_pct);

/** The composite headline: value, today's change, as-of date. */
export function headline(s, { compact = false } = {}) {
  return h("div", { class: `kx-head${compact ? " compact" : ""}` },
    h("div", { class: "kx-value" }, h("b", {}, pts(latest(s))), h("small", {}, "Composite")),
    h("div", { class: "kx-day" }, change(s.day_pct, 2), h("small", { class: "tile-meta" }, `${dayText(s.as_of)} close · ${mood(s)}`)));
}

/** Company rows for tiles: symbol, name, price, day change. */
export function rows(s, n, { price = true, list = s.companies } = {}) {
  return h("ul", { class: "kx-rows", role: "list" }, list.slice(0, n).map((c) =>
    h("li", {}, h("b", { class: "kx-sym" }, c.symbol), h("span", { class: "kx-name" }, c.name),
      price ? h("span", { class: "kx-price" }, money(c.close)) : null, change(c.change_pct))));
}

function indexChart(s, width) {
  const t = tokens();
  const data = s.dates.map((d, i) => ({ date: parseDay(d), value: s.index[i] }));
  return Plot.plot({
    ...plotBase(width, { height: 240, marginLeft: 52 }),
    x: { label: null, type: "time", ticks: 6 },
    y: { label: null, grid: false, ticks: 5, tickFormat: (v) => v.toLocaleString("en-US") },
    marks: [
      Plot.gridY({ stroke: t.grid, strokeOpacity: 1, ticks: 5 }),
      Plot.ruleY([s.baseline], { stroke: t.baseline, strokeDasharray: "4 3" }),
      Plot.text([{ date: data.at(-1).date, value: s.baseline }], { x: "date", y: "value", text: () => "1,000 start", dy: 12, textAnchor: "end", fill: t.muted, fontSize: 11 }),
      Plot.areaY(data, { x: "date", y1: s.baseline, y2: "value", fill: t.series[0], fillOpacity: 0.1 }),
      Plot.lineY(data, { x: "date", y: "value", stroke: t.series[0], strokeWidth: 2 }),
      Plot.ruleX(data, Plot.pointerX({ x: "date", stroke: t.baseline })),
      Plot.dot(data, Plot.pointerX({ x: "date", y: "value", fill: t.series[0], r: 4.5, stroke: t.surface, strokeWidth: 2 })),
      Plot.tip(data, Plot.pointerX({ x: "date", y: "value", title: (d) => `${d.date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}\nKANDEX ${pts(d.value)}` })),
    ],
  });
}

/** A small inline price line for one company (no axes). */
export function spark(c, w = 96, hgt = 26) {
  const v = c.closes, min = Math.min(...v), max = Math.max(...v), span = max - min || 1;
  const d = v.map((x, i) => `${i ? "L" : "M"}${((w - 2) * i / (v.length - 1) + 1).toFixed(1)},${(hgt - 2 - (hgt - 4) * (x - min) / span).toFixed(1)}`).join("");
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${w} ${hgt}`);
  svg.setAttribute("class", `kx-spark ${cls(c.start_pct)}`);
  svg.setAttribute("aria-hidden", "true");
  const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
  p.setAttribute("d", d);
  svg.append(p);
  return svg;
}

export function renderStocks(s) {
  const root = document.getElementById("stocks-body");
  const chartBox = h("div", { class: "chart" });
  const since = sinceStart(s), best = movers(s)[0], worst = movers(s).at(-1);
  fill(root,
    h("section", { class: "card kx-hero" },
      headline(s),
      h("p", { class: "gem-p" }, `Together the ten companies are ${since >= 0 ? "up" : "down"} `, h("b", {}, pctText(Math.abs(since))),
        ` since the index started at 1,000 on ${dayText(s.dates[0], { month: "long", day: "numeric", year: "numeric" })}. `,
        `Best today: ${best.name} (${pctText(best.change_pct)}). Worst: ${worst.name} (${pctText(worst.change_pct)}).`)),
    h("figure", { class: "card" }, h("figcaption", {}, h("h3", {}, "KANDEX Composite"), h("p", { class: "sub" }, s.index_note)), chartBox,
      dataTable([{ key: "date", label: "Trading day", format: (d) => dayText(d, { month: "short", day: "numeric", year: "numeric" }) }, { key: "value", label: "KANDEX", num: true, format: pts }],
        s.dates.map((d, i) => ({ date: d, value: s.index[i] })).reverse())),
    h("section", { class: "card" }, h("h3", {}, "The ten companies"),
      h("div", { class: "table-wrap" }, h("table", { class: "kx-table" },
        h("thead", {}, h("tr", {}, ["Company", "Close", "Day", "Week", `Since ${dayText(s.dates[0])}`, ""].map((x, i) => h("th", { scope: "col", class: i && i < 5 ? "num" : null }, x)))),
        h("tbody", {}, s.companies.map((c) => h("tr", {},
          h("td", {}, ext(c.url, h("b", {}, c.symbol)), " ", c.name, c.about ? h("small", { class: "kx-about" }, c.about) : null),
          h("td", { class: "num" }, money(c.close)),
          h("td", { class: "num" }, change(c.change_pct)),
          h("td", { class: "num" }, change(c.week_pct)),
          h("td", { class: "num" }, change(c.start_pct)),
          h("td", {}, spark(c)))))))),
    h("p", { class: "note" }, "Companies and method from Brad Spry's ", ext(s.repo, "kannapolis-stocks"), " (kandex.py). ", s.disclaimer, " Read each weekday morning, so “today” is the last market close."));
  requestAnimationFrame(() => fill(chartBox, indexChart(s, chartBox.clientWidth || 600)));
}
