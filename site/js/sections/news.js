// News widget: the City's official news releases, newest first, with topic filters and search.
import { h, fill } from "../ui.js";

const DAY_MS = 86400000;
const PAGE = 8;

// Keyword topics (an article can have several). Order = chip order.
const TOPICS = [
  ["City government", /\b(council|budget|city manager|bond|tax|election|voting|voters|fee|ordinance|retir|promot|appoint)/i],
  ["Public safety", /\b(police|fire|firefighter|gas leak|investigation|emergency|911)/i],
  ["Water", /\bwater\b|drought/i],
  ["Getting around", /\b(transit|rider|train|rail|road|street closure|closed|ncdot|transportation|traffic)/i],
  ["Events & parks", /\b(discover fun|concert|parade|park|recreation|festival|theatre|theater|christmas|treelighting|tree lighting|5k|farmers market|stories under|basketball|pickleball|tennis|cannon ballers)/i],
];

const parseDate = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const fmtDate = (d) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

function relative(d, now) {
  const days = Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate()) - d) / DAY_MS);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return null;
}

let topic = null;  // selected topic label or null = all
let query = "";
let shown = PAGE;

export function renderNews(data) {
  const root = document.getElementById("news-body");
  const now = new Date();
  const items = data.items.map((it) => ({
    ...it,
    _d: it.date ? parseDate(it.date) : null,
    _topics: TOPICS.filter(([, re]) => re.test(`${it.title} ${it.snippet || ""}`)).map(([t]) => t),
    _text: `${it.title} ${it.snippet || ""}`.toLowerCase(),
  }));
  const usedTopics = TOPICS.map(([t]) => t).filter((t) => items.some((i) => i._topics.includes(t)));

  const chips = h("div", { class: "chips", role: "group", "aria-label": "Filter news by topic" });
  const search = h("input", {
    class: "news-search", type: "search", placeholder: "Search news", value: query,
    "aria-label": "Search City news",
  });
  const status = h("p", { class: "news-status", "aria-live": "polite" });
  const list = h("ul", { class: "news-list", role: "list" });
  const more = h("button", { class: "chip news-more", type: "button" });

  function drawChips() {
    chips.replaceChildren(...[null, ...usedTopics].map((t) =>
      h("button", {
        class: "chip", type: "button", "aria-pressed": String(topic === t),
        onclick: () => { topic = t; shown = PAGE; drawChips(); drawList(); },
      }, t ?? "All")));
  }

  function drawList() {
    const q = query.trim().toLowerCase();
    const matches = items.filter((i) => (!topic || i._topics.includes(topic)) && (!q || i._text.includes(q)));
    list.replaceChildren(...matches.slice(0, shown).map((it) => {
      const rel = it._d && relative(it._d, now);
      return h("li", { class: "news-item" },
        h("div", { class: "news-meta" },
          it._d ? h("time", { datetime: it.date }, fmtDate(it._d)) : null,
          rel ? h("span", { class: "mtg-badge soon" }, rel) : null,
          it._topics.length ? h("span", { class: "news-topics" }, it._topics.join(" · ")) : null),
        h("h3", { class: "news-title" },
          h("a", { href: it.url, target: "_blank", rel: "noopener" }, it.title,
            h("span", { class: "visually-hidden" }, " (opens on kannapolisnc.gov)"))),
        it.snippet ? h("p", { class: "news-snippet" }, it.snippet) : null);
    }));
    const filtered = topic || q;
    status.textContent = matches.length
      ? (filtered ? `${matches.length} of ${items.length} articles` : "")
      : "No articles match. Try another topic or search term.";
    status.hidden = !status.textContent;
    const left = matches.length - shown;
    more.hidden = left <= 0;
    more.textContent = `Show ${Math.min(left, PAGE)} more`;
  }

  search.addEventListener("input", () => { query = search.value; shown = PAGE; drawList(); });
  more.addEventListener("click", () => { shown += PAGE; drawList(); });

  drawChips();
  drawList();
  const oldest = items.map((i) => i.date).filter(Boolean).sort()[0];
  fill(root, 
    h("div", { class: "news-controls" }, chips, search),
    status, list, more,
    h("p", { class: "note" }, "Headlines and teasers from the City's official ",
      h("a", { href: data.source, target: "_blank", rel: "noopener" }, "news page"),
      ` (${items.length} articles${oldest ? ` since ${fmtDate(parseDate(oldest))}` : ""}). Topics are assigned automatically by keyword. Updated ${data.generated}.`));
}
