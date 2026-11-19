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

function load(name, { optional = false } = {}) {
  const d = window.KDASH_DATA?.[name];
  if (d == null && !optional) throw new Error(`Missing data: ${name}. Run python3 etl/run_all.py`);
  return d ?? null;
}

function about({ census, budget, property, zoning }) {
  const src = budget.sources;
  const body = document.getElementById("about-body");
  body.replaceChildren(
    h("h3", {}, "Where the numbers come from"),
    h("ul", {},
      h("li", {}, h("b", {}, "People: "), `${census.source}, ${census.release} (${census.years}). `,
        h("a", { href: "https://censusreporter.org/profiles/16000US3735200-kannapolis-nc/" }, "Census Reporter profile")),
      h("li", {}, h("b", {}, "Growth, property & zoning: "), "Cabarrus County GIS open data — current and historical (2005–2024) tax parcels, municipal boundaries and Kannapolis zoning. ",
        h("a", { href: "https://location.cabarruscounty.us/arcgisservices/rest/services/OpenData" }, "County GIS services")),
      h("li", {}, h("b", {}, "Budget & debt: "), "Transcribed from City documents: ",
        ...Object.values(src).flatMap((s, i, a) => [h("a", { href: s.url }, s.title), i < a.length - 1 ? "; " : "."]))),
    h("h3", {}, "Things to know"),
    h("ul", {},
      h("li", {}, "Kannapolis sits in both Cabarrus and Rowan counties. Property, growth and zoning figures cover the Cabarrus County part only. Census and budget figures cover the whole city."),
      h("li", {}, "Census figures are survey estimates averaged over five years and carry margins of error."),
      h("li", {}, "Dollar amounts are not adjusted for inflation."),
      ...budget.notes.map((n) => h("li", {}, n))),
    h("h3", {}, "Spot a problem?"),
    h("p", {}, "This dashboard is open source. Every chart has a “Show data” table with the exact numbers, and the budget figures cite the page they came from."),
  );
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
  win("about", { title: "About the data", short: "About", icon: "about", color: "var(--muted-fill)", render: () => about(D) });

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
