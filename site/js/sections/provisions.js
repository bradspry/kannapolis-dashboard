// Provisions on Main Market & Deli ("the POM", 1111 S Main St in Midway): open now, today's special, what's coming
// up, and the deli board, from data/generated/provisions.json (events and menu read daily; etl/build_provisions.py).
import { h, fill } from "../ui.js";
import { hoursTable } from "./made.js";
import { shopOpen as openStatus, specialList, hoursOn, ktownLine, ktownCard } from "./shop.js"; // open now, with holiday hours

const ext = (href, label, cls) => h("a", { href, target: "_blank", rel: "noopener", class: cls }, label);
const ymd = (d) => d.toLocaleDateString("en-CA");
const tel = (n) => `tel:${n.replace(/\D/g, "")}`;
const clock = (t) => { const [hh, mm] = t.split(":").map(Number); return `${hh % 12 || 12}${mm ? `:${String(mm).padStart(2, "0")}` : ""} ${hh < 12 ? "AM" : "PM"}`; };

/** Upcoming events (today on), soonest first. */
export const upcoming = (p, now = new Date()) => (p.events || []).filter((e) => e.date >= ymd(now)).sort((a, b) => a.date.localeCompare(b.date));

const ICONS = [[/karaoke/i, "🎤"], [/music|band|live|acoustic/i, "🎵"], [/grinch|santa|photo/i, "📸"], [/sweater|christmas|navidad|holiday/i, "🎄"], [/trivia/i, "🧠"], [/game|football|nfl/i, "🏈"]];
export const eventIcon = (e) => (ICONS.find(([re]) => re.test(e.title)) || [, "✨"])[1];

