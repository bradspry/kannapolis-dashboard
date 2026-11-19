// Debt Service widget: every loan payment in the adopted FY27 budget, by fund, plus payoff dates.
import { h, dataTable, legend, showTip, hideTip } from "../ui.js";
import { tokens } from "../theme.js";
import { usd, usdCompact, pct } from "../format.js";
import { gauge } from "../gauge.js";

const FUNDS = [
  { key: "General Fund", label: "General Fund", paidBy: "paid mainly by property and sales taxes" },
  { key: "Water and Sewer Fund", label: "Water & Sewer", paidBy: "paid by water and sewer bills" },
  { key: "Stormwater Fund", label: "Stormwater", paidBy: "paid by stormwater fees" },
];
const POLICY_CAP = 15; // City debt policy: GF debt service ≤ 15% of GF spending (FY27 budget p.48)
const FY_START = new Date(2026, 6, 1);

const parseDate = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const monthYear = (d) => d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
const total = (i) => i.principal + i.interest + i.other;
// Budgeted but no longer needed (e.g. parks GO bond costs after voters rejected the bond).
const unused = (i) => /won't be needed/i.test(i.note || "");

export function renderDebtService(budget) {
  const items = budget.debt_service_fy2027;
  if (!items?.length) return;
  const src = budget.sources.fy27_budget;
  const t = tokens();
  const parts = [
    { key: "principal", label: "Principal (paying down the loan)", short: "Principal", color: t.series[0] },
    { key: "interest", label: "Interest", short: "Interest", color: t.series[1] },
    { key: "other", label: "Issuance costs for new borrowing", short: "Issuance costs", color: t.series[2] },
  ];
  const byFund = FUNDS.map((f) => {
    const rows = items.filter((i) => i.fund === f.key);
    return { ...f, rows, total: rows.reduce((s, i) => s + total(i), 0) };
  });
  const grand = byFund.reduce((s, f) => s + f.total, 0);
  const gf = byFund[0];
  const gfSpending = budget.funds_fy2027.find((f) => f.fund === "General Fund")?.amount;
  const gfShare = gfSpending ? (100 * gf.total) / gfSpending : null;
  const sum = (k) => items.reduce((s, i) => s + i[k], 0);

  // ---------- tiles ----------
  document.getElementById("ds-tiles").replaceChildren(
    tile("Total debt service, FY27", usdCompact(grand),
      `${pct((100 * grand) / budget.headline.total_budget_fy2027)} of the ${usdCompact(budget.headline.total_budget_fy2027)} budget · ${usdCompact(sum("interest"))} is interest`),
    ...byFund.map((f) => tile(f.label, usdCompact(f.total),
      f === gf && gfShare != null ? `${pct(gfShare)} of General Fund spending · ${f.paidBy}` : f.paidBy)),
  );

  // ---------- payments card ----------
  const max = Math.max(...items.map(total));
  const pay = document.getElementById("ds-payments");
  pay.replaceChildren(
    h("figcaption", {},
      h("h3", {}, `${usdCompact(grand)} in debt payments this year`),
      h("p", { class: "sub" }, `Every loan payment and borrowing cost in the adopted FY27 budget. The biggest single payment is the ballpark (${usdCompact(total(gf.rows[0]))}).`)),
    legend(parts.map((p) => ({ label: p.label, color: p.color }))),
    ...byFund.map((f) => {
      const active = f.rows.filter((i) => total(i) > 0).sort((a, b) => total(b) - total(a));
      return h("section", { class: "ds-fund" },
        h("div", { class: "ds-fund-head" },
          h("h4", {}, f.label), h("span", {}, `${usd(f.total)} · ${f.paidBy}`)),
        h("ul", { class: "ds-rows", role: "list" }, active.map((i) => payRow(i, parts, max))));
    }),
    h("p", { class: "note" }, ...notesFor(items, budget.sources)),
  );
  pay.append(dataTable([
    { key: "fund", label: "Fund" },
    { key: "name", label: "Debt" },
    { key: "project", label: "Pays for" },
    { key: "principal", label: "Principal", num: true, format: usd },
    { key: "interest", label: "Interest", num: true, format: usd },
    { key: "other", label: "Other", num: true, format: usd },
    { key: "total", label: "Total", num: true, format: usd },
    { key: "maturity", label: "Final payment", format: (v) => (v ? monthYear(parseDate(v)) : "—") },
    { key: "note", label: "Note", format: (v) => v || "" },
  ], [...items.map((i) => ({ ...i, total: total(i) })),
     { fund: "All funds", name: "Total", project: "", principal: sum("principal"), interest: sum("interest"), other: sum("other"), total: grand }],
  "Show the full schedule"));

  // ---------- payoff card ----------
  const loans = items.filter((i) => i.maturity && total(i) > 0 && parseDate(i.maturity) >= FY_START)
    .map((i) => ({ ...i, _d: parseDate(i.maturity) })).sort((a, b) => a._d - b._d);
  const last = loans.at(-1);
  const span = last._d - FY_START;
  const payoff = document.getElementById("ds-payoff");
  payoff.replaceChildren(
    h("figcaption", {},
      h("h3", {}, `Current loans run until ${last._d.getFullYear()}`),
      h("p", { class: "sub" }, "When each loan's final payment is due, from July 2026.")),
    h("ul", { class: "ds-payoff", role: "list" }, loans.map((i) =>
      h("li", {},
        h("div", { class: "ds-payoff-label" },
          h("span", {}, i.project), h("b", {}, i._d.getFullYear())),
        h("div", { class: "ds-track", "aria-hidden": "true" },
          h("span", { style: { width: `${Math.max(2, (100 * (i._d - FY_START)) / span)}%` } })),
        h("span", { class: "visually-hidden" }, `${i.name}, ${FUNDS.find((f) => f.key === i.fund).label}: final payment ${monthYear(i._d)}`)))),
    h("p", { class: "note" }, "Loans being repaid in FY27; planned new borrowing isn't included. Several downtown and water-plant loans share final dates."),
  );

  // ---------- policy card ----------
  const policy = document.getElementById("ds-policy");
  if (gfShare == null) { policy.hidden = true; return; }
  const scaleMax = 20;
  policy.replaceChildren(
    h("figcaption", {},
      h("h3", {}, gfShare <= POLICY_CAP ? "Just inside the City's own debt limit" : "Above the City's own debt limit"),
      h("p", { class: "sub" }, `City policy says General Fund debt payments should not exceed ${POLICY_CAP}% of General Fund spending.`)),
    gauge({ id: "g-ds-policy", label: "General Fund spending that goes to debt", value: gfShare, max: scaleMax,
      zones: [{ from: POLICY_CAP, to: scaleMax }], format: (v) => pct(v), tickFormat: (v) => `${Math.round(v)}%`,
      context: `${usdCompact(gf.total)} of ${usdCompact(gfSpending)} · red = above the ${POLICY_CAP}% policy cap` }),
    h("p", { class: "note" },
      "Water & Sewer and Stormwater debt is repaid from utility fees, not taxes, and has separate rules (bond covenants on revenue coverage). ",
      `Source: ${src ? "FY27 adopted budget, Debt Management Policy (p. 48)" : "FY27 adopted budget"}.`),
  );
}

