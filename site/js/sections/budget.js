import * as Plot from "@observablehq/plot";
import { card, dataTable, legend, plotBase, segmentedBars, h, capInset } from "../ui.js";
import { tokens } from "../theme.js";
import { fy, num, pct, usd, usdCompact, tickUsd, signedPct } from "../format.js";

export function renderBudget(budget) {
  taxCalculator(budget);
  revenue(budget);
  spending(budget);
  gfGrowth(budget);
  funds(budget);
  taxRate(budget);
  taxBase(budget);
  debt(budget);
}

const latestRate = (b) => b.tax_rate_history.at(-1).rate_per_100;

function taxCalculator(budget) {
  const rate = latestRate(budget);
  const year = budget.tax_rate_history.at(-1).fiscal_year;
  const { body, fig } = card("tax-calc", {
    title: "What you pay the City",
    sub: `Kannapolis property tax is ${(rate * 100).toFixed(2)}¢ per $100 of assessed value (${fy(year)}).`,
  });
  const input = h("input", { id: "home-value", type: "text", inputmode: "numeric", value: "300,000", "aria-describedby": "calc-result" });
  const result = h("div", { class: "result", id: "calc-result" });
  const sub = h("div", { class: "result-sub" });
  const update = () => {
    const v = Number(String(input.value).replace(/[^0-9.]/g, "")) || 0;
    const tax = (v / 100) * rate;
    result.textContent = `${usd(tax)} / year`;
    sub.textContent = `about ${usd(tax / 12)} a month to the City of Kannapolis`;
  };
  input.addEventListener("input", update);
  input.addEventListener("blur", () => {
    const v = Number(String(input.value).replace(/[^0-9.]/g, ""));
    if (v) input.value = num(v);
  });
  body.append(h("div", { class: "calc" },
    h("label", { for: "home-value" }, "Your home's assessed value"),
    h("div", { class: "input-row" }, h("span", { "aria-hidden": "true" }, "$"), input),
    h("div", {}, result, sub)));
  update();
  fig.append(h("p", { class: "note" },
    "City tax only. Your bill also includes Cabarrus or Rowan County tax, and any fire or special district taxes. Look up your assessed value on your county's tax site."));
}

function revenue(budget) {
  const t = tokens();
  const year = Math.max(...budget.general_fund_revenue.map((r) => r.fiscal_year));
  const rows = budget.general_fund_revenue.filter((r) => r.fiscal_year === year);
  const total = rows.reduce((s, r) => s + r.amount, 0);
  const prop = rows.find((r) => r.source_type === "Property tax");
  const { body, fig } = card("revenue", {
    title: `${pct((100 * prop.amount) / total, 0)} of the General Fund comes from property tax`,
    sub: `Where the ${fy(year)} General Fund's money comes from.`,
    note: year === 2027 ? "Revenue lines in the FY27 ordinance add to $50,000 more than its printed total; they're shown as published." : null,
  });
  const colors = rows.map((_, i) => t.series[i]);
  body.append(legend(rows.map((r, i) => ({ label: r.source_type, color: colors[i] }))));
  body.append(segmentedBars([{
    name: fy(year),
    parts: rows.map((r, i) => ({ label: r.source_type, value: (100 * r.amount) / total, color: colors[i] })),
  }]));
  fig.append(dataTable([
    { key: "source_type", label: "Source" },
    { key: "amount", label: "Amount", num: true, format: usd },
    { key: "share", label: "Share", num: true, format: (v) => pct(v) },
  ], rows.map((r) => ({ ...r, share: (100 * r.amount) / total }))));
}

