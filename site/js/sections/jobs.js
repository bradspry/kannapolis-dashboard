// Jobs tab: one widget per employer, from the weekly kannapolis-jobs harvest (data/generated/jobs.json).
// Every listing links to the employer's own posting.
import { h } from "../ui.js";

const ext = (href, label, cls) => h("a", { href, target: "_blank", rel: "noopener", class: cls }, label);
const parseDay = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
export const fmtDay = (s, o = { month: "short", day: "numeric" }) => (s ? parseDay(s).toLocaleDateString("en-US", o) : "");
export const sectorColor = (jobs, emp) => `var(--icon-${jobs.sectors[emp.sector]?.color || 4})`;
export const hostOf = (url) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; } };

const possessive = (name) => (/s$/i.test(name) ? `${name}'` : `${name}'s`);

/** "12 openings" / "1 opening" / "No openings posted" */
export const countText = (n) => (n ? `${n} opening${n === 1 ? "" : "s"}` : "No openings posted");

/** Shown when this week's harvest failed and the list is from an earlier week. */
export function staleNote(emp, { compact = false } = {}) {
  if (!emp.error) return null;
  return h("p", { class: `job-stale${compact ? " compact" : ""}` },
    emp.fetched ? `From ${fmtDay(emp.fetched)}: this week's check of the careers site failed.` : "Couldn't read the careers site this week.");
}

export function careersButton(emp, { compact = false, label } = {}) {
  return h("a", { class: `btn-primary job-btn${compact ? " compact" : ""}`, href: emp.careers, target: "_blank", rel: "noopener" },
    label || "All openings ↗");
}

const tags = (j) => [j.part_time ? h("span", { class: "job-tag" }, "Part-time") : null, j.evening ? h("span", { class: "job-tag eve" }, "Evening") : null];

/** One listing: title (linked to the posting), location, part-time/evening tags. */
export function jobRow(j, { compact = false, location = true } = {}) {
  return h("li", { class: `job-row${compact ? " compact" : ""}` },
    h("a", { class: "job-title", href: j.url, target: "_blank", rel: "noopener" }, j.title),
    h("span", { class: "job-meta" }, ...tags(j), location && j.location ? h("small", {}, j.location) : null));
}

export const jobList = (jobs, n, o) => h("ul", { class: "job-list", role: "list" }, jobs.slice(0, n).map((j) => jobRow(j, o)));

const filters = new Map(); // employer slug -> { kind, q }

export function renderEmployer(jobs, emp) {
  const root = document.getElementById(`job-${emp.slug}-body`);
  const f = filters.get(emp.slug) || { kind: "all", q: "" };
  filters.set(emp.slug, f);
  const pt = emp.jobs.filter((j) => j.part_time).length, eve = emp.jobs.filter((j) => j.evening).length;
  const chips = h("div", { class: "chips", role: "group", "aria-label": "Show" });
  const search = h("input", { type: "search", class: "wab-search job-search", placeholder: "Search these openings", "aria-label": `Search openings at ${emp.name}`, value: f.q });
  const list = h("div", {});
  const draw = () => {
    chips.replaceChildren(...[["all", `All (${emp.jobs.length})`], ["part_time", `Part-time (${pt})`], ["evening", `Evening (${eve})`]]
      .filter(([k, , ]) => k === "all" || (k === "part_time" ? pt : eve))
      .map(([k, label]) => h("button", { class: "chip", type: "button", "aria-pressed": String(f.kind === k), onclick: () => { f.kind = k; draw(); } }, label)));
    const q = f.q.trim().toLowerCase();
    const shown = emp.jobs.filter((j) => (f.kind === "all" || j[f.kind]) && (!q || `${j.title} ${j.location}`.toLowerCase().includes(q)));
    list.replaceChildren(shown.length ? jobList(shown, shown.length) : h("p", { class: "tile-meta" }, emp.jobs.length ? "No openings match." : "No openings are posted right now."));
  };
  search.addEventListener("input", () => { f.q = search.value; draw(); });
  const sector = jobs.sectors[emp.sector]?.label;
  root.replaceChildren(
    h("section", { class: "card job-hero" },
      h("div", {},
        h("div", { class: "bb-next-label" }, [sector, emp.where].filter(Boolean).join(" · ")),
        h("div", { class: "job-count" }, h("b", {}, emp.jobs.length || "No"), ` opening${emp.jobs.length === 1 ? "" : "s"}${emp.jobs.length ? "" : " posted"}`),
        h("p", { class: "tile-meta" }, emp.fetched ? `Checked ${fmtDay(emp.fetched, { month: "long", day: "numeric", year: "numeric" })}; updated weekly.` : "Not checked yet."),
        staleNote(emp)),
      h("div", { class: "job-hero-actions" }, careersButton(emp, { label: `${emp.name} careers ↗` }), h("small", { class: "tile-meta" }, hostOf(emp.careers)))),
    emp.jobs.length ? h("section", { class: "card" }, h("div", { class: "job-tools" }, search, chips), list) : null,
    h("p", { class: "note" }, `Openings are read once a week from ${possessive(emp.name)} careers site (${hostOf(emp.careers)}) with the `,
      ext(jobs.repo, "kannapolis-jobs"), ` scrapers (jobs in: ${emp.where}). Postings change daily: check the employer's site before you apply. `,
      "“Part-time” and “Evening” come from the job titles."));
  draw();
}
