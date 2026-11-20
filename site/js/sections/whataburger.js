// What-A-Burger #1: hometown drive-in on N Cannon Blvd. Hand-entered menu with prices,
// local favorites, and open-now worked out on the device from posted hours.
import { h } from "../ui.js";
import { statusLine, hoursText, hoursFor } from "./made.js";

const tel = (n) => `tel:${n.replace(/[^0-9]/g, "")}`;
const ext = (href, label, cls) => h("a", { href, target: "_blank", rel: "noopener", class: cls }, label);
export const price = (i) => `$${i.price.toFixed(2)}${i.from ? "+" : ""}`;

const byName = (wab) => new Map(wab.menu.flatMap((s) => s.items).map((i) => [i.name, i]));

/** Favorites joined with their current menu price. */
export function favorites(wab) {
  const items = byName(wab);
  return wab.favorites.map((f) => ({ ...f, label: f.label || f.name, item: items.get(f.name) }));
}

export function wabLogo(wab, size = "md") {
  return h("div", { class: `wab-logo ${size}` }, h("img", { src: wab.logo, alt: size === "lg" ? "What-A-Burger Drive-In #1 logo" : "", loading: "lazy" }));
}

export function orderButton(wab, { compact = false } = {}) {
  return h("a", { class: `btn-primary wab-call${compact ? " compact" : ""}`, href: wab.order_url, target: "_blank", rel: "noopener" }, "🍔 Order online ↗");
}

export const todayHours = (wab) => hoursText(hoursFor(wab, new Date().getDay()));

let section = "Burgers & sandwiches", query = "";

export function renderWhatABurger(wab) {
  const root = document.getElementById("whataburger-body");
  const chips = h("div", { class: "chips", role: "group", "aria-label": "Menu section" });
  const search = h("input", { type: "search", class: "wab-search", placeholder: "Search the menu (e.g. livermush, slaw, tots)", "aria-label": "Search the menu", value: query });
  const list = h("div", { class: "wab-menu" });
  const draw = () => {
    chips.replaceChildren(...wab.menu.map((s) => h("button", { class: "chip", type: "button", "aria-pressed": String(!query && section === s.name),
      onclick: () => { section = s.name; query = ""; search.value = ""; draw(); } }, `${s.name} (${s.items.length})`)));
    const q = query.trim().toLowerCase();
    const groups = q ? wab.menu.map((s) => ({ ...s, items: s.items.filter((i) => `${i.name} ${i.about || ""}`.toLowerCase().includes(q)) })).filter((s) => s.items.length)
      : wab.menu.filter((s) => s.name === section);
    list.replaceChildren(...(groups.length ? groups.map((s) => h("section", {},
      q ? h("h4", { class: "wab-group" }, s.name) : null,
      h("ul", { class: "wab-items", role: "list" }, s.items.map((i) => h("li", {},
        h("div", {}, h("b", {}, i.name), i.about ? h("span", {}, i.about) : null),
        h("strong", {}, price(i))))))) : [h("p", { class: "tile-meta" }, `Nothing on the menu matches "${query}".`)]));
  };
  search.addEventListener("input", () => { query = search.value; draw(); });
  draw();

  root.replaceChildren(
    h("section", { class: "card gem-hero wab-hero" }, wabLogo(wab, "lg"),
      h("div", { class: "gem-hero-text" },
        h("div", { class: "bb-next-label" }, `${wab.kind} · N Cannon Blvd`),
        h("h3", {}, wab.name),
        h("div", { class: "mk-status" }, statusLine(wab, "big"), h("span", { class: "tile-meta" }, " · Open every day, 7 AM – 10 PM")),
        h("p", {}, wab.tagline, "."),
        h("div", { class: "gem-actions" }, orderButton(wab), h("a", { href: tel(wab.phone) }, `☎ ${wab.phone}`), ext(wab.map, "Directions ↗")),
        h("p", { class: "tile-meta" }, "First time ordering online? ", h("b", {}, wab.coupon.text), " with code ", h("code", {}, wab.coupon.code), "."))),

    h("h3", { class: "about-h" }, "Local favorites"),
    h("div", { class: "ub-ways" }, favorites(wab).map((f) => h("div", { class: "card ub-way" },
      h("b", {}, f.label), f.item ? h("span", { class: "mk-abv" }, price(f.item)) : null, h("p", {}, f.why)))),

    h("h3", { class: "about-h" }, "Menu"),
    h("section", { class: "card" }, search, chips, list,
      h("p", { class: "tile-meta" }, `Prices as listed on the restaurant's online menu, ${wab.menu_as_of}. "+" means the price goes up with options. Prices can change; the online menu has the latest.`), ext(wab.order_url, "Order from the full menu ↗")),

    h("h3", { class: "about-h" }, "What locals say"),
    h("div", { class: "ub-ways" }, wab.reviews.map((r) => h("figure", { class: "card ub-way wab-quote" },
      h("blockquote", {}, `“${r.text}”`), h("figcaption", { class: "tile-meta" }, `— ${r.who}, on the restaurant's website`)))),

    h("div", { class: "card kpd-chief" },
      h("div", {}, h("b", {}, wab.name), h("span", {}, `${wab.address} · ${wab.phone} · Open daily 7 AM – 10 PM`))),
    h("p", { class: "note" }, "Menu copied by hand from the restaurant's online menu. Open/closed is worked out on your device from posted hours; holidays can change them."));
}
