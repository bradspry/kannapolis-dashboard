import * as Plot from "@observablehq/plot";
import { card, dataTable, legend, plotBase, segmentedBars, h } from "../ui.js";
import { tokens } from "../theme.js";
import { num, pct, usd, tickCompact, tickUsd } from "../format.js";

const GEOS = ["Kannapolis", "Cabarrus County", "North Carolina", "United States"];

export function renderPeople(census, budget) {
  document.getElementById("people-sub").textContent =
    `American Community Survey ${census.release} estimates (${census.years})`;
  popGrowth(budget);
  compare(census);
  composition("age", "Age", "Share of residents", census, "age");
  composition("race", "Race & ethnicity", "Share of residents; Hispanic or Latino of any race, other groups non-Hispanic", census, "race_ethnicity");
  composition("commute", "Getting to work", "How workers 16 and older usually commute", census, "commute");
  trend(census);
}

function popGrowth(budget) {
  const t = tokens();
  const rows = budget.debt_history.map((d) => ({ year: d.fiscal_year, population: d.population }));
  const first = rows[0], last = rows.at(-1);
  const growth = (100 * (last.population - first.population)) / first.population;
  const { body, fig } = card("pop-growth", {
    title: `Kannapolis grew ${growth.toFixed(0)}% in ten years`,
    sub: `Population rose from ${num(first.population)} in ${first.year} to ${num(last.population)} in ${last.year}.`,
    note: "Annual estimates as reported in the City's 2025 audited financial report (Table 14).",
  });
  const w = body.clientWidth || 600;
  body.append(Plot.plot({
    ...plotBase(w, { height: 240, marginLeft: 52 }),
    x: { label: null, tickFormat: "d", ticks: rows.map((r) => r.year).filter((y) => y % 2 === 1) },
    y: { label: null, grid: true, nice: true, tickFormat: tickCompact, ticks: 4 },
    marks: [
      Plot.gridY({ stroke: t.grid, strokeOpacity: 1, ticks: 4 }),
      Plot.lineY(rows, { x: "year", y: "population", stroke: t.series[0], strokeWidth: 2, curve: "monotone-x" }),
      Plot.dot([last], { x: "year", y: "population", fill: t.series[0], r: 4.5, stroke: t.surface, strokeWidth: 2 }),
      Plot.text([last], { x: "year", y: "population", text: (d) => num(d.population), dy: -14, fill: t.text, fontWeight: 600, textAnchor: "end" }),
      Plot.ruleX(rows, Plot.pointerX({ x: "year", stroke: t.baseline })),
      Plot.dot(rows, Plot.pointerX({ x: "year", y: "population", fill: t.series[0], r: 4.5, stroke: t.surface, strokeWidth: 2 })),
      Plot.tip(rows, Plot.pointerX({ x: "year", y: "population", title: (d) => `${d.year}\nPopulation: ${num(d.population)}` })),
    ],
  }));
  fig.append(dataTable([{ key: "year", label: "Year" }, { key: "population", label: "Population", num: true, format: num }], rows));
}

const METRICS = [
  { key: "median_household_income", label: "Median household income", fmt: usd, tick: tickUsd },
  { key: "median_home_value", label: "Median home value", fmt: usd, tick: tickUsd },
  { key: "median_gross_rent", label: "Median rent (monthly)", fmt: usd, tick: tickUsd },
  { key: "poverty_rate", label: "Living below poverty line", fmt: (v) => pct(v), tick: (v) => `${v}%` },
  { key: "bachelors_plus_pct", label: "Adults 25+ with a bachelor's degree", fmt: (v) => pct(v), tick: (v) => `${v}%` },
  { key: "owner_occupied_pct", label: "Homes that are owner-occupied", fmt: (v) => pct(v), tick: (v) => `${v}%` },
];

