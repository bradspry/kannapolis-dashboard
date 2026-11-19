import * as Plot from "@observablehq/plot";
import { card, dataTable, legend, plotBase, h, showTip, hideTip } from "../ui.js";
import { tokens } from "../theme.js";
import { makeMap, bboxOf, firstLabelLayer } from "../maps.js";
import { num, usd, usdCompact, tickUsd } from "../format.js";

export function renderGrowth(property, boundaries, grid) {
  for (const id of ["area-chart", "value-history", "value-map", "neighborhoods"]) document.getElementById(id).hidden = false;
  if (!property) {
    card("annex", { title: "Property data not available yet", sub: "Run the data pipeline (python3 etl/run_all.py) to build it." });
    for (const id of ["area-chart", "value-history", "value-map", "neighborhoods"]) document.getElementById(id).hidden = true;
    return;
  }
  annexMap(property, boundaries);
  areaChart(property);
  valueHistory(property);
  valueMap(property, grid);
  neighborhoods(property);
}

const coverage = (p) => p.coverage_note;

function annexMap(property, boundaries) {
  const t = tokens();
  const hist = property.history.filter((r) => r.area_sqmi);
  const first = hist[0];
  const now = property.current;
  const { body, fig } = card("annex", {
    title: `The city has grown from ${first.area_sqmi.toFixed(0)} to ${now.area_sqmi.toFixed(0)} square miles since ${first.year}`,
    sub: "City limits over time. Each shade shows when an area became part of the city.",
    note: `${coverage(property)} Areas are approximate and computed from county GIS boundaries.`,
  });
  // The ETL keeps only a handful of snapshot years (plus "current"), oldest first; at most 6 bins.
  const steps = boundaries.features.map((b) => b.properties.year)
    .sort((a, b) => (a === "current" ? 1 : b === "current" ? -1 : a - b)).slice(-6);
  const ramp = [t.seq[6], t.seq[5], t.seq[4], t.seq[3], t.seq[2], t.seq[1]].slice(0, steps.length);
  const labelOf = (y) => (y === "current" ? "Today" : String(y));
  // Older on top: render newest (largest) first.
  const feats = steps.map((y, i) => {
    const f = boundaries.features.find((b) => b.properties.year === y);
    return { ...f, properties: { ...f.properties, step: i, label: labelOf(y) } };
  }).reverse();
  const fc = { type: "FeatureCollection", features: feats };
  const labels = steps.map(labelOf);
  body.append(legend(labels.map((l, i) => ({
    label: i === 0 ? `City by ${l}` : l === "Today" ? `Added after ${labels[i - 1]}` : `Added ${labels[i - 1]}–${l}`,
    color: ramp[i],
  }))));
  const el = h("div", { class: "map", id: "annex-map", role: "img", "aria-label": `Map of Kannapolis city limits from ${labels[0]} to today` });
  body.append(el);
  makeMap(el, { bounds: bboxOf(fc) }).then((map) => {
    map.addSource("b", { type: "geojson", data: fc });
    const colorExpr = ["match", ["get", "step"], ...ramp.flatMap((c, i) => [i, c]), t.seq[0]];
    for (const f of feats) {
      const id = `b-${f.properties.step}`;
      map.addLayer({ id, type: "fill", source: "b", filter: ["==", ["get", "step"], f.properties.step],
        paint: { "fill-color": colorExpr, "fill-opacity": 0.85 } }, firstLabelLayer(map));
    }
    map.addLayer({ id: "b-line", type: "line", source: "b", filter: ["==", ["get", "label"], "Today"],
      paint: { "line-color": t.text2, "line-width": 1 } }, firstLabelLayer(map));
  });
  fig.append(dataTable([
    { key: "year", label: "Year" },
    { key: "area_sqmi", label: "Area (sq mi)", num: true, format: (v) => v.toFixed(1) },
  ], [...hist, { year: "Today", area_sqmi: now.area_sqmi }]));
}

function lineCard(id, rows, key, { title, sub, note, fmt, tick }) {
  const t = tokens();
  const { body, fig } = card(id, { title, sub, note });
  const last = rows.at(-1);
  body.append(Plot.plot({
    ...plotBase(body.clientWidth || 500, { height: 230, marginLeft: 48 }),
    x: { label: null, tickFormat: "d", ticks: 6 },
    y: { label: null, grid: true, tickFormat: tick, ticks: 4, zero: true },
    marks: [
      Plot.gridY({ stroke: t.grid, strokeOpacity: 1, ticks: 4 }),
      Plot.ruleY([0], { stroke: t.baseline }),
      Plot.lineY(rows, { x: "year", y: key, stroke: t.series[0], strokeWidth: 2 }),
      Plot.dot([last], { x: "year", y: key, fill: t.series[0], r: 4.5, stroke: t.surface, strokeWidth: 2 }),
      Plot.text([last], { x: "year", y: key, text: (d) => fmt(d[key]), dy: -14, textAnchor: "end", fill: t.text, fontWeight: 600 }),
      Plot.ruleX(rows, Plot.pointerX({ x: "year", stroke: t.baseline })),
      Plot.dot(rows, Plot.pointerX({ x: "year", y: key, fill: t.series[0], r: 4.5, stroke: t.surface, strokeWidth: 2 })),
      Plot.tip(rows, Plot.pointerX({ x: "year", y: key, title: (d) => `${d.year}\n${fmt(d[key])}` })),
    ],
  }));
  fig.append(dataTable([{ key: "year", label: "Year" }, { key, label: title.split(" ")[0], num: true, format: fmt }], rows));
}

