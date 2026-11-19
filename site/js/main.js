// Shell: a home screen of widget tiles (tiles.js) that open into windows (os.js).
// All data is embedded in the page by etl/build_site.py (window.KDASH_DATA), so the
// dashboard is a single file that works offline-from-disk, on any web host, or over Wi-Fi.
import { initTheme, onThemeChange, tokens } from "./theme.js";
import { h } from "./ui.js";
import { initOS, defineWindow, defineTiles, renderHome, invalidate, openFromHash } from "./os.js";
import { tileDefs } from "./tiles.js";
import { renderPeople } from "./sections/people.js";
import { renderGrowth } from "./sections/growth.js";
import { renderLand } from "./sections/land.js";
import { renderBudget } from "./sections/budget.js";
import { renderCouncil } from "./sections/council.js";
import { renderOrg } from "./sections/org.js";
import { renderMeetings } from "./sections/meetings.js";
import { renderNews } from "./sections/news.js";
import { renderEvents } from "./sections/events.js";
import { renderDebtService } from "./sections/debtservice.js";
import { renderAbout } from "./sections/about.js";

function load(name, { optional = false } = {}) {
  const d = window.KDASH_DATA?.[name];
  if (d == null && !optional) throw new Error(`Missing data: ${name}. Run python3 etl/run_all.py`);
  return d ?? null;
}



// Icon-chip color per widget (identity only; follows the categorical order).
function colors() {
  const s = tokens().series;
  return { people: s[0], growth: s[2], land: s[5], budget: s[6], debt: s[1], news: s[4], meetings: s[3], events: s[7], council: s[0], org: s[2], about: tokens().mutedFill, gauge: tokens().accent };
}

function main() {
  initTheme();
  const D = {
    census: load("census.json"), budget: load("budget.json"),
    property: load("property.json", { optional: true }), boundaries: load("boundaries.geojson", { optional: true }),
    grid: load("value_grid.geojson", { optional: true }),
    zoning: load("zoning.json", { optional: true }), zoningGeo: load("zoning.geojson", { optional: true }),
    council: load("council.json", { optional: true }), org: load("org.json", { optional: true }),
    meetings: load("meetings.json", { optional: true }), news: load("news.json", { optional: true }),
    events: load("events.json", { optional: true }),
  };
  const sub = (id) => document.querySelector(`#${id} .section-sub`)?.textContent.trim() || "";
  const win = (id, def) => document.getElementById(id) && defineWindow(id, { ...def, sub: def.sub ?? sub(id) });
  win("people", { title: "People", icon: "people", color: "var(--series-1)", render: () => renderPeople(D.census, D.budget) });
  win("growth", { title: "Growth & property", short: "Growth", icon: "growth", color: "var(--series-3)", render: () => renderGrowth(D.property, D.boundaries, D.grid) });
  if (D.zoning && D.zoningGeo) win("land", { title: "Land use & zoning", short: "Land use", icon: "land", color: "var(--series-6)", render: () => renderLand(D.zoning, D.zoningGeo) });
  win("budget", { title: "Budget & debt", short: "Budget", icon: "budget", color: "var(--series-7)", render: () => renderBudget(D.budget) });
  if (D.budget.debt_service_fy2027) win("debt-service", { title: "Debt service", short: "Debt", icon: "debt", color: "var(--series-2)", render: () => renderDebtService(D.budget) });
  if (D.news) win("news", { title: "City news", short: "News", icon: "news", color: "var(--series-5)", render: () => renderNews(D.news) });
  if (D.events) win("events", { title: "Upcoming events", short: "Events", icon: "events", color: "var(--series-8)", render: () => renderEvents(D.events) });
  if (D.meetings) win("meetings", { title: "Public meetings", short: "Meetings", icon: "meetings", color: "var(--series-4)", render: () => renderMeetings(D.meetings) });
  if (D.council) win("council", { title: "City Council", short: "Council", icon: "council", color: "var(--series-1)", render: () => renderCouncil(D.council) });
  if (D.org) win("org", { title: "Who runs the City", short: "Staff", icon: "org", color: "var(--series-3)", render: () => renderOrg(D.org) });
  win("about", { title: "About the data", short: "About", icon: "about", color: "var(--muted-fill)", render: () => renderAbout(D) });

  initOS({ defaultLayout: load("home_layout.json", { optional: true }) });
  defineTiles(() => tileDefs(D, colors()));
  renderHome();
  openFromHash();

  const gen = [D.census, D.budget, D.property, D.zoning].map((d) => d?.generated).filter(Boolean).sort().at(-1);
  if (gen) document.getElementById("updated").textContent = `Data last refreshed ${gen}.`;

  // Charts bake in literal colors and widths: redraw on theme change and real width changes.
  onThemeChange(invalidate);
  let lastW = window.innerWidth, timer;
  window.addEventListener("resize", () => {
    clearTimeout(timer);
    timer = setTimeout(() => { if (Math.abs(window.innerWidth - lastW) > 40) { lastW = window.innerWidth; invalidate(); } }, 200);
  });
}

try { main(); } catch (e) {
  document.getElementById("home").replaceChildren(h("p", { class: "error" }, e.message));
  throw e;
}
