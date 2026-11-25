// Homeless Students (City tab): students identified as homeless under the McKinney-Vento Act in the three school
// districts around Kannapolis, from bradspry/kannapolis-mckinney-vento (federal EDFacts data, ~2-year lag).
import * as Plot from "@observablehq/plot";
import { h, fill, plotBase, dataTable, legend } from "../ui.js";
import { tokens } from "../theme.js";

const ext = (href, label, cls) => h("a", { href, target: "_blank", rel: "noopener", class: cls }, label);
export const HOMELESS_COLOR = "#8a5cd6";
const n0 = (v) => (v == null ? "—" : Math.round(v).toLocaleString("en-US"));
export const syShort = (y) => `${y.slice(0, 4)}–${y.slice(7, 9)}`; // "2022-2023" -> "2022–23"
const pctChange = (a, b) => (a && b != null ? Math.round((100 * (b - a)) / a) : null);

export const latestOf = (d) => d.years.filter((y) => y.students != null).at(-1);
export const firstOf = (d) => d.years.find((y) => y.students != null);
export const colorsOf = () => { const t = tokens(); return [t.series[0], t.series[1], t.series[2]]; };

/** One district line for tiles: name, students, per 1,000 enrolled. */
export function districtRows(hm, { rate = true } = {}) {
  const c = colorsOf();
  return h("ul", { class: "hm-rows", role: "list" }, hm.districts.map((d, i) => {
    const y = latestOf(d);
    return h("li", {}, h("i", { class: "hm-key", style: { background: c[i] }, "aria-hidden": "true" }), h("span", { class: "hm-name" }, d.short),
      h("b", {}, n0(y.students)), rate ? h("small", {}, `${y.per_1000_enrolled} per 1,000`) : null);
  }));
}

/** "Kannapolis: 196 → 105 since 2010–11 (−46%)". */
export function changeLine(d) {
  const a = firstOf(d), b = latestOf(d), p = pctChange(a.students, b.students);
  return `${n0(a.students)} → ${n0(b.students)} since ${syShort(a.year)} (${p > 0 ? "+" : p < 0 ? "−" : ""}${Math.abs(p)}%)`;
}

const tel = (p) => h("a", { href: `tel:+1${p.replace(/\D/g, "")}` }, p);

/** "Who To Call": each district's McKinney-Vento liaison, plus the state helpline. */
export function contacts(hm) {
  const c = colorsOf();
  return h("section", { class: "card hm-help" }, h("h3", {}, "Who To Call"),
    h("p", { class: "tile-meta" }, "A family that has lost its housing, or a student on their own, can call their district's liaison directly. The school's counselor or social worker can also connect them. Calls are confidential."),
    h("ul", { class: "hm-contacts", role: "list" }, hm.districts.filter((d) => d.liaison).map((d, i) => {
      const l = d.liaison;
      return h("li", {}, h("div", { class: "bb-next-label" }, h("i", { class: "hm-key", style: { background: c[i] }, "aria-hidden": "true" }), d.name),
        h("b", {}, l.name), h("div", { class: "tile-meta" }, l.title),
        h("div", {}, tel(l.phone)), h("div", {}, h("a", { href: `mailto:${l.email}` }, l.email)),
        h("div", {}, ext(l.page, "District McKinney-Vento page")));
    })),
    hm.helpline ? h("p", { class: "tile-meta" }, `${hm.helpline.name}: `, tel(hm.helpline.phone), ". Contacts checked ",
      new Date(`${hm.contacts_checked}T12:00`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }), "; the state keeps a ",
      ext(hm.links.directory, "list of every district's liaison"), ".") : null);
}