function spending(budget) {
  const t = tokens();
  const all = budget.general_fund_by_function;
  const years = [...new Set(all.map((r) => r.fiscal_year))].sort();
  const year = years.at(-1), first = years[0];
  const rows = all.filter((r) => r.fiscal_year === year).sort((a, b) => b.amount - a.amount);
  const prior = Object.fromEntries(all.filter((r) => r.fiscal_year === first).map((r) => [r.function, r.amount]));
  const total = rows.reduce((s, r) => s + r.amount, 0);
  const top = rows[0];
  const { body, fig } = card("spending", {
    title: `${top.function} is the biggest General Fund expense`,
    sub: `${fy(year)} adopted General Fund: ${usdCompact(total)}. Hover a bar for the change since ${fy(first)}.`,
    note: "“Other” includes transfers to other funds (transit, environmental, separation pay) and non-departmental costs.",
  });
  const w = body.clientWidth || 700;
  body.append(Plot.plot({
    ...plotBase(w, { height: rows.length * 38 + 20, marginLeft: 150, marginRight: 80 }),
    x: { axis: null },
    y: { label: null, domain: rows.map((r) => r.function), tickSize: 0, padding: 0.3 },
    marks: [
      Plot.barX(rows, { x: "amount", y: "function", fill: t.series[0], rx2: 4 }),
      Plot.text(rows, { x: "amount", y: "function", text: (d) => usdCompact(d.amount), dx: 6, textAnchor: "start", fill: t.text }),
      Plot.ruleX([0], { stroke: t.baseline }),
      Plot.tip(rows, Plot.pointerY({ x: "amount", y: "function", title: (d) => {
        const p = prior[d.function];
        return `${d.function}\n${fy(year)}: ${usd(d.amount)}\nShare: ${pct((100 * d.amount) / total)}\n${fy(first)}: ${usd(p)} (${signedPct((100 * (d.amount - p)) / p)})`;
      } })),
    ],
  }));
  fig.append(dataTable(
    [{ key: "function", label: "Function" }, ...years.map((y) => ({ key: y, label: fy(y), num: true, format: usd }))],
    rows.map((r) => ({ function: r.function, ...Object.fromEntries(years.map((y) => [y, all.find((a) => a.fiscal_year === y && a.function === r.function)?.amount])) })),
  ));
}

function gfGrowth(budget) {
  const t = tokens();
  const totals = Object.values(budget.general_fund_by_function.reduce((acc, r) => {
    (acc[r.fiscal_year] ??= { year: r.fiscal_year, total: 0 }).total += r.amount;
    return acc;
  }, {})).sort((a, b) => a.year - b.year);
  const first = totals[0], last = totals.at(-1);
  const { body, fig } = card("gf-growth", {
    title: `General Fund up ${signedPct((100 * (last.total - first.total)) / first.total).slice(1)} since ${fy(first.year)}`,
    sub: "Adopted General Fund budget by fiscal year (not inflation-adjusted).",
  });
  const gw = body.clientWidth || 500;
  const gInset = capInset(gw, totals.length, { marginLeft: 52, padding: 0.35 });
  body.append(Plot.plot({
    ...plotBase(gw, { height: 230, marginLeft: 52 }),
    x: { label: null, domain: totals.map((d) => d.year), tickFormat: fy, padding: 0.35 },
    y: { label: null, grid: true, tickFormat: tickUsd, ticks: 4 },
    marks: [
      Plot.gridY({ stroke: t.grid, strokeOpacity: 1, ticks: 4 }),
      Plot.barY(totals, { x: "year", y: "total", fill: t.series[0], ry2: 4, insetLeft: gInset, insetRight: gInset }),
      Plot.text([last], { x: "year", y: "total", text: (d) => usdCompact(d.total), dy: -10, fill: t.text, fontWeight: 600 }),
      Plot.ruleY([0], { stroke: t.baseline }),
      Plot.tip(totals, Plot.pointerX({ x: "year", y: "total", title: (d) => `${fy(d.year)}\n${usd(d.total)}` })),
    ],
  }));
  fig.append(dataTable([{ key: "year", label: "Fiscal year", format: fy }, { key: "total", label: "General Fund", num: true, format: usd }], totals));
}

function funds(budget) {
  const t = tokens();
  const rows = [...budget.funds_fy2027].sort((a, b) => b.amount - a.amount);
  const { body, fig } = card("funds", {
    title: `The full FY27 budget: ${usdCompact(budget.headline.total_budget_fy2027)}`,
    sub: "Beyond the General Fund, utilities and services run as separate funds paid mostly by fees.",
    note: "Fund amounts add to more than the headline total because some money moves between funds and is counted twice.",
  });
  body.append(Plot.plot({
    ...plotBase(body.clientWidth || 500, { height: rows.length * 34 + 16, marginLeft: 160, marginRight: 64 }),
    x: { axis: null },
    y: { label: null, domain: rows.map((r) => r.fund), tickSize: 0, padding: 0.3 },
    marks: [
      Plot.barX(rows, { x: "amount", y: "fund", fill: t.series[0], rx2: 4 }),
      Plot.text(rows, { x: "amount", y: "fund", text: (d) => usdCompact(d.amount), dx: 6, textAnchor: "start", fill: t.text }),
      Plot.ruleX([0], { stroke: t.baseline }),
      Plot.tip(rows, Plot.pointerY({ x: "amount", y: "fund", title: (d) => `${d.fund}\n${usd(d.amount)}\n${d.description}` })),
    ],
  }));
  fig.append(dataTable([{ key: "fund", label: "Fund" }, { key: "description", label: "Pays for" }, { key: "amount", label: "FY27", num: true, format: usd }], rows));
}

