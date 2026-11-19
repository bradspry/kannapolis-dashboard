// About the data: official sources (grouped by publisher), data freshness, and caveats.
// Shared helpers feed both the window and the home tile.
import { h } from "../ui.js";

export const REPO = "https://github.com/bradspry/kannapolis-dashboard";
const DAY_MS = 86400000;

/** Each dataset, when it was last fetched, and how often it should refresh. */
export function datasets(D) {
  const list = [
    ["Weather", "weather", D.weatherMeta, "Live in your browser; backup copy daily", 2],
    ["Public meetings", "meetings", D.meetings, "Daily", 2],
    ["City news", "news", D.news, "Daily", 2],
    ["Upcoming events", "events", D.events, "Daily", 2],
    ["People (Census)", "people", D.census, "Weekly", 9],
    ["Growth & property", "growth", D.property, "Weekly", 9],
    ["Land use & zoning", "land", D.zoning, "Weekly", 9],
    ["Budget, debt & debt service", "budget", D.budget, "By hand, each budget year", null],
    ["City Council", "council", D.council, "By hand", null],
    ["City staff", "org", D.org, "By hand", null],
  ];
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return list.filter(([, , d]) => d?.generated).map(([name, win, d, schedule, maxDays]) => {
    const [y, m, dd] = d.generated.split("-").map(Number);
    const date = new Date(y, m - 1, dd);
    const age = Math.round((today - date) / DAY_MS);
    return { name, win, date, age, schedule, status: maxDays == null ? "manual" : age <= maxDays ? "fresh" : "stale" };
  });
}

export const ago = (age) => (age <= 0 ? "Today" : age === 1 ? "Yesterday" : `${age} days ago`);
export const fmtDate = (d) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

/** Sources grouped by publisher, largest group first. */
export function byPublisher(sources) {
  const groups = new Map();
  for (const s of Object.values(sources)) {
    const key = s.publisher.startsWith("Census Reporter") ? "U.S. Census Bureau" : s.publisher;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(s);
  }
  return [...groups].sort((a, b) => b[1].length - a[1].length);
}

export function formatCounts(sources) {
  const c = new Map();
  for (const s of Object.values(sources)) c.set(s.format, (c.get(s.format) || 0) + 1);
  return [...c].sort((a, b) => b[1] - a[1]);
}

const statusLabel = { fresh: "Up to date", stale: "Due for refresh", manual: "Updated by hand" };
export const statusDot = (st) => h("span", { class: `fresh-dot ${st}`, "aria-hidden": "true" });

let fmtFilter = "All";

export function renderAbout(D) {
  const { budget } = D;
  const sources = budget.sources;
  const nSources = Object.keys(sources).length;
  const cited = ["general_fund_by_function", "general_fund_revenue", "funds_fy2027", "tax_rate_history", "debt_history", "debt_service_fy2027"]
    .reduce((s, k) => s + (budget[k]?.length || 0), 0);
  const fresh = datasets(D);
  const newest = fresh.reduce((a, b) => (b.date > a.date ? b : a), fresh[0]);
  const body = document.getElementById("about-body");

  const stat = (value, label, extra) => h("div", { class: "tile about-stat" }, h("div", { class: "value" }, value), h("div", { class: "label" }, label), extra ? h("div", { class: "context" }, extra) : null);

  // Sources, filterable by format
  const groupsWrap = h("div", { class: "src-groups" });
  const chips = h("div", { class: "chips", role: "group", "aria-label": "Filter sources by format" });
  const drawSources = () => {
    chips.replaceChildren(...[["All", nSources], ...formatCounts(sources)].map(([f, n]) =>
      h("button", { class: "chip", type: "button", "aria-pressed": String(fmtFilter === f), onclick: () => { fmtFilter = f; drawSources(); } }, `${f} ${n}`)));
    groupsWrap.replaceChildren(...byPublisher(sources).map(([pub, list]) => {
      const shown = list.filter((s) => fmtFilter === "All" || s.format === fmtFilter);
      if (!shown.length) return null;
      return h("section", { class: "src-group card" },
        h("h4", {}, pub, h("span", { class: "src-count" }, shown.length)),
        h("ul", { role: "list" }, shown.map((s) => h("li", {},
          h("span", { class: `fmt fmt-${s.format.toLowerCase().replace(/[^a-z]+/g, "-")}` }, s.format),
          h("div", {},
            h("a", { href: s.url, target: "_blank", rel: "noopener" }, s.title),
            h("p", {}, s.used_for))))));
    }).filter(Boolean));
  };
  drawSources();

  const caveats = [
    ["Two counties", "Kannapolis sits in both Cabarrus and Rowan counties. Property, growth and zoning cover the Cabarrus part only; Census and budget figures cover the whole city."],
    ["Survey estimates", "Census figures are five-year American Community Survey estimates and carry margins of error."],
    ["Nominal dollars", "Dollar amounts are not adjusted for inflation."],
    ["Adopted, not actual", "Budget figures are adopted budgets, not year-end spending."],
    ...budget.notes.filter((n) => !/^Budget figures are adopted/.test(n)).map((n) => ["Budget note", n]),
  ];

  body.replaceChildren(
    h("div", { class: "tiles about-stats" },
      stat(String(nSources), "Official sources", `${formatCounts(sources).map(([f, n]) => `${n} ${f}`).slice(0, 3).join(" · ")}`),
      stat(String(cited), "Hand-entered figures", "each linked to its PDF page"),
      stat(newest ? ago(newest.age) : "—", "Last data refresh", newest ? fmtDate(newest.date) : ""),
      stat("GPL-3.0", "Open source", h("a", { href: REPO, target: "_blank", rel: "noopener" }, "View the code ↗"))),

    h("h3", { class: "about-h" }, "Official sources"),
    h("p", { class: "about-sub" }, "Every number on this dashboard comes from these public documents and data services."),
    chips, groupsWrap,

    h("h3", { class: "about-h" }, "How fresh is the data"),
    h("div", { class: "card table-wrap" }, h("table", { class: "fresh-table" },
      h("thead", {}, h("tr", {}, ["Data", "Last updated", "Schedule", "Status"].map((c) => h("th", { scope: "col" }, c)))),
      h("tbody", {}, fresh.map((f) => h("tr", {},
        h("td", {}, h("a", { href: `#${f.win}` }, f.name)),
        h("td", {}, `${fmtDate(f.date)} `, h("span", { class: "muted" }, `(${ago(f.age).toLowerCase()})`)),
        h("td", {}, f.schedule),
        h("td", {}, statusDot(f.status), statusLabel[f.status])))))),

    h("h3", { class: "about-h" }, "Things to know"),
    h("div", { class: "caveats" }, caveats.map(([t, txt]) => h("div", { class: "caveat card" }, h("b", {}, t), h("p", {}, txt)))),

    h("div", { class: "card about-cta" },
      h("div", {}, h("b", {}, "Spot a problem?"),
        h("p", {}, "Every chart has a “Show data” table, and budget figures link to the exact PDF page they came from. If something looks wrong, open an issue.")),
      h("a", { class: "btn-primary", href: `${REPO}/issues`, target: "_blank", rel: "noopener" }, "Report an issue ↗")),
  );
}