/** Small multi-line chart (no axes text beyond years) for tiles: per 1,000 enrolled. */
export function miniChart(hm, width, height, { key = "per_1000_enrolled" } = {}) {
  const t = tokens(), c = colorsOf();
  const data = hm.districts.flatMap((d, i) => d.years.filter((y) => y[key] != null).map((y) => ({ d: d.short, i, x: y.start, v: y[key] })));
  return Plot.plot({
    ...plotBase(width, { height, marginLeft: 28, marginRight: 8, marginTop: 8, marginBottom: 20 }),
    x: { label: null, tickFormat: (v) => `’${String(v).slice(2)}`, ticks: 4 },
    y: { label: null, ticks: 3, grid: false },
    color: { domain: hm.districts.map((d) => d.short), range: c },
    marks: [
      Plot.gridY({ stroke: t.grid, strokeOpacity: 1, ticks: 3 }),
      Plot.rectX(hm.covid_years.map((y) => ({ x1: +y.slice(0, 4) - 0.5, x2: +y.slice(0, 4) + 0.5 })), { x1: "x1", x2: "x2", fill: t.muted, fillOpacity: 0.1 }),
      Plot.lineY(data, { x: "x", y: "v", stroke: "d", strokeWidth: 2 }),
      Plot.dot(data.filter((r, j, a) => !a[j + 1] || a[j + 1].i !== r.i), { x: "x", y: "v", fill: "d", r: 3.5, stroke: t.surface, strokeWidth: 1.5 }),
    ],
  });
}

function bigChart(hm, width, key, { withState = false, fmt = n0, labels = true } = {}) {
  const t = tokens(), c = colorsOf();
  const names = [...hm.districts.map((d) => d.short), ...(withState ? ["North Carolina"] : [])];
  const data = hm.districts.flatMap((d) => d.years.filter((y) => y[key] != null).map((y) => ({ d: d.short, x: y.start, year: y.year, v: y[key] })));
  if (withState) data.push(...hm.state.filter((y) => y[key] != null).map((y) => ({ d: "North Carolina", x: y.start, year: y.year, v: y[key] })));
  const ends = names.map((n) => data.filter((r) => r.d === n).at(-1)).filter(Boolean);
  return Plot.plot({
    ...plotBase(width, { height: 260, marginLeft: 44, marginRight: labels ? 110 : 16 }),
    x: { label: null, tickFormat: (v) => syShort(`${v}-${v + 1}`), ticks: 6 },
    y: { label: null, ticks: 5, grid: false, zero: true },
    color: { domain: names, range: [...c, t.muted] },
    marks: [
      Plot.gridY({ stroke: t.grid, strokeOpacity: 1, ticks: 5 }),
      Plot.rectX(hm.covid_years.map((y) => ({ x1: +y.slice(0, 4) - 0.5, x2: +y.slice(0, 4) + 0.5 })), { x1: "x1", x2: "x2", fill: t.muted, fillOpacity: 0.1 }),
      Plot.ruleY([0], { stroke: t.baseline }),
      Plot.lineY(data, { x: "x", y: "v", stroke: "d", strokeWidth: 2, strokeDasharray: (r) => (r.d === "North Carolina" ? "5 4" : null) }),
      labels ? Plot.text(ends, { x: "x", y: "v", text: "d", dx: 8, textAnchor: "start", fill: t.text2, fontSize: 12 }) : null,
      Plot.ruleX(data, Plot.pointerX({ x: "x", stroke: t.baseline })),
      Plot.dot(data, Plot.pointerX({ x: "x", y: "v", fill: "d", r: 4.5, stroke: t.surface, strokeWidth: 2 })),
      Plot.tip(data, Plot.pointerX({ x: "x", y: "v", title: (r) => `${r.d}, ${syShort(r.year)}\n${fmt(r.v)}` })),
    ],
  });
}