function taxRate(budget) {
  const t = tokens();
  const rows = budget.tax_rate_history.map((r) => ({ year: r.fiscal_year, cents: +(r.rate_per_100 * 100).toFixed(2) }));
  const { body, fig } = card("tax-rate", {
    title: "The tax rate fell in 2025 after a revaluation",
    sub: "City property tax rate, cents per $100 of assessed value.",
    note: "When the county reappraises property and values jump, the City can lower the rate and still collect more. FY25 followed a Cabarrus revaluation.",
  });
  body.append(Plot.plot({
    ...plotBase(body.clientWidth || 500, { height: 230, marginLeft: 40 }),
    x: { label: null, tickFormat: "d", ticks: 6 },
    y: { label: null, grid: true, domain: [0, 70], ticks: 4, tickFormat: (v) => `${v}¢` },
    marks: [
      Plot.gridY({ stroke: t.grid, strokeOpacity: 1, ticks: 4 }),
      Plot.ruleY([0], { stroke: t.baseline }),
      Plot.lineY(rows, { x: "year", y: "cents", stroke: t.series[0], strokeWidth: 2, curve: "step-after" }),
      Plot.dot([rows.at(-1)], { x: "year", y: "cents", fill: t.series[0], r: 4.5, stroke: t.surface, strokeWidth: 2 }),
      Plot.text([rows.at(-1)], { x: "year", y: "cents", text: (d) => `${d.cents}¢`, dy: 16, textAnchor: "end", fill: t.text, fontWeight: 600 }),
      Plot.ruleX(rows, Plot.pointerX({ x: "year", stroke: t.baseline })),
      Plot.tip(rows, Plot.pointerX({ x: "year", y: "cents", title: (d) => `${fy(d.year)}\n${d.cents}¢ per $100` })),
    ],
  }));
  fig.append(dataTable([{ key: "year", label: "Fiscal year", format: fy }, { key: "cents", label: "Cents per $100", num: true }], rows));
}

function taxBase(budget) {
  const t = tokens();
  const rows = budget.tax_rate_history.filter((r) => r.assessed_value).map((r) => ({
    year: r.fiscal_year, value: r.assessed_value, note: r.note }));
  const first = rows[0], last = rows.at(-1);
  const { body, fig } = card("tax-base", {
    title: `Taxable property is worth ${usdCompact(last.value)}`,
    sub: `Total assessed value across the whole city, up from ${usdCompact(first.value)} in ${fy(first.year)}.`,
    note: `${fy(last.year)} is the City's estimate in the adopted budget. Jumps line up with county revaluations.`,
  });
  body.append(Plot.plot({
    ...plotBase(body.clientWidth || 500, { height: 230, marginLeft: 48 }),
    x: { label: null, tickFormat: "d", ticks: 6 },
    y: { label: null, grid: true, tickFormat: tickUsd, ticks: 4 },
    marks: [
      Plot.gridY({ stroke: t.grid, strokeOpacity: 1, ticks: 4 }),
      Plot.ruleY([0], { stroke: t.baseline }),
      Plot.areaY(rows, { x: "year", y: "value", fill: t.series[0], fillOpacity: 0.1 }),
      Plot.lineY(rows, { x: "year", y: "value", stroke: t.series[0], strokeWidth: 2 }),
      Plot.ruleX(rows, Plot.pointerX({ x: "year", stroke: t.baseline })),
      Plot.dot(rows, Plot.pointerX({ x: "year", y: "value", fill: t.series[0], r: 4.5, stroke: t.surface, strokeWidth: 2 })),
      Plot.tip(rows, Plot.pointerX({ x: "year", y: "value", title: (d) => `${fy(d.year)}\n${usd(d.value)}${d.note ? `\n${d.note}` : ""}` })),
    ],
  }));
  fig.append(dataTable([
    { key: "year", label: "Fiscal year", format: fy },
    { key: "value", label: "Assessed value", num: true, format: usd },
    { key: "note", label: "Note" },
  ], rows));
}