function compare(census) {
  const t = tokens();
  const { body, fig } = card("compare", {
    title: "How Kannapolis compares",
    sub: "Kannapolis (blue) next to the county, state and nation.",
  });
  const grid = h("div", { class: "compare-grid" });
  body.append(grid);
  const tableRows = [];
  for (const m of METRICS) {
    const rows = GEOS.map((g) => ({ geo: g, value: census.geographies[g]?.[m.key] })).filter((r) => r.value != null);
    const cell = h("div", {}, h("h4", {}, m.label));
    grid.append(cell);
    const w = Math.max(220, cell.clientWidth || 300);
    cell.append(Plot.plot({
      ...plotBase(w, { height: 4 * 30 + 10, marginLeft: 112, marginRight: 64, marginTop: 4, marginBottom: 4 }),
      x: { axis: null, domain: [0, Math.max(...rows.map((r) => r.value)) * 1.0] },
      y: { label: null, domain: GEOS, tickSize: 0, padding: 0.35 },
      marks: [
        Plot.barX(rows, { x: "value", y: "geo", fill: (d) => (d.geo === "Kannapolis" ? t.series[0] : t.mutedFill), rx2: 4 }),
        Plot.text(rows, { x: "value", y: "geo", text: (d) => m.fmt(d.value), dx: 6, textAnchor: "start",
          fill: (d) => (d.geo === "Kannapolis" ? t.text : t.text2), fontWeight: (d) => (d.geo === "Kannapolis" ? 600 : 400) }),
        Plot.ruleX([0], { stroke: t.baseline }),
      ],
    }));
    for (const r of rows) tableRows.push({ metric: m.label, geo: r.geo, value: m.fmt(r.value) });
  }
  const moe = census.city_moe || {};
  fig.append(h("p", { class: "note" },
    `Survey estimates have margins of error. For Kannapolis: household income ±${usd(moe.median_household_income)}, ` +
    `home value ±${usd(moe.median_home_value)}, rent ±${usd(moe.median_gross_rent)}. ${census.dollars_note}`));
  fig.append(dataTable([{ key: "metric", label: "Measure" }, { key: "geo", label: "Place" }, { key: "value", label: "Value", num: true }], tableRows));
}

function composition(id, title, sub, census, key) {
  const t = tokens();
  const { body, fig } = card(id, { title, sub });
  const cats = Object.keys(census.geographies.Kannapolis[key]);
  const colors = Object.fromEntries(cats.map((c, i) => [c, t.series[i]]));
  body.append(legend(cats.map((c) => ({ label: c, color: colors[c] }))));
  const geos = ["Kannapolis", "North Carolina"];
  body.append(segmentedBars(geos.map((g) => ({
    name: g,
    parts: cats.map((c) => ({ label: c, value: census.geographies[g][key][c], color: colors[c] })),
  }))));
  fig.append(dataTable(
    [{ key: "cat", label: "Group" }, ...geos.map((g) => ({ key: g, label: g, num: true, format: (v) => pct(v) }))],
    cats.map((c) => ({ cat: c, ...Object.fromEntries(geos.map((g) => [g, census.geographies[g][key][c]])) })),
  ));
}

function trend(census) {
  const fig = document.getElementById("census-trend");
  if (!census.trend?.length) { fig.hidden = true; return; }
  fig.hidden = false;
  const t = tokens();
  const rows = census.trend;
  const { body } = card("census-trend", {
    title: "Household income over time",
    sub: `Median household income across three non-overlapping survey periods (not inflation-adjusted).`,
  });
  body.append(Plot.plot({
    ...plotBase(body.clientWidth || 500, { height: 220 }),
    x: { label: null, domain: rows.map((r) => r.years), padding: 0.4 },
    y: { label: null, grid: true, tickFormat: tickUsd, ticks: 4 },
    marks: [
      Plot.gridY({ stroke: t.grid, strokeOpacity: 1, ticks: 4 }),
      Plot.barY(rows, { x: "years", y: "median_household_income", fill: t.series[0], ry2: 4, insetLeft: 8, insetRight: 8 }),
      Plot.text(rows, { x: "years", y: "median_household_income", text: (d) => usd(d.median_household_income), dy: -10, fill: t.text }),
      Plot.ruleY([0], { stroke: t.baseline }),
    ],
  }));
  fig.append(dataTable([
    { key: "years", label: "Survey years" },
    { key: "population", label: "Population", num: true, format: num },
    { key: "median_household_income", label: "Household income", num: true, format: usd },
    { key: "median_home_value", label: "Home value", num: true, format: usd },
    { key: "median_gross_rent", label: "Rent", num: true, format: usd },
    { key: "poverty_rate", label: "Poverty", num: true, format: (v) => pct(v) },
  ], rows));
}
