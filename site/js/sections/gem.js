// The Gem Theatre: what's showing now and next, tickets, prices and what to know before you go.
// Posters load from gem-theatre.com; listings refresh daily (etl/build_gem.py).
import { h, contactButtons } from "../ui.js";

const DAY_MS = 86400000;
const parseDay = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const today = () => { const t = new Date(); t.setHours(0, 0, 0, 0); return t; };
const md = (s) => parseDay(s).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const tel = (n) => `tel:${n.replace(/[^0-9]/g, "")}`;
const isSpecial = (f) => !f.rating || /matinee/i.test(f.title);

/** Sort listings into now showing, coming soon and special screenings (past ones dropped). */
export function gemLineup(gem) {
  const t = today();
  const live = gem.films.filter((f) => !f.end || parseDay(f.end) >= t);
  const films = live.filter((f) => !isSpecial(f));
  const now = films.find((f) => !f.start || parseDay(f.start) <= t) || null;
  return { now, next: films.filter((f) => f !== now), specials: live.filter(isSpecial) };
}

export function whenText(f) {
  if (!f?.start) return "";
  const t = today(), s = parseDay(f.start), e = parseDay(f.end);
  if (s > t) { const d = Math.round((s - t) / DAY_MS); return `Starts ${md(f.start)}${d <= 7 ? ` (in ${d} day${d === 1 ? "" : "s"})` : ""}`; }
  const left = Math.round((e - t) / DAY_MS);
  return left === 0 ? "Last day today" : `Through ${md(f.end)} · ${left + 1} days left`;
}

export function poster(f, size = "md") {
  if (!f?.poster) return h("div", { class: `gem-poster ${size} none`, "aria-hidden": "true" }, "🎬");
  const img = h("img", { class: `gem-poster ${size}`, src: f.poster, alt: `${f.title} poster`, loading: "lazy", referrerpolicy: "no-referrer" });
  img.addEventListener("error", () => img.replaceWith(h("div", { class: `gem-poster ${size} none`, "aria-hidden": "true" }, "🎬")), { once: true });
  return img;
}

export const rating = (f) => (f.rating ? h("span", { class: "gem-rating" }, f.rating) : null);

export function ticketsButton(gem, label = "Showtimes & tickets") {
  return h("a", { class: "btn-primary gem-tix", href: gem.tickets_url, target: "_blank", rel: "noopener" }, `🎟 ${label} ↗`);
}

export function renderGem(gem) {
  const root = document.getElementById("gem-body");
  const { now, next, specials } = gemLineup(gem);

  const hero = now ? h("section", { class: "card gem-hero" },
    poster(now, "lg"),
    h("div", { class: "gem-hero-text" },
      h("div", { class: "bb-next-label" }, "Now showing"),
      h("h3", {}, now.title, " ", rating(now)),
      h("div", { class: "gem-when" }, whenText(now)),
      now.description ? h("p", {}, now.description) : null,
      now.note ? h("p", { class: "gem-warn" }, h("span", { "aria-hidden": "true" }, "⚠ "), h("b", {}, "Please note: "), now.note) : null,
      h("div", { class: "gem-actions" }, ticketsButton(gem),
        h("a", { href: tel(gem.phones.movie_info) }, `☎ Movie info line ${gem.phones.movie_info}`))))
    : h("section", { class: "card" }, h("p", {}, "No film is listed for today. "), ticketsButton(gem));

  root.replaceChildren(
    hero,
    next.length ? h("h3", { class: "about-h" }, "Coming soon") : null,
    next.length ? h("div", { class: "gem-next" }, next.map((f) => h("article", { class: "card gem-card" },
      poster(f, "md"),
      h("div", {},
        h("b", {}, f.title, " ", rating(f)),
        h("div", { class: "gem-when" }, `${md(f.start)}–${md(f.end)} · ${whenText(f)}`),
        f.description ? h("p", {}, f.description) : null,
        f.note ? h("p", { class: "gem-warn" }, h("span", { "aria-hidden": "true" }, "⚠ "), f.note) : null)))) : null,
    specials.length ? h("h3", { class: "about-h" }, "Special screenings") : null,
    ...specials.map((f) => h("section", { class: "card gem-card" }, poster(f, "sm"),
      h("div", {}, h("b", {}, f.title), h("div", { class: "gem-when" }, `${md(f.start)}–${md(f.end)}`),
        f.schedule ? h("ul", { class: "pk-rules" }, f.schedule.map((s) => h("li", {}, s))) : (f.description ? h("p", {}, f.description) : null)))),

    h("div", { class: "grid" },
      h("section", { class: "card" }, h("h3", {}, "Tickets"),
        h("ul", { class: "gem-prices", role: "list" }, gem.prices.map((p) => h("li", {}, h("span", {}, p.who), h("b", {}, p.price)))),
        h("p", { class: "tile-meta" }, `Online advance tickets add ${gem.online_fee.replace(/^\$/, "$")}.`), ticketsButton(gem, "Buy tickets")),
      h("section", { class: "card" }, h("h3", {}, "Good to know"),
        h("ul", { class: "pk-rules" }, gem.good_to_know.map((g) => h("li", {}, g))))),
    h("div", { class: "grid" },
      h("section", { class: "card" }, h("h3", {}, "Accessibility"), h("p", { class: "gem-p" }, gem.accessibility)),
      h("section", { class: "card" }, h("h3", {}, "Getting there"),
        h("p", { class: "gem-p" }, h("a", { href: `https://www.openstreetmap.org/search?query=${encodeURIComponent(gem.address)}`, target: "_blank", rel: "noopener" }, gem.address)),
        h("p", { class: "gem-p" }, gem.parking, " ", h("a", { href: gem.parking_url, target: "_blank", rel: "noopener" }, "Parking map ↗")))),
    h("div", { class: "card kpd-chief" },
      h("div", {}, h("b", {}, gem.name), h("span", {}, `Movie info ${gem.phones.movie_info} · Office ${gem.phones.office} · ${gem.email}`)),
      contactButtons({ name: gem.name, phone: gem.phones.movie_info, email: gem.email }, gem.name)),
    h("p", { class: "pk-inline-links" }, h("a", { href: gem.support.url, target: "_blank", rel: "noopener" }, `💛 ${gem.support.text} ↗`)),
    h("p", { class: "note" }, "Listings from the Gem's ", h("a", { href: gem.tickets_page, target: "_blank", rel: "noopener" }, "ticket page"),
      `, checked daily (updated ${gem.generated}). Movies and times can change; the ticket link has today's showtimes.`));
}