function areaChart(property) {
  const rows = property.history.filter((r) => r.area_sqmi);
  lineCard("area-chart", rows, "area_sqmi", {
    title: "Land area",
    sub: "Square miles inside city limits (Cabarrus County portion).",
    fmt: (v) => `${v.toFixed(1)} sq mi`,
    tick: (v) => `${v}`,
  });
}

function valueHistory(property) {
  const rows = property.history.filter((r) => r.total_value);
  if (!rows.length) { card("value-history", { title: "Property value history", sub: "Not available." }); return; }
  const first = rows[0], last = rows.at(-1);
  lineCard("value-history", rows, "total_value", {
    title: "Market value of parcels",
    sub: `Total county-assessed market value inside city limits, ${first.year}–${last.year} (not inflation-adjusted).`,
    note: "Jumps usually reflect county revaluations, not one-year price changes. Includes annexed land as the city grew.",
    fmt: (v) => usdCompact(v),
    tick: tickUsd,
  });
}

function quantileBreaks(values, n) {
  const s = [...values].sort((a, b) => a - b);
  return Array.from({ length: n - 1 }, (_, i) => s[Math.floor(((i + 1) / n) * s.length)]);
}
const niceRound = (v) => {
  const p = 10 ** Math.max(0, Math.floor(Math.log10(v)) - 1);
  return Math.round(v / p) * p;
};

function valueMap(property, grid) {
  const t = tokens();
  const { body, fig } = card("value-map", {
    title: "Where the property value is",
    sub: "Market value per acre of land (land plus buildings), on a grid of roughly 250-meter squares. Hover or tap a square for details.",
    note: `${coverage(property)} Squares with fewer than three parcels are hidden.`,
  });
  const vals = grid.features.map((f) => f.properties.value_per_acre);
  const breaks = quantileBreaks(vals, 6).map(niceRound);
  const ramp = t.seq.slice(1, 7); // 6 steps
  const labels = ramp.map((_, i) =>
    i === 0 ? `< ${usdCompact(breaks[0], 0)}` : i === ramp.length - 1 ? `${usdCompact(breaks.at(-1), 0)}+` : `${usdCompact(breaks[i - 1], 0)}–${usdCompact(breaks[i], 0)}`);
  const el = h("div", { class: "map", id: "value-map-el", role: "img", "aria-label": "Map of property value per acre across Kannapolis" });
  body.append(el);
  body.append(h("div", { class: "map-legend" }, h("span", {}, "Value per acre"),
    h("div", { class: "ramp" }, ramp.map((c) => h("span", { style: { background: c } }))),
    h("span", {}, `${labels[0]} … ${labels.at(-1)}`)));
  makeMap(el, { bounds: bboxOf(grid) }).then((map) => {
    map.addSource("g", { type: "geojson", data: grid });
    map.addLayer({ id: "g", type: "fill", source: "g",
      paint: { "fill-color": ["step", ["get", "value_per_acre"], ramp[0], ...breaks.flatMap((b, i) => [b, ramp[i + 1]])],
        "fill-opacity": 0.82, "fill-outline-color": t.surface } }, firstLabelLayer(map));
    map.on("mousemove", "g", (e) => {
      const p = e.features[0].properties;
      map.getCanvas().style.cursor = "pointer";
      showTip(e.originalEvent, `${usd(p.value_per_acre)} per acre`, [["Parcels", num(p.parcels)], ["Land area", `${p.acres} acres`]]);
    });
    map.on("mouseleave", "g", () => { map.getCanvas().style.cursor = ""; hideTip(); });
  });
  const c = property.current;
  fig.append(dataTable([{ key: "k", label: "Citywide (Cabarrus portion)" }, { key: "v", label: "Value", num: true }], [
    { k: "Parcels", v: num(c.parcels) },
    { k: "Improved parcels (with buildings)", v: num(c.improved_parcels) },
    { k: "Vacant parcels", v: num(c.vacant_parcels) },
    { k: "Total market value", v: usd(c.total_value) },
    { k: "Land value", v: usd(c.land_value) },
    { k: "Building value", v: usd(c.building_value) },
    { k: "Median parcel value", v: usd(c.median_value) },
    { k: "Parcel acres", v: num(c.parcel_acres) },
  ], "Show citywide totals"));
}

function neighborhoods(property) {
  const t = tokens();
  const rows = [...property.neighborhoods].sort((a, b) => b.median_value - a.median_value);
  const { body, fig } = card("neighborhoods", {
    title: "Typical property value by neighborhood",
    sub: "Median market value of improved parcels in the county's appraisal neighborhoods with the most parcels.",
    note: "Appraisal neighborhoods are areas the county assessor groups for valuation; they don't always match local neighborhood names.",
  });
  body.append(Plot.plot({
    ...plotBase(body.clientWidth || 700, { height: rows.length * 28 + 20, marginLeft: 190, marginRight: 72 }),
    x: { axis: null },
    y: { label: null, domain: rows.map((r) => r.name), tickSize: 0, padding: 0.3 },
    marks: [
      Plot.barX(rows, { x: "median_value", y: "name", fill: t.series[0], rx2: 4 }),
      Plot.text(rows, { x: "median_value", y: "name", text: (d) => usdCompact(d.median_value), dx: 6, textAnchor: "start", fill: t.text }),
      Plot.ruleX([0], { stroke: t.baseline }),
      Plot.tip(rows, Plot.pointerY({ x: "median_value", y: "name", title: (d) => `${d.name}\nMedian value: ${usd(d.median_value)}\nImproved parcels: ${num(d.parcels)}` })),
    ],
  }));
  fig.append(dataTable([
    { key: "name", label: "Neighborhood" },
    { key: "parcels", label: "Improved parcels", num: true, format: num },
    { key: "median_value", label: "Median value", num: true, format: usd },
  ], rows));
}