export function renderHomeless(hm) {
  const root = document.getElementById("homeless-body");
  const t = tokens(), c = colorsOf();
  const k = hm.districts[0], ky = latestOf(k);
  const nc = hm.state.at(-1);
  const counts = h("div", { class: "chart" }), rates = h("div", { class: "chart" });
  const res = Object.entries(nc.residence).filter(([, v]) => v != null).sort((a, b) => b[1] - a[1]);
  const resTotal = res.reduce((s, [, v]) => s + v, 0);
  fill(root,
    h("section", { class: "card hm-hero" },
      h("div", { class: "hm-hero-grid" }, hm.districts.map((d, i) => {
        const y = latestOf(d);
        return h("div", { class: "hm-stat" }, h("div", { class: "bb-next-label" }, h("i", { class: "hm-key", style: { background: c[i] }, "aria-hidden": "true" }), d.name),
          h("div", { class: "hm-big" }, n0(y.students), h("small", {}, " students")),
          h("div", { class: "tile-meta" }, `${y.per_1000_enrolled} per 1,000 enrolled · ${syShort(y.year)}`),
          h("div", { class: "tile-meta" }, changeLine(d)));
      })),
      h("p", { class: "gem-p" }, "Under the federal McKinney-Vento Act, a student is homeless if they lack a fixed, regular and adequate place to sleep at night: sharing someone else's home because they lost theirs (“doubled-up”), living in a motel, a shelter, a car or outdoors. Every district has a McKinney-Vento liaison who can help with enrollment, transportation to their school and meals.")),
    contacts(hm),
    h("figure", { class: "card" }, h("figcaption", {}, h("h3", {}, "Homeless students by school year"), h("p", { class: "sub" }, "Counted if homeless and enrolled at any point in the year. Shaded: 2019–21, when remote school made students harder to identify.")),
      counts, legend(hm.districts.map((d, i) => ({ label: d.name, color: c[i], line: true })))),
    h("figure", { class: "card" }, h("figcaption", {}, h("h3", {}, "Per 1,000 students enrolled"), h("p", { class: "sub" }, `${hm.districts.map((d) => `${d.short}: ${firstOf(d).per_1000_enrolled} → ${latestOf(d).per_1000_enrolled}`).join(" · ")} since ${syShort(firstOf(k).year)}. The dashed line is North Carolina.`)),
      rates, legend([...hm.districts.map((d, i) => ({ label: d.short, color: c[i], line: true })), { label: "North Carolina", color: t.muted, line: true }])),
    h("section", { class: "card" }, h("h3", {}, `Where they slept: North Carolina, ${syShort(nc.year)}`),
      h("p", { class: "tile-meta" }, "Federal data gives this for the state only, not by district."),
      h("ul", { class: "hm-res" }, res.map(([name, v]) => h("li", {}, h("span", {}, name), h("span", { class: "hm-bar" }, h("i", { style: { width: `${(100 * v) / res[0][1]}%` } })),
        h("b", {}, `${Math.round((100 * v) / resTotal)}%`), h("small", {}, n0(v)))))),
    dataTable([{ key: "year", label: "School year", format: syShort }, ...hm.districts.flatMap((d) => [
      { key: `${d.leaid}n`, label: `${d.short}`, num: true, format: n0 }, { key: `${d.leaid}r`, label: "per 1,000", num: true }]),
    { key: "nc", label: "NC", num: true, format: n0 }],
    hm.districts[0].years.map((y, j) => ({ year: y.year, nc: hm.state.find((s) => s.year === y.year)?.students,
      ...Object.fromEntries(hm.districts.flatMap((d) => [[`${d.leaid}n`, d.years[j]?.students], [`${d.leaid}r`, d.years[j]?.per_1000_enrolled ?? "—"]])) })).reverse(), "Show every year"),
    h("p", { class: "note" }, "From Brad Spry's ", ext(hm.repo, "kannapolis-mckinney-vento"), ": ", ext(hm.links.edx, "ED Data Express"),
      " (U.S. Department of Education, EDFacts file 118), with enrollment from the NCES Common Core of Data and area population from Census SAIPE (both via the Urban Institute's Education Data Portal). Federal data runs about two years behind. Help in North Carolina: ",
      ext(hm.links.nc, "NC Homeless Education Program"), "."));
  requestAnimationFrame(() => {
    fill(counts, bigChart(hm, counts.clientWidth || 640, "students"));
    fill(rates, bigChart(hm, rates.clientWidth || 640, "per_1000_enrolled", { withState: true, labels: false, fmt: (v) => `${v} per 1,000` }));
  });
}
