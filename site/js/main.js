// Shell: a home screen of widget tiles (tiles.js) that open into windows (os.js).
// All data is embedded in the page by etl/build_site.py (window.KDASH_DATA), so the
// dashboard is a single file that works offline-from-disk, on any web host, or over Wi-Fi.
import { initTheme, onThemeChange, tokens } from "./theme.js";
import { h } from "./ui.js";
import { initOS, defineWindow, defineTiles, renderHome, invalidate, openFromHash, refreshWindow, setSources } from "./os.js";
import { startWeather, onWeather, weather } from "./weather.js";
import { renderWeather } from "./sections/weather.js";
import { renderPolice } from "./sections/police.js";
import { renderFire } from "./sections/fire.js";
import { renderBaseball } from "./sections/baseball.js";
import { renderUtility } from "./sections/utility.js";
import { renderParks } from "./sections/parks.js";
import { renderGem } from "./sections/gem.js";
import { renderSwanee } from "./sections/swanee.js";
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
// Icon colors are CSS variables (--icon-N), so the fall palette can restyle icons without touching charts.
function colors() {
  const v = (n) => `var(--icon-${n})`;
  return { people: v(1), growth: v(3), land: v(6), budget: v(7), debt: v(2), news: v(5), meetings: v(4), events: v(8), weather: v(1), police: v(1), fire: v(2), baseball: v(6), utility: v(3), parks: v(6), gem: v(5), swanee: v(7), council: v(1), org: v(3), about: "var(--muted-fill)", gauge: "var(--accent)" };
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
    events: load("events.json", { optional: true }), weatherMeta: load("weather.json", { optional: true }),
    police: load("police.json", { optional: true }), fire: load("fire.json", { optional: true }),
    baseball: load("baseball.json", { optional: true }), utility: load("utility.json", { optional: true }),
    parks: load("parks.json", { optional: true }), gem: load("gem.json", { optional: true }),
    swanee: load("swanee.json", { optional: true }),
  };
  const sub = (id) => document.querySelector(`#${id} .section-sub`)?.textContent.trim() || "";
  const win = (id, def) => document.getElementById(id) && defineWindow(id, { ...def, sub: def.sub ?? sub(id) });
  win("people", { title: "People", icon: "people", color: "var(--icon-1)", render: () => renderPeople(D.census, D.budget) });
  win("growth", { title: "Growth & property", short: "Growth", icon: "growth", color: "var(--icon-3)", render: () => renderGrowth(D.property, D.boundaries, D.grid) });
  if (D.zoning && D.zoningGeo) win("land", { title: "Land use & zoning", short: "Land use", icon: "land", color: "var(--icon-6)", render: () => renderLand(D.zoning, D.zoningGeo) });
  win("budget", { title: "Budget & debt", short: "Budget", icon: "budget", color: "var(--icon-7)", render: () => renderBudget(D.budget) });
  if (D.budget.debt_service_fy2027) win("debt-service", { title: "Debt service", short: "Debt", icon: "debt", color: "var(--icon-2)", render: () => renderDebtService(D.budget) });
  if (D.news) win("news", { title: "City news", short: "News", icon: "news", color: "var(--icon-5)", render: () => renderNews(D.news) });
  if (D.police) win("police", { title: "Kannapolis Police", short: "Police", icon: "police", color: "var(--icon-1)", render: () => renderPolice(D.police, D.org) });
  if (D.fire) win("fire", { title: "Kannapolis Fire Department", short: "Fire", icon: "fire", color: "var(--icon-2)", render: () => renderFire(D.fire, D.org) });
  if (D.baseball) win("baseball", { title: "Kannapolis Cannon Ballers", short: "Ballers", icon: "baseball", color: "var(--icon-6)", render: () => renderBaseball(D.baseball) });
  if (D.utility) win("utility", { title: "Pay Utility Bill", short: "Pay bill", icon: "bill", color: "var(--icon-3)", render: () => renderUtility(D.utility) });
  if (D.parks) win("parks", { title: "Parks & Recreation", short: "Parks", icon: "tree", color: "var(--icon-6)", render: () => renderParks(D.parks) });
  if (D.gem) win("gem", { title: "The Gem Theatre", short: "Gem", icon: "film", color: "var(--icon-5)", render: () => renderGem(D.gem) });
  if (D.swanee) win("swanee", { title: "The Swanee Theatre", short: "Swanee", icon: "mic", color: "var(--icon-7)", render: () => renderSwanee(D.swanee) });
  if (D.weatherMeta) win("weather", { title: "Weather", icon: "weather", color: "var(--icon-1)", render: () => renderWeather(weather()) });
  if (D.events) win("events", { title: "Upcoming events", short: "Events", icon: "events", color: "var(--icon-8)", render: () => renderEvents(D.events) });
  if (D.meetings) win("meetings", { title: "Public meetings", short: "Meetings", icon: "meetings", color: "var(--icon-4)", render: () => renderMeetings(D.meetings) });
  if (D.council) win("council", { title: "City Council", short: "Council", icon: "council", color: "var(--icon-1)", render: () => renderCouncil(D.council) });
  if (D.org) win("org", { title: "Who runs the City", short: "Staff", icon: "org", color: "var(--icon-3)", render: () => renderOrg(D.org) });
  win("about", { title: "About the data", short: "About", icon: "about", color: "var(--muted-fill)", render: () => renderAbout(D) });

  setSources(D.budget.sources);
  startWeather(D.weatherMeta);
  onWeather(() => {
    if (!document.body.classList.contains("is-dragging")) renderHome();
    refreshWindow("weather");
  });
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