function debt(budget) {
  const t = tokens();
  const rows = budget.debt_history;
  const last = rows.at(-1);
  const peak = rows.reduce((a, b) => (b.total_debt > a.total_debt ? b : a));
  const used = (100 * last.net_debt_applicable) / last.debt_limit;
  const { body, fig } = card("debt", {
    title: `City debt is down ${usdCompact(peak.total_debt - last.total_debt, 0)} from its ${peak.fiscal_year} peak`,
    sub: `Outstanding debt at fiscal year end. ${fy(last.fiscal_year)}: ${usdCompact(last.total_debt)}, or ${usd(last.debt_per_capita)} per resident.`,
  });
  const series = [
    { key: "governmental_debt", label: "General city services", color: t.series[0] },
    { key: "business_debt", label: "Utilities (mainly water & sewer)", color: t.series[1] },
  ];
  body.append(legend(series.map((s) => ({ label: s.label, color: s.color }))));
  const long = rows.flatMap((r) => series.map((s) => ({ year: r.fiscal_year, type: s.label, amount: r[s.key], total: r.total_debt, perCap: r.debt_per_capita })));
  const dw = body.clientWidth || 700;
  const dInset = capInset(dw, rows.length, { marginLeft: 52, padding: 0.3 });
  body.append(Plot.plot({
    ...plotBase(dw, { height: 260, marginLeft: 52 }),
    x: { label: null, domain: rows.map((r) => r.fiscal_year), padding: 0.3, tickFormat: fy },
    y: { label: null, grid: true, tickFormat: tickUsd, ticks: 4 },
    color: { domain: series.map((s) => s.label), range: series.map((s) => s.color) },
    marks: [
      Plot.gridY({ stroke: t.grid, strokeOpacity: 1, ticks: 4 }),
      Plot.barY(long, Plot.stackY({ x: "year", y: "amount", fill: "type", insetTop: 1, insetBottom: 1, insetLeft: dInset, insetRight: dInset, order: series.map((s) => s.label) })),
      Plot.ruleY([0], { stroke: t.baseline }),
      Plot.tip(rows, Plot.pointerX({ x: "fiscal_year", y: "total_debt", title: (d) =>
        `${fy(d.fiscal_year)}\nTotal: ${usd(d.total_debt)}\nGeneral government: ${usd(d.governmental_debt)}\nUtilities: ${usd(d.business_debt)}\nPer resident: ${usd(d.debt_per_capita)}` })),
    ],
  }));
  const meter = h("div", { class: "meter", role: "meter", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": used.toFixed(1),
    "aria-label": "Share of legal debt limit used" }, h("span", { style: { width: `${used}%` } }));
  fig.append(h("div", { style: { marginTop: "16px", maxWidth: "520px" } },
    h("div", { style: { display: "flex", justifyContent: "space-between", fontSize: "14px" } },
      h("span", {}, "Share of the legal debt limit in use"), h("b", {}, pct(used))),
    meter,
    h("p", { class: "note", style: { marginTop: "4px" } },
      `North Carolina caps city debt at 8% of assessed value (${usdCompact(last.debt_limit)} for Kannapolis in ${fy(last.fiscal_year)}). ` +
      `Most City debt is limited-obligation bonds, revenue bonds and installment financing; the audit shows no voter-approved general obligation bonds outstanding in 2016–2025.`)));
  fig.append(dataTable([
    { key: "fiscal_year", label: "Fiscal year", format: fy },
    { key: "governmental_debt", label: "General government", num: true, format: usd },
    { key: "business_debt", label: "Utilities", num: true, format: usd },
    { key: "total_debt", label: "Total", num: true, format: usd },
    { key: "debt_per_capita", label: "Per resident", num: true, format: usd },
    { key: "legal_debt_margin", label: "Legal debt margin", num: true, format: usd },
  ], rows));
}
