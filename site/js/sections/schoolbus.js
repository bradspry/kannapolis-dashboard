// School Bus Drivers (Jobs tab): kannapolis-jobs' --school-bus filter run over the three school districts'
// weekly openings — drivers (school bus, field trip, EC, substitute van) in Kannapolis first, then the
// two county districts. Monitors, mechanics and ride-along assistants are left out, as the harvester does.
import { h, fill } from "../ui.js";
import { jobList, careersButton, fmtDay, hostOf } from "./jobs.js";

export const SCHOOL_BUS_YELLOW = "#f5b800";
const ext = (href, label, cls) => h("a", { href, target: "_blank", rel: "noopener", class: cls }, label);

export const districtsOf = (jobs) => jobs?.school_bus?.districts || [];
export const total = (jobs) => districtsOf(jobs).reduce((n, d) => n + d.jobs.length, 0);

/** Same title posted several times (one per school or route) → one line with a count. */
export function grouped(list) {
  const m = new Map();
  for (const j of list) {
    const k = j.title.replace(/\s+/g, " ").trim();
    m.set(k, (m.get(k) || 0) + 1);
  }
  return [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

/** District rows for tiles: name and count. */
export function districtRows(jobs, { short = false } = {}) {
  return h("ul", { class: "sb-districts", role: "list" }, districtsOf(jobs).map((d) =>
    h("li", {}, h("span", {}, short ? d.name.replace(/ Schools$/, "") : d.name), h("b", {}, d.jobs.length))));
}

/** "System-Wide Bus Driver ×3" lines for tiles. */
export function titleList(list, n) {
  return h("ul", { class: "ub-mini sb-titles" }, grouped(list).slice(0, n).map(([t, c]) =>
    h("li", {}, h("span", {}, t), c > 1 ? h("b", {}, `×${c}`) : h("b", {}, ""))));
}

export function renderSchoolBus(jobs) {
  const root = document.getElementById("school-bus-body");
  const ds = districtsOf(jobs), n = total(jobs);
  const checked = ds.map((d) => d.fetched).filter(Boolean).sort()[0];
  fill(root,
    h("section", { class: "card job-hero sb-hero" },
      h("div", { class: "sb-badge", "aria-hidden": "true" }, "🚌"),
      h("div", { class: "job-hero-text" },
        h("div", { class: "bb-next-label" }, "Kannapolis City, Cabarrus County and Rowan-Salisbury Schools"),
        h("div", { class: "job-count" }, h("b", {}, n || "No"), ` school bus driving opening${n === 1 ? "" : "s"}${n ? "" : " posted"}`),
        h("p", { class: "tile-meta" }, "School bus, field trip, exceptional-children (EC) and substitute van drivers."),
        h("p", { class: "tile-meta" }, checked ? `Checked ${fmtDay(checked, { month: "long", day: "numeric", year: "numeric" })}; updated weekly.` : "Not checked yet."))),
    h("div", { class: "grid sb-grid" }, ds.map((d) => h("section", { class: "card sb-district" },
      h("div", { class: "sb-dhead" }, h("h3", {}, d.name), h("span", { class: "sb-count" }, d.jobs.length)),
      d.error ? h("p", { class: "tile-meta" }, "This week's check failed; these are last week's openings.") : null,
      d.jobs.length ? jobList(d.jobs, d.jobs.length, { compact: true }) : h("p", { class: "tile-meta" }, "No driving openings posted right now."),
      d.careers ? h("div", { class: "sb-apply" }, careersButton(d, { compact: true, label: `Apply at ${d.name.replace(/ Schools$/, "")} ↗` }), h("small", { class: "tile-meta" }, hostOf(d.careers))) : null))),
    h("p", { class: "note" }, "From each district's job board, read weekly with the ", ext(jobs.repo, "kannapolis-jobs"),
      " scrapers and filtered with its --school-bus rules: titles mentioning a bus, van driver, transportation or CDL, leaving out bus monitors, mechanics and transportation assistants (they ride along or work in the garage). Kannapolis is listed first. Postings change daily: check the district's site before you apply."));
}
