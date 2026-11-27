// City Water & Sewer (City tab): drinking water quality, where the water comes from (Lakes & Rivers), the sewer
// system and its overflows, what a bill costs, and how to report a problem. From data/manual/watersewer.json
// (etl/build_watersewer.py: the City's 2025 Water Quality Report, FY 2025-26 Wastewater Collections Report and fee
// schedule, transcribed by hand; the City's page is checked weekly for newer reports) and water.json (lake levels
// and stream flow, read daily).
import { h, fill, contactButtons } from "../ui.js";
import { makeMap, maplibregl } from "../maps.js";
import { openWindow } from "../os.js";
import { renderWater } from "./water.js";

const ext = (href, label, cls) => h("a", { href, target: "_blank", rel: "noopener", class: cls }, label);
const tel = (n) => `tel:${n.replace(/\D/g, "")}`;
const money = (n) => `$${n.toFixed(2)}`;
const day = (iso, o = { month: "short", day: "numeric", year: "numeric" }) => new Date(`${iso}T12:00`).toLocaleDateString("en-US", o);

/** The 24/7 line as a button. */
export const callButton = (ws, { compact = false, label = "Report a problem 24/7" } = {}) =>
  h("a", { class: `btn-primary el-call${compact ? " compact" : ""}`, href: tel(ws.phone) }, `📞 ${label}`);

/** The two headline facts from the quality report: no violations, lead not detected. */
export function qualityBadges(ws, { compact = false, one = false } = {}) {
  const lead = one ? null : ws.quality.results.find((r) => r.key === "lead");
  return h("div", { class: `wsw-badges${compact ? " compact" : ""}` },
    h("span", { class: "wsw-badge ok" }, h("b", {}, ws.quality.violations ? `${ws.quality.violations} violations` : "✓ No violations"), h("small", {}, `${ws.quality.year} water report`)),
    lead ? h("span", { class: "wsw-badge ok" }, h("b", {}, `Lead: ${lead.value.toLowerCase()}`), h("small", {}, "home tap tests")) : null);
}

/** A few results against their limits, as bars (the value's share of the limit). */
export function resultBars(ws, n = 8, { compact = false } = {}) {
  return h("ul", { class: `wsw-results${compact ? " compact" : ""}`, role: "list" }, ws.quality.results.slice(0, n).map((r) => h("li", {},
    h("div", { class: "wsw-r-top" }, h("b", {}, r.name), h("span", { class: "wsw-r-val" }, r.value)),
    r.pct != null ? h("div", { class: "wsw-bar", role: "img", "aria-label": `${r.value}, ${r.pct}% of the limit` }, h("i", { style: { width: `${Math.min(100, r.pct)}%` } })) : null,
    compact ? null : h("small", {}, r.limit, r.what ? ` · ${r.what}` : ""))));
}

/** The latest sewer overflows reported to the State, newest first. */
export function overflowRows(ws, n = 3) {
  return h("ul", { class: "ub-mini wsw-ovf", role: "list" }, [...ws.sewer.overflows].reverse().slice(0, n).map((o) => h("li", {},
    h("b", {}, day(o.date, { month: "short", day: "numeric" })), h("span", {}, `${o.where} · ${o.cause.toLowerCase()} · ${o.gallons.toLocaleString("en-US")} gal`))));
}

/** A month's water, sewer and stormwater charges for some number of gallons. */
export function bill(ws, gallons, { outside = false, storm = 1 } = {}) {
  const r = ws.rates[outside ? "outside" : "inside"], k = gallons / 1000, t1 = ws.rates.tier1_gallons / 1000;
  const water = r.water_base + Math.min(k, t1) * r.water_tier1 + Math.max(0, k - t1) * r.water_tier2;
  const sewer = r.sewer_base + k * r.sewer_per;
  const stormFee = ws.rates.stormwater[storm]?.fee ?? 0;
  return { water, sewer, storm: stormFee, total: water + sewer + stormFee };
}

