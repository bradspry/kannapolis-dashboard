// Dashboard tabs (manila folders). Any widget can go on any tab; these are only the starting
// sets for a tab nobody has arranged yet. Home starts with every widget (data/manual/home_layout.json).
export const TABS = [
  { id: "home", name: "Home" },
  { id: "city", name: "City" },
  { id: "fun", name: "Entertainment", short: "Fun" },
  { id: "jobs", name: "Jobs" },
  { id: "transportation", name: "Transportation", short: "Transit" },
];

/** Widgets pinned to a tab's top-right corner until someone unpins them (one per tab). */
export const DEFAULT_PINNED = { jobs: "school-bus" };

export const DEFAULT_MEMBERS = {
  city: ["weather", "waste", "utility", "drought", "police", "fire", "news", "meetings", "council", "videos", "org",
    "people", "budget", "debt-service", "growth", "g-tax-rate", "g-debt-policy", "g-debt-limit", "land", "g-owners", "about"],
  fun: ["weather", "gem", "swanee", "baseball", "parks", "events", "editions", "made", "whataburger", "library"],
  jobs: ["school-bus"], // plus every employer widget (job-*): see defaultMembers
  transportation: ["weather", "rider", "train", "flights", "paratransit", "shuttle"],
};

/** A tab's starting widgets, given every widget id. Jobs starts with all the employer widgets. */
export function defaultMembers(tab, ids) {
  return [...(DEFAULT_MEMBERS[tab] || []), ...(tab === "jobs" ? ids.filter((id) => id.startsWith("job-")) : [])];
}

/** The subject a widget belongs to (its folder-tab color and its group in "Add a widget"):
 *  the first non-Home tab that starts with it, ignoring Weather's spot on every tab. */
export function categoryOf(id) {
  if (id === "weather") return "home";
  if (id.startsWith("job-")) return "jobs";
  for (const [tab, ids] of Object.entries(DEFAULT_MEMBERS)) if (ids.includes(id)) return tab;
  return "home";
}

export const tabById = (id) => TABS.find((t) => t.id === id) || TABS[0];
