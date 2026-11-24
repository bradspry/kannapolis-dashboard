// Current drought conditions: the City's water-conservation level (read daily from kannapolisnc.gov/drought)
// and the weekly U.S. Drought Monitor for Cabarrus and Rowan counties, with two years of history.
// USDM values are cumulative: d1 = percent of the county in D1 *or worse*.
import * as Plot from "@observablehq/plot";
import { h, plotBase, dataTable, legend, fill } from "../ui.js";
import { gauge } from "../gauge.js";
import { tokens } from "../theme.js";
import { pct } from "../format.js";

const parseDay = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const md = (s, o = { month: "short", day: "numeric" }) => parseDay(s).toLocaleDateString("en-US", o);
const tel = (n) => `tel:${n.replace(/[^0-9]/g, "")}`;
const ext = (href, label, cls) => h("a", { href, target: "_blank", rel: "noopener", class: cls }, label);

/** The worst category covering at least `min` percent of the county (null = no drought or dryness). */
export function worst(dr, week, min = 0.5) {
  return [...dr.usdm_categories].reverse().find((c) => week[c.key] >= min) || null;
}

/** Percent of the county in exactly each category (USDM publishes "this category or worse"). */
function shares(dr, week) {
  const cats = dr.usdm_categories;
  return cats.map((c, i) => ({ ...c, pct: Math.max(0, week[c.key] - (cats[i + 1] ? week[cats[i + 1].key] : 0)) }));
}

export function levelBadge(dr, { compact = false } = {}) {
  const c = dr.city, lv = dr.levels[String(c.level)];
  return h("div", { class: `dr-level lv-${c.level}${compact ? " compact" : ""}` },
    h("span", { class: "dr-level-num" }, h("small", {}, "Level"), h("b", {}, c.level)),
    h("span", { class: "dr-level-text" }, h("b", {}, c.name), h("small", {}, `${lv.mandatory ? "Mandatory" : "Voluntary"} · since ${md(c.effective)}`)));
}

/** The City's level as a dashboard gauge: Normal (0) to Level 4, a red limit line over the mandatory
 *  levels (2–4), and whole-level readouts while the needle sweeps. */
export function levelGauge(dr, id) {
  const c = dr.city, lv = dr.levels[String(c.level)];
  return h("div", { class: `dr-gauge lv-${c.level}` }, gauge({
    id, label: c.name, value: c.level, min: 0, max: 4, ticks: 4,
    format: (v) => (Math.round(v) === 0 ? "Normal" : `Level ${Math.round(v)}`),
    tickFormat: (v) => (v === 0 ? "Normal" : `${v}`),
    zones: [{ from: 2, to: 4 }],
    context: `${lv.mandatory ? "Mandatory" : "Voluntary"} · since ${md(c.effective)}`,
    ariaLabel: `City water-use level: Level ${c.level} of 4, ${c.name}, since ${md(c.effective, { month: "long", day: "numeric", year: "numeric" })}`,
  }));
}

/** One county's current Drought Monitor line: the category covering most of the county, plus any worse
 *  category in part of it ("Abnormally dry (D0) · 100% · moderate drought in 2%"). */
export function countyLine(dr, county) {
  const w = county.weeks.at(-1), main = worst(dr, w, 50), bad = worst(dr, w);
  const extra = bad && bad !== main ? ` · ${bad.name.toLowerCase()} in ${pct(w[bad.key], 0)}` : "";
  return h("div", { class: "dr-county" },
    h("i", { class: "dr-chip", style: { background: main ? main.color : "transparent" }, "aria-hidden": "true" }),
    h("span", {}, h("b", {}, county.name.replace(" County", "")), " ",
      main ? `${main.name} (${main.code}) · ${pct(w[main.key], 0)}${extra}` : bad ? `Mostly normal${extra}` : "No drought or dryness"));
}

