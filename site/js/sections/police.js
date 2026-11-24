// Kannapolis Police: how to reach police first, things residents can do online, then crime
// statistics from KPD's quarterly reports in plain language.
import { h, contactButtons, segmentedBars, legend, dataTable, fill } from "../ui.js";
import { tokens } from "../theme.js";
import { pct } from "../format.js";

const QUARTER = { Q1: "Jan–Mar", Q2: "Apr–Jun", Q3: "Jul–Sep", Q4: "Oct–Dec" };
export const quarterLabel = (q) => { const [y, n] = q.split("-"); return `${QUARTER[n]} ${y}`; };
const tel = (n) => `tel:${n.replace(/[^0-9]/g, "")}`;

/** The two call buttons: 911 and the department's non-emergency line (police and fire). */
export function callButtons(dept, { compact = false } = {}) {
  const em = dept.phones.find((p) => p.kind === "emergency");
  const main = dept.phones.find((p) => p.kind === "main");
  return h("div", { class: `kpd-calls${compact ? " compact" : ""}` },
    h("a", { class: "kpd-call emergency", href: tel(em.number), "aria-label": `Call 911 for an emergency` },
      h("span", { class: "kpd-call-icon", "aria-hidden": "true" }, "🚨"),
      h("span", {}, h("b", {}, "Call 911"), h("small", {}, compact ? "Emergency" : em.note))),
    h("a", { class: "kpd-call", href: tel(main.number), "aria-label": `Call the ${dept.name} non-emergency line, ${main.number}` },
      h("span", { class: "kpd-call-icon", "aria-hidden": "true" }, "☎"),
      h("span", {}, h("b", {}, main.number), h("small", {}, compact ? main.label : main.note))));
}

/** Notices still open (e.g. a comment deadline). */
export function activeNotices(police) {
  const today = new Date().toISOString().slice(0, 10);
  return (police.notices || []).filter((n) => !n.until || n.until >= today);
}

export function noticeCard(n, { compact = false } = {}) {
  const until = n.until ? new Date(`${n.until}T12:00`).toLocaleDateString("en-US", { month: "long", day: "numeric" }) : null;
  return h("div", { class: `kpd-notice${compact ? " compact" : ""}` },
    h("b", {}, n.title), until ? h("span", { class: "kpd-due" }, `Through ${until}`) : null,
    compact ? null : h("p", {}, n.text),
    n.action ? h("a", { href: n.action.url, class: "kpd-notice-action" }, n.action.label) : null);
}

/** Serious-crime rows: each type with a bar per quarter. */
export function crimeRows(police, { limit = 99, quarters } = {}) {
  const t = tokens();
  const qs = quarters || police.quarters.map((q) => q.quarter);
  const latest = qs.at(-1);
  const types = [...new Set(police.crimes.map((c) => c.crime))]
    .map((name) => ({ name, by: Object.fromEntries(qs.map((q) => [q, police.crimes.find((c) => c.crime === name && c.quarter === q)?.count ?? 0])) }))
    .sort((a, b) => b.by[latest] - a.by[latest]).slice(0, limit);
  const max = Math.max(...types.flatMap((x) => qs.map((q) => x.by[q])), 1);
  const colors = qs.length > 1 ? [t.series[0], t.series[1]] : [t.series[0]];
  return h("ul", { class: "kpd-crimes", role: "list" }, types.map((x) => h("li", {},
    h("span", { class: "kpd-crime-name" }, x.name),
    h("span", { class: "kpd-crime-bars", "aria-hidden": "true" }, qs.map((q, i) =>
      h("span", { class: "kpd-bar", style: { width: `${(100 * x.by[q]) / max}%`, background: colors[i % colors.length] } }))),
    h("span", { class: "kpd-crime-vals" }, qs.map((q) => x.by[q]).join(" → ")),
    h("span", { class: "visually-hidden" }, qs.map((q) => `${quarterLabel(q)}: ${x.by[q]}`).join(", ")))));
}