/** "Today" / "Tomorrow" / "Sat, Dec 5" */
export function eventDay(e, now = new Date()) {
  const days = Math.round((new Date(`${e.date}T12:00`) - new Date(`${ymd(now)}T12:00`)) / 864e5);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return new Date(`${e.date}T12:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}
const eventTime = (e) => (e.time ? `${clock(e.time)}${e.late ? " – late" : ""}` : "");

/** Today's specials: the day's own first (Wine Down Wednesday, Sunday Ticket in football season), then the everyday one. */
export function specialsToday(p, now = new Date()) {
  if (!hoursOn(p, now)) return []; // closed today (Tuesdays, holidays): no special
  const d = now.getDay(), mo = now.getMonth() + 1;
  return (p.specials || []).filter((s) => s.days.includes(d) && (!s.months || s.months.includes(mo)))
    .sort((a, b) => a.days.length - b.days.length);
}

export function status(p, { compact = false } = {}) {
  const st = openStatus(p);
  return h("span", { class: `pk-status ${st.open ? "open" : ""}` }, st.open ? "● " : "○ ", compact ? st.label.replace(/^Closed · o/, "O") : st.label);
}

/** The owners at the right of the header, like the police and fire chiefs. */
export function ownersBadge(p) {
  return h("div", { class: "tile-chief" }, h("div", { class: "tile-chief-text" }, h("b", {}, p.owner), h("span", {}, p.owner_role || "Owners")),
    h("img", { src: p.owner_photo, alt: `${p.owner}, ${p.owner_role || "owners"} of ${p.short}`, loading: "lazy" }));
}

const special = (p, { compact = false } = {}) => {
  const s = specialsToday(p)[0];
  return s ? h("div", { class: `pom-special${compact ? " compact" : ""}` }, h("span", { class: "pom-special-tag" }, "Today"), h("b", {}, s.title), compact ? null : h("span", {}, s.detail)) : null;
};

/** Coming up: a date block, the event and its time. */
export function eventList(p, n, { compact = false } = {}) {
  const list = upcoming(p).slice(0, n);
  if (!list.length) return h("p", { class: "tile-meta" }, "No events posted right now.");
  return h("ul", { class: `pom-events${compact ? " compact" : ""}`, role: "list" }, list.map((e) => {
    const d = new Date(`${e.date}T12:00`);
    return h("li", {}, h("div", { class: "pom-date" }, h("span", {}, d.toLocaleDateString("en-US", { month: "short" })), h("b", {}, d.getDate())),
      h("div", { class: "pom-ev" }, h("b", {}, `${eventIcon(e)} ${e.title}`), h("span", {}, [eventDay(e), eventTime(e)].filter(Boolean).join(" · "))));
  }));
}

/** The deli board: sandwiches with dotted leaders to the price. */
export function board(p, n, { desc = false, title = "On the deli board" } = {}) {
  return h("div", { class: "pom-board" },
    h("div", { class: "pom-board-head" }, h("span", {}, title), h("i", { "aria-hidden": "true" }, "Boar's Head")),
    h("ul", { role: "list" }, (p.sandwiches || []).slice(0, n).map((s) => h("li", {},
      h("div", { class: "pom-line" }, h("b", {}, s.name), h("span", { class: "pom-dots", "aria-hidden": "true" }), h("em", {}, s.price)),
      desc ? h("p", {}, s.desc) : null))));
}

const buttons = (p, { compact = false, menu = true } = {}) => h("div", { class: "el-btns" },
  h("a", { class: `btn-primary el-call${compact ? " compact" : ""}`, href: tel(p.phone), "aria-label": `Call ${p.short}, ${p.phone}` }, "📞 Call"),
  menu ? h("a", { class: `pill-btn el-shop-2${compact ? " compact" : ""}`, href: p.menu_url, target: "_blank", rel: "noopener" }, "Menu ↗") : null,
  h("a", { class: `pill-btn el-shop-2 el-social${compact ? " compact" : ""}`, href: p.map, target: "_blank", rel: "noopener" }, "Directions ↗"));

/** The tile, at any size. */
export function provisionsTile(p, size, head) {
  const hd = head("basket", p.color, p.short);
  hd.classList.add("tile-head-chief");
  hd.append(ownersBadge(p));
  const top = h("div", { class: "lib-tile-head" }, hd, h("span", { class: `el-logo ${size} pom-logo` }, h("img", { src: p.logo, alt: `${p.short} logo` })));
  const info = h("div", { class: "el-info" }, h("div", { class: "bb-next-label" }, `${p.kind} · ${p.area}`), status(p, { compact: true }),
    h("p", { class: "tile-meta el-where" }, "📍 ", p.address_short, " · a mile from downtown"));
  const next = upcoming(p)[0];
  const nextLine = next ? h("p", { class: "pom-next" }, h("b", {}, `${eventIcon(next)} ${eventDay(next)}: `), next.title, next.time ? ` · ${clock(next.time)}` : "") : null;
  if (size === "s") return h("div", { class: "tile-body pom-tile", style: { "--pom": p.color, "--pom-accent": p.accent } }, top, info, nextLine);
  if (size === "m") return h("div", { class: "tile-body pom-tile", style: { "--pom": p.color, "--pom-accent": p.accent } }, top, h("div", { class: "tile-split top el-m" },
    h("div", {}, info, nextLine, buttons(p, { compact: true, menu: false })), h("div", {}, board(p, 4, { title: "Deli board" }))));
  if (size === "l") return h("div", { class: "tile-body pom-tile", style: { "--pom": p.color, "--pom-accent": p.accent } }, top, h("div", { class: "tile-split top pom-l" },
    h("div", {}, info, special(p, { compact: true }), h("div", { class: "pom-desk" }, h("div", { class: "mini-head" }, "Coming up"), eventList(p, 2, { compact: true })),
      nextLine ? h("div", { class: "pom-phone" }, nextLine) : null),
    h("div", {}, board(p, 6), buttons(p, { compact: true }))));
  return h("div", { class: "tile-body pom-tile", style: { "--pom": p.color, "--pom-accent": p.accent } }, top, h("div", { class: "tile-split top pom-xl" },
    h("div", { class: "el-xl-side" }, info, special(p), h("div", { class: "mini-head" }, "Coming up at the POM"), eventList(p, 2), ktownLine(p), buttons(p, { compact: true })),
    h("div", {}, board(p, 8)),
    h("div", { class: "pom-photo" }, h("img", { src: p.photos[0].src, alt: p.photos[0].alt, loading: "lazy" }))));
}

export function renderProvisions(p) {
  const root = document.getElementById("provisions-body");
  root.style.setProperty("--pom", p.color);
  root.style.setProperty("--pom-accent", p.accent);
  const todays = specialsToday(p);
  const menuItem = (s) => h("li", {}, h("div", { class: "pom-line" }, h("b", {}, s.name), h("span", { class: "pom-dots", "aria-hidden": "true" }), h("em", {}, s.price)), s.desc ? h("p", {}, s.desc) : null);
  fill(root,
    h("section", { class: "card el-hero pom-hero" },
      h("span", { class: "el-logo lg pom-logo" }, h("img", { src: p.logo, alt: `${p.short} logo` })),
      h("div", { class: "el-hero-text" },
        h("div", { class: "bb-next-label" }, `${p.kind} · ${p.area_long}`),
        h("p", { class: "el-tagline" }, p.tagline),
        status(p),
        h("p", { class: "tile-meta" }, ext(p.map, `${p.address} ↗`))),
      h("div", { class: "el-hero-actions" },
        h("div", { class: "el-btns" },
          h("a", { class: "btn-primary el-call", href: tel(p.phone) }, `📞 ${p.phone}`),
          ext(p.menu_url, "Full menu ↗", "pill-btn el-shop-2"), ext(p.map, "Directions ↗", "pill-btn el-shop-2"),
          ...p.social.map((x) => ext(x.url, `${x.label} ↗`, "pill-btn el-shop-2"))))),
    h("div", { class: "pom-photos" }, p.photos.map((x) => h("img", { src: x.src, alt: x.alt, loading: "lazy" }))),
    h("div", { class: "el-two" },
      h("section", { class: "card" }, h("h3", {}, "Coming up"), eventList(p, 8)),
      h("section", { class: "card" }, h("h3", {}, todays.length ? "Today's specials" : "Specials"),
        h("ul", { class: "pom-specials", role: "list" }, (todays.length ? todays : p.specials).map((s) => h("li", {}, h("b", {}, s.title), h("span", {}, s.detail)))),
        h("h3", { class: "el-special-h" }, "Every week"),
        h("ul", { class: "pom-specials", role: "list" }, p.specials.map((s) => h("li", {}, h("b", {}, s.title), h("span", {},
          s.days.length === 7 ? "Every day" : s.days.map((d) => ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"][d]).join(", ") + (s.months ? " in football season" : ""))))))),
    h("section", { class: "card pom-menu" }, h("h3", {}, "The deli menu"),
      h("div", { class: "pom-board big" }, h("div", { class: "pom-board-head" }, h("span", {}, "Sandwiches"), h("i", { "aria-hidden": "true" }, "Boar's Head deli")),
        h("ul", { role: "list", class: "pom-menu-grid" }, (p.sandwiches || []).map(menuItem))),
      h("div", { class: "pom-menu-two" },
        h("div", {}, h("h4", {}, "Small plates"), h("ul", { role: "list", class: "pom-plain" }, (p.small_plates || []).map(menuItem)),
          h("h4", {}, "Sides (small / medium)"), h("ul", { role: "list", class: "pom-plain" }, p.sides.map(menuItem))),
        h("div", {}, h("h4", {}, "The POM Charcuterie"), h("ul", { role: "list", class: "pom-plain" }, p.charcuterie.map(menuItem)),
          h("h4", {}, "Fresh sliced meats"), h("div", { class: "el-chips" }, p.meats.map((x) => h("span", { class: "chip" }, x))),
          h("h4", {}, "Select cheeses"), h("div", { class: "el-chips" }, p.cheeses.map((x) => h("span", { class: "chip" }, x))))),
      h("p", { class: "tile-meta" }, p.menu_note)),
    h("div", { class: "el-two" },
      h("section", { class: "card" }, h("h3", {}, "Hours"), hoursTable(p), h("p", { class: "tile-meta" }, p.hours_note),
        specialList(p) ? [h("h3", { class: "el-special-h" }, "Holiday hours"), specialList(p)] : null),
      h("section", { class: "card" }, h("h3", {}, "Meet the owners"),
        h("div", { class: "el-owner-card" }, h("img", { src: p.owner_photo, alt: `${p.owner}, owners of ${p.short}`, loading: "lazy" }),
          h("div", {}, h("b", {}, p.owner), h("span", {}, `Owners, ${p.short}`))),
        h("p", {}, p.about),
        null)),
    ktownCard(p),
    h("p", { class: "note" }, "Events and the deli menu are read once a day from ", ext(p.site, "provisionsonmain.com"),
      "; hours, specials and the owners' story are machine-parsed from the same site. Plans change: call before you go."));
}