/** "At 4,000 gallons a month: $95.48 water, sewer & stormwater" */
export const typicalBill = (ws, gallons = 4000) => {
  const b = bill(ws, gallons);
  return h("p", { class: "tile-meta wsw-typical" }, `At ${gallons.toLocaleString("en-US")} gallons a month: `, h("b", {}, money(b.total)), " water, sewer & stormwater");
};

function newerNotice(ws) {
  return ws.newer?.length ? h("p", { class: "wsw-newer" }, "📄 Newer from the City: ", ws.newer.flatMap((n, i) => [i ? " · " : null, ext(n.url, `${n.what} ↗`)])) : null;
}

/** "Your water": the quality report in plain words. */
function waterPane(ws) {
  const q = ws.quality, s = ws.supply;
  return [
    newerNotice(ws),
    h("section", { class: "card wsw-hero" },
      h("div", { class: "wsw-hero-mark", "aria-hidden": "true" }, q.violations ? "!" : "✓"),
      h("div", {}, h("h3", {}, q.violations ? `${q.violations} violations in ${q.year}` : `No violations in ${q.year}`),
        h("p", {}, `Kannapolis' tap water met every federal and state drinking water standard in the ${q.year} Annual Drinking Water Quality Report. Lead was not detected in home tap tests.`),
        h("div", { class: "pk-links" }, ext(q.url, `${q.year} Water Quality Report ↗`)))),
    h("section", { class: "card" }, h("h3", {}, "What's in the water"),
      h("p", { class: "tile-meta" }, "Each bar is the result's share of its legal limit (the shorter, the better)."),
      resultBars(ws)),
    h("div", { class: "el-two" },
      h("section", { class: "card" }, h("h3", {}, "PFAS (\"forever chemicals\")"),
        h("ul", { class: "wsw-pfas", role: "list" }, q.pfas.items.map((p) => h("li", {},
          h("div", { class: "wsw-r-top" }, h("b", {}, p.name), h("span", { class: "wsw-r-val" }, `${p.value} ppt`)),
          p.limit ? h("div", { class: "wsw-bar pfas", role: "img", "aria-label": `${p.value} of the ${p.limit} ppt limit` }, h("i", { style: { width: `${Math.min(100, (p.value / p.limit) * 100)}%` } })) : null,
          h("small", {}, p.limit ? `EPA limit ${p.limit.toFixed(1)} ppt` : "No individual EPA limit")))),
        h("p", { class: "tile-meta" }, `Sampled ${day(q.pfas.date)}. ${q.pfas.note} ppt = parts per trillion.`)),
      h("section", { class: "card" }, h("h3", {}, "Other characteristics"),
        h("ul", { class: "gem-prices", role: "list" }, q.other.map((o) => h("li", {}, h("span", {}, o.name, h("small", {}, ` · ${o.range}`)), h("b", {}, o.value)))),
        h("p", { class: "tile-meta" }, `Questions about the report: ${q.contact}.`))),
    h("section", { class: "card" }, h("h3", {}, "Where it comes from"),
      h("p", {}, s.lake), h("p", {}, s.backups), h("p", {}, s.interconnections),
      h("p", {}, `Kannapolis uses about ${s.demand_mgd} million gallons a day.`),
      h("h4", { class: "about-h" }, "How exposed each source is to pollution nearby"),
      h("ul", { class: "gem-prices", role: "list" }, s.susceptibility.map((x) => h("li", {}, h("span", {}, x.source), h("b", { class: x.rating === "Higher" ? "wsw-higher" : "" }, x.rating)))),
      h("p", { class: "tile-meta" }, s.susceptibility_note)),
  ];
}