export function renderPolice(police, org) {
  const root = document.getElementById("police-body");
  const t = tokens();
  const qs = police.quarters;
  const last = qs.at(-1), prev = qs.at(-2);
  const change = prev ? Math.round((100 * (last.total_reports - prev.total_reports)) / prev.total_reports) : null;
  const records = police.phones.find((p) => p.kind === "records");
  const chief = org?.people?.find((p) => /police chief/i.test(p.title));

  const groups = [...new Set(police.services.map((s) => s.group))];
  const statusExplain = {
    "Cleared by arrest": "someone was arrested and charged",
    "Exceptionally cleared": "closed without an arrest for reasons outside police control",
    "Open": "still being investigated",
    "Inactive": "no current leads; can reopen if new information comes in",
    "Unfounded": "investigation found no crime happened",
  };
  const statusOrder = Object.keys(statusExplain);
  const statusColors = [t.series[0], t.series[2], t.series[3], t.mutedFill, t.series[4]];

  fill(root, 
    callButtons(police),
    h("div", { class: "kpd-contact card" },
      h("div", {}, h("b", {}, "Records"), " · ", h("a", { href: tel(records.number) }, records.number), " · ",
        h("a", { href: `mailto:${records.email}` }, records.email),
        h("p", { class: "muted" }, records.note, ". Accident reports must be picked up in person with ID.")),
      h("div", {}, h("b", {}, "Visit"), " · ",
        h("a", { href: `https://www.openstreetmap.org/search?query=${encodeURIComponent(police.address)}`, target: "_blank", rel: "noopener" }, police.address))),

    ...activeNotices(police).map((n) => noticeCard(n)),

    h("h3", { class: "about-h" }, "Do it online"),
    h("div", { class: "kpd-services" }, groups.map((g) => h("section", { class: "card" },
      h("h4", {}, g),
      h("ul", { role: "list" }, police.services.filter((s) => s.group === g).map((s) =>
        h("li", {}, h("a", { href: s.url, target: "_blank", rel: "noopener" }, s.title, " ↗"))))))),

    h("h3", { class: "about-h" }, "Crime in Kannapolis, 2026"),
    h("p", { class: "about-sub" },
      `${last.total_reports} serious crimes were reported in ${quarterLabel(last.quarter)}`,
      change != null ? `, ${change >= 0 ? "up" : "down"} ${Math.abs(change)}% from ${prev.total_reports} in ${quarterLabel(prev.quarter)}.` : ".",
      ` ${last.status["Cleared by arrest"]}% were cleared by an arrest.`),
    h("div", { class: "grid" },
      h("figure", { class: "card span-2" },
        h("figcaption", {}, h("h3", {}, "Serious crimes by type"),
          h("p", { class: "sub" }, "These are the major crimes police track nationwide (the FBI's “Part 1” offenses), counted by quarter. Shoplifting and thefts from cars are types of larceny that KPD lists separately.")),
        legend(qs.map((q, i) => ({ label: quarterLabel(q.quarter), color: [t.series[0], t.series[1]][i % 2] }))),
        crimeRows(police),
        dataTable([{ key: "crime", label: "Crime" }, ...qs.map((q) => ({ key: q.quarter, label: quarterLabel(q.quarter), num: true }))],
          [...new Set(police.crimes.map((c) => c.crime))].map((crime) => ({ crime, ...Object.fromEntries(qs.map((q) => [q.quarter, police.crimes.find((c) => c.crime === crime && c.quarter === q.quarter)?.count ?? 0])) })))),
      h("figure", { class: "card" },
        h("figcaption", {}, h("h3", {}, "What happened to the cases"),
          h("p", { class: "sub" }, "Share of each quarter's reports by status when the report was made.")),
        legend(statusOrder.map((s, i) => ({ label: s, color: statusColors[i] }))),
        segmentedBars(qs.map((q) => ({ name: quarterLabel(q.quarter), parts: statusOrder.map((s, i) => ({ label: s, value: q.status[s] || 0, color: statusColors[i] })) }))),
        h("dl", { class: "facts kpd-glossary" }, statusOrder.flatMap((s) => [h("dt", {}, s), h("dd", {}, statusExplain[s])]))),
      h("figure", { class: "card" },
        h("figcaption", {}, h("h3", {}, "Where: by police district"),
          h("p", { class: "sub" }, "Share of reports in each of KPD's four patrol districts.")),
        h("ul", { class: "kpd-districts", role: "list" }, Object.entries(last.districts).sort((a, b) => b[1] - a[1]).map(([d, v]) =>
          h("li", {}, h("span", {}, `District ${d.replace("K", "")}`),
            h("span", { class: "fb-track" }, h("span", { style: { width: `${v * 2}%` } })),
            h("b", {}, pct(v, 0))))),
        h("p", { class: "note" }, `${quarterLabel(last.quarter)}. `,
          h("a", { href: police.services.find((s) => /sector map/i.test(s.title))?.url, target: "_blank", rel: "noopener" }, "See the district map ↗")))),

    chief ? h("div", { class: "card kpd-chief" },
      chief.photo ? h("img", { src: chief.photo, alt: "" }) : null,
      h("div", {}, h("b", {}, chief.name), h("span", {}, `Police Chief`)),
      contactButtons(chief, `${chief.name}, Police Chief`)) : null,

    h("p", { class: "note" }, "From the ",
      h("a", { href: police.page, target: "_blank", rel: "noopener" }, "Kannapolis Police Department"),
      " website and its quarterly crime reports (",
      ...qs.flatMap((q, i) => [h("a", { href: q.source_url, target: "_blank", rel: "noopener" }, quarterLabel(q.quarter)), i < qs.length - 1 ? ", " : ""]),
      "). Figures are KPD's own, machine-parsed from each report and checked against its total."));
}
