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
import { renderMade } from "./sections/made.js";
import { renderEditions } from "./sections/editions.js";
import { renderWhatABurger } from "./sections/whataburger.js";
import { renderVideos } from "./sections/videos.js";
import { renderWaste } from "./sections/waste.js";
import { renderDrought } from "./sections/drought.js";
import { renderLibrary } from "./sections/library.js";
import { renderEmployer, brandVars } from "./sections/jobs.js";
import { renderRider, renderParatransit, renderShuttle, startLive as startTransitLive } from "./sections/transit.js";
import { renderTrain, nextKey as trainKey, tick as trainTick } from "./sections/train.js";
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
// Icon colors are CSS variables (--icon-N), so icons can be restyled without touching charts.
function colors() {
  const v = (n) => `var(--icon-${n})`;
  return { people: v(1), growth: v(3), land: v(6), budget: v(7), debt: v(2), news: v(5), meetings: v(4), events: v(8), weather: v(1), police: v(1), fire: v(2), baseball: v(6), utility: v(3), parks: v(6), gem: v(5), swanee: v(7), made: v(2), editions: v(4), whataburger: v(8), videos: v(5), waste: v(3), drought: v(1), library: v(6), train: v(1), council: v(1), org: v(3), about: "var(--muted-fill)", gauge: "var(--accent)" };
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
    swanee: load("swanee.json", { optional: true }), made: load("made.json", { optional: true }),
    editions: load("editions.json", { optional: true }), whataburger: load("whataburger.json", { optional: true }),
    videos: load("videos.json", { optional: true }), waste: load("waste.json", { optional: true }),
    drought: load("drought.json", { optional: true }), library: load("library.json", { optional: true }),
    train: load("train.json", { optional: true }), jobs: load("jobs.json", { optional: true }), transit: load("transit.json", { optional: true }),
  };
  const sub = (id) => document.querySelector(`#${id} .section-sub`)?.textContent.trim() || "";
  const win = (id, def) => document.getElementById(id) && defineWindow(id, { ...def, sub: def.sub ?? sub(id) });
  win("people", { title: "People", icon: "people", color: "var(--icon-1)", render: () => renderPeople(D.census, D.budget) });
  win("growth", { title: "Growth & Property", icon: "growth", color: "var(--icon-3)", render: () => renderGrowth(D.property, D.boundaries, D.grid) });
  if (D.zoning && D.zoningGeo) win("land", { title: "Land Use & Zoning", icon: "land", color: "var(--icon-6)", render: () => renderLand(D.zoning, D.zoningGeo) });
  win("budget", { title: "Budget & Debt", icon: "budget", color: "var(--icon-7)", render: () => renderBudget(D.budget) });
  if (D.budget.debt_service_fy2027) win("debt-service", { title: "City Debt", icon: "debt", color: "var(--icon-2)", render: () => renderDebtService(D.budget) });
  if (D.news) win("news", { title: "City News", icon: "news", color: "var(--icon-5)", render: () => renderNews(D.news) });
  if (D.police) win("police", { title: "Kannapolis Police", icon: "police", color: "var(--icon-1)", render: () => renderPolice(D.police, D.org) });
  if (D.fire) win("fire", { title: "Kannapolis Fire Department", icon: "fire", color: "var(--icon-2)", render: () => renderFire(D.fire, D.org) });
  if (D.baseball) win("baseball", { title: "Kannapolis Cannon Ballers", icon: "baseball", color: "var(--icon-6)", render: () => renderBaseball(D.baseball) });
  if (D.utility) win("utility", { title: "Pay Utility Bill", icon: "bill", color: "var(--icon-3)", render: () => renderUtility(D.utility) });
  if (D.parks) win("parks", { title: "Parks & Recreation", icon: "tree", color: "var(--icon-6)", render: () => renderParks(D.parks) });
  if (D.gem) win("gem", { title: "The Gem Theatre", icon: "film", color: "var(--icon-5)", render: () => renderGem(D.gem) });
  if (D.swanee) win("swanee", { title: "The Swanee Theatre", icon: "mic", color: "var(--icon-7)", render: () => renderSwanee(D.swanee) });
  if (D.made) win("made", { title: "Made in Kannapolis", icon: "mug", color: "var(--icon-2)", render: () => renderMade(D.made) });
  if (D.editions) win("editions", { title: "Kannapolis Reads and Yarns", icon: "book", color: "var(--icon-4)", render: () => renderEditions(D.editions) });
  if (D.whataburger) win("whataburger", { title: "What-A-Burger #1", icon: "burger", color: "var(--icon-8)", render: () => renderWhatABurger(D.whataburger) });
  if (D.videos) win("videos", { title: "City Council Meeting Videos", icon: "video", color: "var(--icon-5)", render: () => renderVideos(D.videos) });
  if (D.waste) win("waste", { title: "Waste Collection", icon: "trash", color: "var(--icon-3)", render: () => renderWaste(D.waste) });
  // Jobs: a window per employer, built from the data (no fixed <section> in index.html).
  for (const emp of D.jobs?.employers || []) {
    const id = `job-${emp.slug}`;
    document.getElementById("store").append(h("section", { id, "aria-labelledby": `${id}-h` },
      h("header", { class: "section-head" }, h("h2", { id: `${id}-h` }, emp.name),
        h("p", { class: "section-sub" }, `Job openings at ${emp.name}${emp.where ? `, ${emp.where}` : ""}, updated weekly`)),
      h("div", { class: "kpd", id: `${id}-body` })));
    win(id, { title: emp.name, icon: "briefcase", color: emp.color || `var(--icon-${D.jobs.sectors[emp.sector]?.color || 4})`,
      ink: brandVars(emp)["--brand-ink"], render: () => renderEmployer(D.jobs, emp) });
  }
  if (D.transit) {
    D.transit._city = D.boundaries?.features?.find((f) => f.properties.year === "current") || null; // for the mini-maps
    win("rider", { title: "Rider Transit", icon: "bus", color: D.transit.rider.color, render: () => renderRider(D.transit) });
    win("paratransit", { title: "Rider ADA Paratransit", icon: "accessible", color: D.transit.paratransit.color, render: () => renderParatransit(D.transit) });
    win("shuttle", { title: "West Avenue Express Shuttle", icon: "shuttle", color: D.transit.shuttle.color, render: () => renderShuttle(D.transit) });
  }
  if (D.train) win("train", { title: "NC By Train", icon: "train", color: "var(--icon-1)", render: () => renderTrain(D.train) });
  if (D.library) win("library", { title: "Cabarrus County Public Library", icon: "library", color: "var(--icon-6)", render: () => renderLibrary(D.library) });
  if (D.drought) win("drought", { title: "Current Drought Conditions", icon: "drop", color: "var(--icon-1)", render: () => renderDrought(D.drought) });
  if (D.weatherMeta) win("weather", { title: "Weather", icon: "weather", color: "var(--icon-1)", render: () => renderWeather(weather(), D.boundaries) });
  if (D.events) win("events", { title: "Upcoming Events", icon: "events", color: "var(--icon-8)", render: () => renderEvents(D.events) });
  if (D.meetings) win("meetings", { title: "Public Meetings", icon: "meetings", color: "var(--icon-4)", render: () => renderMeetings(D.meetings) });
  if (D.council) win("council", { title: "City Council", icon: "council", color: "var(--icon-1)", render: () => renderCouncil(D.council) });
  if (D.org) win("org", { title: "Who Runs the City", icon: "org", color: "var(--icon-3)", render: () => renderOrg(D.org) });
  win("about", { title: "About the Data", icon: "about", color: "var(--muted-fill)", render: () => renderAbout(D) });

  setSources(D.budget.sources);
  startWeather(D.weatherMeta);
  onWeather(() => {
    if (!document.body.classList.contains("is-dragging")) renderHome();
    refreshWindow("weather");
  });
  // Dashboard Feedback: add which widget is open (if any) and the page address to the email.
  document.getElementById("feedback-btn")?.addEventListener("click", (e) => {
    const open = location.hash.slice(1), title = open && document.getElementById(`${open}-h`)?.textContent.trim();
    const body = `${title ? `Widget: ${title}\n` : ""}Page: ${location.href}\n\nMy feedback:\n`;
    e.currentTarget.href = `mailto:bradspry@gmail.com?subject=${encodeURIComponent("Kannapolis Civic Dashboard feedback")}&body=${encodeURIComponent(body)}`;
  });
  defineTiles(() => tileDefs(D, colors())); // before initOS: a tab's starting widgets come from the tile list
  initOS({ defaultLayout: load("home_layout.json", { optional: true }) });
  renderHome();
  openFromHash();

  // Rider Transit: live bus positions and alerts (every 30 s while the page is visible).
  if (D.transit) startTransitLive(D.transit);

  // NC By Train countdowns: refresh the text every 30 seconds, and redraw when a train leaves.
  if (D.train) {
    let key = trainKey(D.train);
    setInterval(() => {
      trainTick();
      const k = trainKey(D.train);
      if (k !== key) { key = k; if (!document.body.classList.contains("is-dragging")) renderHome(); refreshWindow("train"); }
    }, 30000);
  }

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
