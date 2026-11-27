// Editions Coffee Shop & Bookstore. New arrivals and events are read
// daily from the store's website; coffee, yarn and hours are machine-parsed snapshots. Open/closed is worked
// out on the device from the posted hours (and any closure on the store's events list).
import { h, contactButtons, fill } from "../ui.js";
import { openStatus, hoursTable } from "./made.js";

const DAY_MS = 86400000;
const tel = (n) => `tel:${n.replace(/[^0-9]/g, "")}`;
const ext = (href, label, cls) => h("a", { href, target: "_blank", rel: "noopener", class: cls }, label);
const parseDay = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const dayLabel = (d, o = { weekday: "short", month: "short", day: "numeric" }) => d.toLocaleDateString("en-US", o);

/** Upcoming dated events (multi-day ones stay until their last day), then recurring ones. */
export function upcoming(ed, now = new Date()) {
  const today = startOfDay(now);
  const dated = ed.events.filter((e) => e.date && parseDay(e.end || e.date) >= today);
  return [...dated, ...ed.events.filter((e) => !e.date)];
}

export function whenText(e, now = new Date()) {
  if (!e.date) return [e.recurring, e.time].filter(Boolean).join(" · ");
  const d = parseDay(e.date), days = Math.round((d - startOfDay(now)) / DAY_MS);
  const day = days === 0 ? "Today" : days === 1 ? "Tomorrow" : dayLabel(d);
  const span = e.end ? `${dayLabel(d, { month: "short", day: "numeric" })} – ${dayLabel(parseDay(e.end), { month: "short", day: "numeric" })}` : day;
  return [span, e.time].filter(Boolean).join(" · ");
}

const closedToday = (ed, now = new Date()) => ed.events.find((e) => e.closed && e.date && startOfDay(parseDay(e.date)).getTime() <= startOfDay(now).getTime()
  && startOfDay(parseDay(e.end || e.date)).getTime() >= startOfDay(now).getTime());

/** Store or drive-thru status line, honoring a posted closure for today. */
export function edStatus(ed, which = "store", { compact = false } = {}) {
  const label = which === "store" ? "Store" : "Drive-thru";
  const closed = closedToday(ed);
  const st = closed ? { open: false, label: compact ? "Closed today" : `Closed today (${closed.title})` } : openStatus({ hours: ed.hours[which === "store" ? "store" : "drive_thru"] });
  // Compact (tiles): the hollow dot already says "closed", so "Closed · opens tomorrow 9 AM" -> "Opens tomorrow 9 AM".
  const text = compact ? st.label.replace(/^Closed · o/, "O") : st.label;
  return h("div", { class: "ed-status" }, h("b", {}, label), h("span", { class: `pk-status ${st.open ? "open" : ""}` }, st.open ? "● " : "○ ", text));
}

export function cover(b, size = "md") {
  const fallback = () => h("div", { class: `ed-cover ${size} none`, "aria-hidden": "true" }, "📖");
  if (!b.cover) return fallback();
  const img = h("img", { class: `ed-cover ${size}`, src: b.cover, alt: "", loading: "lazy", referrerpolicy: "no-referrer" });
  img.addEventListener("error", () => img.replaceWith(fallback()), { once: true });
  return img;
}

export function orderButton(ed, { compact = false } = {}) {
  const o = ed.order[0];
  return h("a", { class: `btn-primary ed-order${compact ? " compact" : ""}`, href: o.url, target: "_blank", rel: "noopener" }, `☕ ${compact ? "Order ahead" : o.label} ↗`);
}

function bookCard(b) {
  return h("li", { class: "ed-book" },
    h("a", { href: b.url, target: "_blank", rel: "noopener", class: "ed-book-link" }, cover(b, "md"),
      h("b", { class: "ed-book-title" }, b.title)),
    b.author ? h("span", { class: "tile-meta" }, b.author) : null,
    b.price ? h("span", { class: "ed-price" }, b.price) : null);
}

function eventCard(e) {
  return h("div", { class: `card ub-way ${e.closed ? "ed-closed" : ""}` },
    h("span", { class: "ed-when" }, e.closed ? "Closed · " : "", whenText(e)),
    h("b", {}, e.title),
    ...e.details.map((d) => h("p", {}, d)),
    e.links.length ? h("div", { class: "pk-links" }, e.links.map((l) => ext(l.url, `${l.label.replace(/[!.]+$/, "")} ↗`))) : null);
}

let tab = "books";