/** A strip of weekly cells colored by the worst category that week (oldest left). */
export function strip(dr, county, weeks = 52) {
  const rows = county.weeks.slice(-weeks);
  return h("div", { class: "dr-strip", role: "img", "aria-label": `${county.name}, last ${rows.length} weeks of the U.S. Drought Monitor` },
    rows.map((w) => { const c = worst(dr, w); return h("i", { style: { background: c ? c.color : "var(--grid)" }, title: `${md(w.date, { month: "short", day: "numeric", year: "numeric" })}: ${c ? `${c.name} (${c.code})` : "none"}` }); }));
}

let countyIdx = 0;

export function renderDrought(dr) {
  const root = document.getElementById("drought-body");
  const c = dr.city, lv = dr.levels[String(c.level)];
  const t = tokens();
  const latest = dr.counties[0].weeks.at(-1).date;

  // Current Drought Monitor: one stacked bar per county.
  const bars = h("div", { class: "dr-bars" }, dr.counties.map((county) => {
    const w = county.weeks.at(-1), parts = shares(dr, w).filter((p) => p.pct > 0.05);
    return h("div", { class: "dr-bar-row" },
      h("span", { class: "dr-bar-label" }, county.name.replace(" County", "")),
      h("div", { class: "dr-bar", role: "img", "aria-label": `${county.name}: ${parts.map((p) => `${p.name} ${pct(p.pct, 0)}`).join(", ") || "no drought"}` },
        parts.map((p) => h("span", { style: { flex: `${p.pct} 1 0`, background: p.color }, title: `${p.name} (${p.code}): ${pct(p.pct, 1)}` })),
        w.none > 0.05 ? h("span", { class: "dr-none", style: { flex: `${w.none} 1 0` }, title: `None: ${pct(w.none, 1)}` }) : null),
      countyLine(dr, county));
  }));

  const chips = h("div", { class: "chips", role: "group", "aria-label": "County" });
  const chartBox = h("div", { class: "chart dr-chart" });
  const tableBox = h("div", {});
  const drawChart = () => {
    chips.replaceChildren(...dr.counties.map((county, i) => h("button", { class: "chip", type: "button", "aria-pressed": String(i === countyIdx),
      onclick: () => { countyIdx = i; drawChart(); } }, county.name)));
    const county = dr.counties[countyIdx];
    const rows = county.weeks.map((w) => ({ ...w, _d: parseDay(w.date) }));
    const long = rows.flatMap((w) => shares(dr, w).map((s) => ({ date: w._d, code: s.code, name: s.name, pct: s.pct })));
    const cats = dr.usdm_categories;
    const width = chartBox.clientWidth || 640;
    chartBox.replaceChildren(Plot.plot({
      ...plotBase(width, { height: 230, marginLeft: 40, marginBottom: 28 }),
      x: { type: "time", label: null, ticks: width < 520 ? 4 : 8 },
      y: { label: null, domain: [0, 100], ticks: 4, tickFormat: (v) => `${v}%`, grid: true },
      color: { domain: cats.map((x) => x.code), range: cats.map((x) => x.color) },
      marks: [
        Plot.gridY({ stroke: t.grid, strokeOpacity: 1, ticks: 4 }),
        // Worst category on the baseline (the Drought Monitor's convention): the colored height = share of the county this dry or worse.
        Plot.areaY(long, { x: "date", y: "pct", fill: "code", order: [...cats].reverse().map((x) => x.code), curve: "step-after", stroke: t.surface, strokeWidth: 0.6 }),
        Plot.ruleY([0], { stroke: t.baseline }),
        Plot.ruleX(rows, Plot.pointerX({ x: "_d", stroke: t.text2 })),
        Plot.tip(rows, Plot.pointerX({ x: "_d", y: (w) => w.d0, title: (w) => [`Week of ${md(w.date, { month: "short", day: "numeric", year: "numeric" })}`,
          ...shares(dr, w).filter((s) => s.pct > 0.05).reverse().map((s) => `${s.name} (${s.code}): ${pct(s.pct, 0)}`),
          w.none > 0.05 ? `None: ${pct(w.none, 0)}` : null].filter(Boolean).join("\n") })),
      ],
    }));
    tableBox.replaceChildren(dataTable([
      { key: "date", label: "Week", format: (v) => md(v, { month: "short", day: "numeric", year: "numeric" }) },
      { key: "worst", label: "Worst category", format: (_, w) => { const x = worst(dr, w); return x ? `${x.code} ${x.name}` : "None"; } },
      ...cats.map((x) => ({ key: x.key, label: `${x.code} or worse`, num: true, format: (v) => pct(v, 0) })),
    ], [...county.weeks].reverse(), `Show ${county.name} data (percent of county)`));
  };

  fill(root, 
    h("section", { class: `card dr-hero lv-${c.level}` },
      h("div", {},
        h("div", { class: "bb-next-label" }, "City of Kannapolis water use"),
        levelBadge(dr),
        h("p", { class: "gem-p" }, `${lv.goal}. ${lv.mandatory ? "These rules are mandatory; violations can be reported to" : "Nothing is required, but every customer is asked to help. Questions:"} `,
          h("a", { href: tel(dr.phone) }, dr.phone), ".")),
      // Voluntary: the City's water-saving steps. Mandatory: send people to the City's current rules
      // (the rules saved here are from the last mandatory period and may not match a new one).
      lv.mandatory
        ? h("div", {}, h("h3", {}, "What's required"),
            h("p", { class: "gem-p" }, "Mandatory rules are in effect. Check the City's drought page for the current watering schedule and limits."),
            ext(dr.links.city, "Current rules on the City's drought page ↗", "btn-primary"))
        : h("div", {}, h("h3", {}, "How you can help"),
            h("ul", { class: "pk-rules" }, dr.voluntary_tips.map((x) => h("li", {}, x))))),

    h("section", { class: "card" },
      h("h3", {}, "U.S. Drought Monitor"),
      h("p", { class: "sub" }, `How dry the land is, county by county, week of ${md(latest, { month: "long", day: "numeric", year: "numeric" })}. Kannapolis is in both counties. Updated every Thursday.`),
      bars,
      legend(dr.usdm_categories.map((x) => ({ label: `${x.code} ${x.name}`, color: x.color })))),

    h("figure", { class: "card" },
      h("figcaption", {}, h("h3", {}, "The past two years"), h("p", { class: "sub" }, "Share of the county in each drought category, week by week; the worst category sits at the bottom. Uncolored = no dryness. Hover for details.")),
      chips, chartBox,
      legend(dr.usdm_categories.map((x) => ({ label: `${x.code} ${x.name}`, color: x.color }))),
      tableBox),

    h("div", { class: "grid" },
      h("section", { class: "card" }, h("h3", {}, "Drought levels explained"),
        h("ul", { class: "gem-prices dr-levels", role: "list" }, Object.entries(dr.levels).map(([n, l]) =>
          h("li", { class: String(c.level) === n ? "today" : "" }, h("span", {}, `Level ${n}: ${l.name}`, String(c.level) === n ? " (now)" : ""), h("b", {}, l.goal.replace("Cut system-wide water use ", "−"))))),
        h("p", { class: "tile-meta" }, dr.why)),
      h("section", { class: "card" }, h("h3", {}, "Drought news from the City"),
        h("ul", { class: "ub-mini dr-news" }, c.news.map((n) => h("li", {}, h("b", {}, md(n.date)), ext(n.url, `${n.title} ↗`)))))),

    lv.mandatory ? null : h("details", { class: "card dr-past" },
      h("summary", {}, dr.past_rules.label),
      h("ul", { class: "pk-rules" }, dr.past_rules.rules.map((x) => h("li", {}, x)))),

    h("div", { class: "pk-links" }, ext(dr.links.city, "City drought page ↗"), ext(dr.links.faq, "Drought FAQ ↗"), ext(dr.links.ncdrought, "NC Drought Management Advisory Council ↗"),
      ext(dr.links.usdm_map, "NC Drought Monitor map ↗"), ext(dr.links.pool_permit, "Pool filling permit ↗"), ext(dr.links.well_sign, "Well-water irrigation sign ↗")),
    h("p", { class: "note" }, `City level read daily from kannapolisnc.gov/drought (updated ${dr.generated}); drought categories from the U.S. Drought Monitor (National Drought Mitigation Center, USDA, NOAA), weekly.`));
  drawChart();
}