function tile(label, value, context) {
  return h("div", { class: "tile" }, h("div", { class: "label" }, label), h("div", { class: "value" }, value), h("div", { class: "context" }, context));
}

function payRow(i, parts, max) {
  const tot = total(i);
  const tipRows = [
    ...parts.filter((p) => i[p.key]).map((p) => [p.short, usd(i[p.key])]),
    ["Total", usd(tot)],
    ...(i.maturity ? [["Final payment", monthYear(parseDate(i.maturity))]] : []),
  ];
  const show = (e) => showTip(e, `${i.project} (${i.name})`, i.note ? [...tipRows, ["Note", i.note]] : tipRows);
  const bar = h("div", { class: "ds-bar", style: { width: `${(100 * tot) / max}%` } },
    parts.filter((p) => i[p.key] > 0).map((p) => h("span", { style: { flex: `${i[p.key]} 1 0`, background: unused(i) ? "transparent" : p.color, outline: unused(i) ? `1.5px dashed ${p.color}` : null, outlineOffset: "-1.5px" } })));
  return h("li", {
    class: "ds-row", tabindex: "0",
    "aria-label": `${i.project}, ${i.name}: ${tipRows.map(([k, v]) => `${k} ${v}`).join(", ")}${i.note ? `. ${i.note}` : ""}`,
    onmousemove: show, onmouseleave: hideTip, onfocus: (e) => {
      const r = e.currentTarget.getBoundingClientRect();
      show({ clientX: r.left + 24, clientY: r.bottom });
    }, onblur: hideTip,
  },
    h("div", { class: "ds-row-label" },
      h("span", { class: "ds-project" }, i.project, i.kind === "Planned" ? h("span", { class: `ds-tag${unused(i) ? " unused" : ""}` }, unused(i) ? "Won't be needed" : "Planned") : null),
      h("span", { class: "ds-amount" }, usdCompact(tot))),
    h("div", { class: "ds-row-sub" }, i.kind === "Planned" ? (i.note || "") : `${i.name} · ${i.kind}`),
    h("div", { class: "ds-track" }, bar));
}

function notesFor(items, sources = {}) {
  const zero = items.filter((i) => total(i) === 0);
  const gone = items.filter(unused);
  const out = [
    "Adopted FY27 budget (July 2026 – June 2027); the totals match the budget ordinance exactly. Hover or tap a row for details.",
  ];
  const vote = sources.ncsbe_2026_parks_bond;
  if (gone.length) out.push(` Dashed bars are still in the adopted budget but won't be needed: ${gone.map((i) => `${usdCompact(total(i))} for ${i.project.toLowerCase()}`).join("; ")}, because voters rejected the parks bond on Nov 3, 2026 (`,
    vote ? h("a", { href: vote.url, target: "_blank", rel: "noopener" }, "No 10,134 to Yes 7,534, NC State Board of Elections") : "NC State Board of Elections", ").");
  if (zero.length) out.push(` Not shown because nothing is due in FY27: ${zero.map((i) => `${i.name} (${(i.note || "no payment").replace(/^./, (c) => c.toLowerCase())})`).join("; ")}.`);
  return out;
}