/** "Sewer": the system, its overflows on a map, maintenance, and what not to flush. */
function sewerPane(ws) {
  const sw = ws.sewer, total = sw.overflows.reduce((a, o) => a + o.gallons, 0);
  const mapBox = h("div", { class: "map wsw-map", id: "wsw-ovf-map", role: "img", "aria-label": "Map of sewer overflows reported to the State" });
  const stat = (n, label) => h("div", { class: "wsw-stat" }, h("b", {}, n), h("span", {}, label));
  const causes = {};
  sw.overflows.forEach((o) => (/rag/i.test(o.cause) ? (causes.Rags = (causes.Rags || 0) + 1) : /grease/i.test(o.cause) ? (causes.Grease = (causes.Grease || 0) + 1)
    : /root/i.test(o.cause) ? (causes.Roots = (causes.Roots || 0) + 1) : (causes["Equipment or pipe failure"] = (causes["Equipment or pipe failure"] || 0) + 1)));
  requestAnimationFrame(() => makeMap(mapBox, { bounds: bounds(sw.overflows) }).then((map) => {
    if (typeof ResizeObserver === "function") new ResizeObserver(() => map.resize()).observe(mapBox);
    for (const o of sw.overflows) {
      const size = 10 + Math.sqrt(o.gallons) / 3;
      const el = h("div", { class: "wsw-pin", style: { width: `${size}px`, height: `${size}px` } });
      new maplibregl.Marker({ element: el }).setLngLat([o.lon, o.lat])
        .setPopup(new maplibregl.Popup({ offset: 10 }).setText(`${day(o.date)}: ${o.where}. ${o.cause}, ${o.gallons.toLocaleString("en-US")} gallons`)).addTo(map);
    }
  }));
  return [
    h("section", { class: "card" }, h("h3", {}, "The sewer system"),
      h("div", { class: "wsw-stats" }, stat(`${sw.miles}`, "miles of sewer pipe"), stat(`${sw.lift_stations}`, "pump (lift) stations"),
        stat(sw.customers.toLocaleString("en-US"), "customers"), stat(sw.investigated.toLocaleString("en-US"), "possible back-ups checked"),
        stat(`${sw.overflows.length}`, "spills reported to the State")),
      h("p", {}, sw.plant), h("p", { class: "tile-meta" }, `Lift station crews made ${sw.lift_inspections} routine inspections and answered ${sw.lift_alarms}+ alarms in FY ${sw.fy}.`)),
    h("section", { class: "card" }, h("h3", {}, `Spills reported to the State, FY ${sw.fy}`),
      h("p", { class: "tile-meta" }, `${sw.overflows.length} spills, ${total.toLocaleString("en-US")} gallons in all. Causes: `,
        Object.entries(causes).sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c.toLowerCase()} ${n}`).join(", "), ". Dot size is gallons spilled."),
      h("div", { class: "wsw-two" }, mapBox,
        h("ul", { class: "gem-prices wsw-ovf-list", role: "list" }, [...sw.overflows].reverse().map((o) => h("li", {},
          h("span", {}, h("b", {}, day(o.date, { month: "short", day: "numeric", year: "numeric" })), h("small", {}, ` ${o.where} · ${o.cause}`)), h("b", {}, `${o.gallons.toLocaleString("en-US")} gal`))))),
      h("p", { class: "tile-meta" }, sw.overflow_note)),
    h("div", { class: "el-two" },
      h("section", { class: "card" }, h("h3", {}, "Keep the sewer flowing"),
        h("p", { class: "wsw-never" }, h("b", {}, "Never"), " put these down a drain or toilet:"), h("ul", {}, sw.never.map((t) => h("li", {}, t))),
        h("p", { class: "wsw-always" }, h("b", {}, "Always:")), h("ul", {}, sw.always.map((t) => h("li", {}, t)))),
      h("section", { class: "card" }, h("h3", {}, "Maintenance last year"),
        h("ul", { class: "gem-prices", role: "list" }, sw.maintenance.map((m) => h("li", {}, h("span", {}, m.what), h("b", {}, m.n)))))),
    h("p", { class: "tile-meta" }, ext(sw.url, `Wastewater Collections Report FY ${sw.fy} ↗`)),
  ];
}

const bounds = (pts) => {
  const lons = pts.map((p) => p.lon), lats = pts.map((p) => p.lat);
  return [[Math.min(...lons) - 0.02, Math.min(...lats) - 0.015], [Math.max(...lons) + 0.02, Math.max(...lats) + 0.015]];
};

/** "Your bill": a calculator from the fee schedule. */
function billPane(ws) {
  const st = { gallons: 4000, outside: false, storm: 1 };
  const out = h("div", { class: "wsw-bill-out" });
  const gal = h("output", { class: "wsw-gal" });
  const slider = h("input", { type: "range", min: "0", max: "15000", step: "500", value: String(st.gallons), "aria-label": "Gallons used in a month",
    oninput: (e) => { st.gallons = +e.target.value; draw(); } });
  const where = h("div", { class: "chips", role: "group", "aria-label": "Inside or outside city limits" },
    [["Inside city limits", false], ["Outside", true]].map(([l, v]) => h("button", { class: "chip", type: "button", "aria-pressed": String(st.outside === v),
      onclick: (e) => { st.outside = v; e.currentTarget.parentElement.querySelectorAll("button").forEach((b, i) => b.setAttribute("aria-pressed", String(i === (v ? 1 : 0)))); draw(); } }, l)));
  const tier = h("select", { "aria-label": "Stormwater tier", onchange: (e) => { st.storm = +e.target.value; draw(); } },
    ws.rates.stormwater.map((t, i) => h("option", { value: String(i), selected: i === st.storm }, `${t.tier}: ${t.area} of roof & pavement (${money(t.fee)})`)));
  function draw() {
    const b = bill(ws, st.gallons, st);
    gal.textContent = `${st.gallons.toLocaleString("en-US")} gallons`;
    out.replaceChildren(
      h("ul", { class: "gem-prices", role: "list" },
        h("li", {}, h("span", {}, "Water"), h("b", {}, money(b.water))), h("li", {}, h("span", {}, "Sewer"), h("b", {}, money(b.sewer))),
        h("li", {}, h("span", {}, "Stormwater"), h("b", {}, money(b.storm))), h("li", { class: "wsw-total" }, h("span", {}, "Total for the month"), h("b", {}, money(b.total)))),
      h("p", { class: "tile-meta" }, st.gallons > ws.rates.tier1_gallons ? `Gallons over ${ws.rates.tier1_gallons.toLocaleString("en-US")} cost more per 1,000. ` : "",
        "Slide to your own use: it's on your bill, or in the smart meter portal."));
  }
  draw();
  const r = ws.rates.inside, o = ws.rates.outside;
  return [
    h("section", { class: "card wsw-bill" }, h("h3", {}, "What a month of water costs"),
      h("label", { class: "wsw-row" }, h("span", {}, "Water used: "), gal), slider, where, h("label", { class: "wsw-row" }, h("span", {}, "Stormwater fee: "), tier), out,
      h("div", { class: "el-btns" }, h("button", { class: "btn-primary el-call compact", type: "button", onclick: () => openWindow("utility") }, "💳 Pay your bill"),
        ext(ws.rates.source, "Fee schedule ↗", "pill-btn el-shop-2 compact"))),
    h("section", { class: "card" }, h("h3", {}, "The rates"),
      h("div", { class: "table-wrap" }, h("table", {},
        h("thead", {}, h("tr", {}, ["", "Inside city", "Outside"].map((x) => h("th", { scope: "col" }, x)))),
        h("tbody", {},
          [["Water, monthly base", r.water_base, o.water_base], ["Water, per 1,000 gal (first 7,000)", r.water_tier1, o.water_tier1], ["Water, per 1,000 gal (over 7,000)", r.water_tier2, o.water_tier2],
            ["Sewer, monthly base", r.sewer_base, o.sewer_base], ["Sewer, per 1,000 gal", r.sewer_per, o.sewer_per]]
            .map(([l, a, b]) => h("tr", {}, h("td", {}, l), h("td", {}, money(a)), h("td", {}, money(b))))))),
      h("p", { class: "tile-meta" }, ws.rates.note, " Estimates cover water, sewer and stormwater only; other charges on your bill aren't included.")),
  ];
}

/** "Report & services": what to call about, and the programs. */
function servicesPane(ws, director) {
  return [
    h("section", { class: "card wsw-report" }, h("h3", {}, "Report a problem"), h("p", {}, ws.report.intro), callButton(ws, { label: `Call ${ws.phone}` }),
      h("div", { class: "wsw-groups" }, ws.report.groups.map((g) => h("div", {}, h("h4", {}, g.title), h("ul", {}, g.items.map((i) => h("li", {}, i))))))),
    h("div", { class: "wsw-services" }, ws.services.map((s) => h("section", { class: "card" }, h("h3", {}, s.title), h("p", {}, s.text),
      h("p", { class: "el-links" }, ext(s.url, `${s.link} ↗`), ...(s.more || []).flatMap(([l, u]) => [" · ", ext(u, `${l} ↗`)]))))),
    h("section", { class: "card" }, h("h3", {}, "Moving water between river basins"), h("p", {}, ws.ibt.summary),
      h("p", { class: "el-links" }, ext(ws.ibt.url, `${ws.ibt.year} Interbasin Transfer report ↗`), " · ", ext(ws.links.sdf, "System development fee study ↗"))),
    director ? h("div", { class: "card kpd-chief" },
      director.photo ? h("img", { src: director.photo, alt: "", loading: "lazy" }) : null,
      h("div", {}, h("b", {}, director.name), h("span", {}, `Director of Water Resources · ${ws.address}`),
        h("div", { class: "pk-links" }, ext(ws.page, "City Water & Sewer page ↗"), ext(ws.directory, "Staff directory ↗"))),
      contactButtons({ name: director.name, phone: director.phone, email: director.email }, director.name)) : null,
  ];
}

export function renderWaterSewer(ws, water, boundaries, director) {
  const root = document.getElementById("water-body");
  const tabs = [["water", "Your water"], water?.streams ? ["lakes", "Lakes & supply"] : null, ["sewer", "Sewer"], ["bill", "Your bill"], ["report", "Report & services"]].filter(Boolean);
  let tab = "water";
  const bar = h("div", { class: "chips wsw-tabs", role: "group", "aria-label": "Sections" });
  const pane = h("div", { class: "wsw-pane" });
  const panes = { water: () => waterPane(ws), sewer: () => sewerPane(ws), bill: () => billPane(ws), report: () => servicesPane(ws, director) };
  const draw = () => {
    bar.replaceChildren(...tabs.map(([k, l]) => h("button", { class: "chip", type: "button", "aria-pressed": String(tab === k), onclick: () => { tab = k; draw(); } }, l)));
    if (tab === "lakes") renderWater(water, boundaries, pane);
    else pane.replaceChildren(...panes[tab]().filter(Boolean));
  };
  fill(root,
    h("section", { class: "card wsw-top" }, qualityBadges(ws),
      h("div", { class: "wsw-top-actions" }, callButton(ws), h("span", { class: "tile-meta" }, "Leaks, sewer back-ups, pollution: answered 24/7"))),
    bar, pane,
    h("p", { class: "note" }, "From the City of Kannapolis ", ext(ws.page, "Water & Sewer page"), ", its ", ext(ws.quality.url, `${ws.quality.year} Water Quality Report`), ", ",
      ext(ws.sewer.url, `FY ${ws.sewer.fy} Wastewater Collections Report`), " and ", ext(ws.rates.source, "fee schedule"),
      ", machine-parsed and checked by hand; the City's page is checked weekly for newer reports. Lake levels and stream flow are read daily (Lakes & supply)."));
  draw();
}