export function renderEditions(ed) {
  const root = document.getElementById("editions-body");
  const evs = upcoming(ed);
  const tabs = [["books", `New books (${ed.books.length})`], ["events", `Events (${evs.length})`], ["coffee", "Coffee & drinks"], ["yarn", "Yarn"], ["visit", "Hours & visit"]];
  const bar = h("div", { class: "chips", role: "group", "aria-label": "Show section" });
  const pane = h("div", { class: "ed-pane" });

  const panes = {
    books: () => [
      h("p", { class: "gem-p" }, "Just in at Editions. Tap a book to see it on the store's site; you can buy online or pick it up downtown."),
      h("ul", { class: "ed-books", role: "list" }, ed.books.map(bookCard)),
      h("div", { class: "pk-links" }, ext(ed.links.new, "All new arrivals ↗"), ext(ed.links.preorder, "Pre-orders (20% off) ↗"), ext(ed.links.special, "Special orders ↗"),
        ext(ed.links.librofm, "Audiobooks on Libro.fm ↗"), ext(ed.links.bookshop, "Bookshop.org ↗")),
    ],
    events: () => [
      evs.length ? h("div", { class: "ub-ways" }, evs.map(eventCard)) : h("p", {}, "No events listed right now."),
      h("div", { class: "pk-links" }, ext(ed.links.events, "Events page ↗"), ed.calendar_image ? ext(ed.calendar_image, "This month's calendar ↗") : null,
        ext(ed.links.bookclub, "Editions Unbound book club ↗"), ext(ed.yarn.classes, "Knitting & crochet classes ↗")),
    ],
    coffee: () => [
      h("div", { class: "ed-order-row" }, ed.order.map((o, i) => h("a", { class: i ? "btn-secondary ed-order" : "btn-primary ed-order", href: o.url, target: "_blank", rel: "noopener" },
        h("span", {}, `${o.label} ↗`), h("small", {}, o.detail))), h("a", { class: "btn-secondary ed-order", href: tel(ed.phone) }, h("span", {}, `☎ ${ed.phone}`), h("small", {}, "Questions? Call"))),
      h("h3", { class: "about-h" }, "Signature drinks"),
      h("div", { class: "ub-ways" }, ed.coffee.signature.map((s) => h("div", { class: "card ub-way" }, h("b", {}, s.name), s.ways ? h("span", { class: "ed-when" }, s.ways) : null, h("p", {}, s.what)))),
      h("div", { class: "grid" },
        h("section", { class: "card" }, h("h3", {}, "On the menu"),
          h("ul", { class: "ub-mini ed-menu" }, ed.coffee.menu.map((m) => h("li", {}, h("b", {}, m.group), h("span", {}, m.items))))),
        h("section", { class: "card" }, h("h3", {}, "Milk & add-ons"),
          h("ul", { class: "gem-prices", role: "list" }, h("li", {}, h("span", {}, "Whole, 2% or skim"), h("b", {}, "Free")), ed.coffee.addons.map((a) => h("li", {}, h("span", {}, a.what), h("b", {}, a.price)))),
          h("p", { class: "tile-meta" }, ed.coffee.roaster))),
      h("div", { class: "pk-links" }, ed.monthly_menu ? ext(ed.monthly_menu, "This month's drink specials ↗") : null, ext(ed.coffee.menu_image, "Full menu with prices ↗"), ext(ed.coffee.url, "Coffee shop page ↗")),
    ],
    yarn: () => [
      h("section", { class: "card gem-hero ed-yarn" },
        h("img", { class: "ed-yarn-img", src: ed.yarn.photo, alt: "The yarn room at Editions", loading: "lazy", referrerpolicy: "no-referrer" }),
        h("div", { class: "gem-hero-text" }, h("div", { class: "bb-next-label" }, "A legacy of textiles"), h("h3", {}, "Yarn & notions"),
          h("p", {}, ed.yarn.pitch), h("p", {}, ed.story),
          h("div", { class: "gem-actions" }, ext(ed.yarn.classes, "Class calendar ↗", "btn-primary"), ext(ed.yarn.url, "Yarn page ↗")))),
      h("div", { class: "grid" },
        h("section", { class: "card" }, h("h3", {}, "On the shelves"),
          h("ul", { class: "ub-mini ed-menu" }, h("li", {}, h("b", {}, "Yarn"), h("span", {}, ed.yarn.brands.join(", "))), h("li", {}, h("b", {}, "Needles & hooks"), h("span", {}, ed.yarn.tools.join(", "))))),
        h("section", { class: "card" }, h("h3", {}, "Yarn returns"), h("ul", { class: "pk-rules" }, ed.yarn.returns.map((r) => h("li", {}, r))))),
    ],
    visit: () => [
      h("div", { class: "grid" },
        h("section", { class: "card" }, h("h3", {}, "Bookstore & café"), hoursTable({ hours: ed.hours.store })),
        h("section", { class: "card" }, h("h3", {}, "Drive-thru"), hoursTable({ hours: ed.hours.drive_thru }), h("p", { class: "tile-meta" }, ed.hours.note))),
      h("div", { class: "card kpd-chief" },
        h("div", {}, h("b", {}, ed.name), h("span", {}, `${ed.address} · ${ed.phone} · ${ed.email}`),
          h("div", { class: "pk-links" }, ext(ed.map, "Directions ↗"), ext(ed.links.newsletter, "Newsletter ↗"), ext(ed.links.facebook, "Facebook ↗"), ext(ed.links.instagram, "Instagram ↗"), ext(ed.links.tiktok, "TikTok ↗"))),
        contactButtons({ name: ed.name, phone: ed.phone, email: ed.email }, ed.name)),
    ],
  };
  const draw = () => {
    bar.replaceChildren(...tabs.map(([k, l]) => h("button", { class: "chip", type: "button", "aria-pressed": String(tab === k), onclick: () => { tab = k; draw(); } }, l)));
    pane.replaceChildren(...panes[tab]());
  };
  draw();

  const next = evs.find((e) => e.date && !e.closed);
  fill(root, 
    h("section", { class: "card ed-hero" },
      h("div", {}, h("div", { class: "bb-next-label" }, "Books · coffee · yarn"), h("h3", {}, ed.name), h("p", { class: "gem-p" }, ed.tagline, ". ", ed.address, "."),
        h("div", { class: "gem-actions" }, orderButton(ed), ext(ed.map, "Directions ↗"), h("a", { href: tel(ed.phone) }, `☎ ${ed.phone}`))),
      h("div", { class: "ed-hero-side" }, edStatus(ed, "store"), edStatus(ed, "drive"),
        next ? h("div", { class: "ed-next" }, h("span", { class: "bb-next-label" }, "Next event"), h("b", {}, next.title), h("span", { class: "tile-meta" }, whenText(next))) : null)),
    bar, pane,
    h("p", { class: "note" }, "New arrivals and events are read from editionsbookstore.com once a day (updated ", ed.generated, "). Coffee, yarn and hours are copied from the store's pages; open/closed is worked out on your device."));
}
