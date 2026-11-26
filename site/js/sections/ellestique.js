// Elle's Tique: the women's boutique at 109 West Ave. New arrivals are read daily from its Shopify home page
// (data/generated/ellestique.json); hours and "open now" are worked out on the device (made.js helpers).
import { h, fill } from "../ui.js";
import { openStatus, hoursTable } from "./made.js";

const ext = (href, label, cls) => h("a", { href, target: "_blank", rel: "noopener", class: cls }, label);

export const elLogo = (el, cls = "el-logo") => (el.logo ? h("span", { class: cls }, h("img", { src: el.logo, alt: `${el.name} logo` })) : null);

export function elStatus(el, { compact = false } = {}) {
  const st = openStatus(el);
  return h("span", { class: `pk-status ${st.open ? "open" : ""}` }, st.open ? "● " : "○ ", compact ? st.label.replace(/^Closed · o/, "O") : st.label);
}

/** One new arrival: picture, name, price (and the struck-through price on sale). */
export function arrival(a, { compact = false } = {}) {
  return h("li", { class: `el-item${compact ? " compact" : ""}` },
    h("a", { href: a.url, target: "_blank", rel: "noopener", class: "el-item-link" },
      a.image ? h("img", { src: a.image, alt: "", loading: "lazy" }) : h("span", { class: "el-noimg", "aria-hidden": "true" }, "👗"),
      h("span", { class: "el-item-name" }, a.name),
      h("span", { class: "el-item-price" }, a.was ? h("s", {}, a.was) : null, a.was ? " " : null, a.price || "", a.sold_out ? h("em", {}, " · Sold out") : null)));
}
export const arrivals = (el, n, o) => h("ul", { class: `el-grid${o?.compact ? " compact" : ""}`, role: "list" }, (el.arrivals || []).slice(0, n).map((a) => arrival(a, o)));

export const shopButton = (el, { compact = false, label = "Shop online ↗" } = {}) =>
  h("a", { class: `btn-primary el-shop${compact ? " compact" : ""}`, href: el.site, target: "_blank", rel: "noopener" }, label);

export const where = (el) => h("p", { class: "tile-meta el-where" }, "📍 ", el.address.split(",")[0], " · downtown");

export function renderEllestique(el) {
  const root = document.getElementById("ellestique-body");
  root.style.setProperty("--el-color", el.color);
  fill(root,
    h("section", { class: "card el-hero" }, elLogo(el, "el-logo lg"),
      h("div", { class: "el-hero-text" },
        h("div", { class: "bb-next-label" }, `${el.kind} · West Avenue`),
        h("p", { class: "el-tagline" }, el.tagline),
        elStatus(el),
        h("p", { class: "tile-meta" }, ext(el.map, `${el.address} ↗`))),
      h("div", { class: "el-hero-actions" }, shopButton(el), ext(el.map, "Directions ↗", "pill-btn"))),
    el.notes?.length ? h("section", { class: "card el-notes" }, h("ul", { role: "list" }, el.notes.map((n) => h("li", {}, n)))) : null,
    el.arrivals?.length ? h("section", { class: "card" }, h("h3", {}, "New arrivals"), arrivals(el, 12),
      h("p", { class: "tile-meta" }, ext(el.shop[0].url, "All new arrivals ↗"))) : null,
    h("div", { class: "el-two" },
      h("section", { class: "card" }, h("h3", {}, "Hours"), hoursTable(el), h("p", { class: "tile-meta" }, el.hours_note)),
      h("section", { class: "card" }, h("h3", {}, "Shop by category"),
        h("div", { class: "el-chips" }, el.shop.slice(1).map((s) => ext(s.url, s.label, "chip"))),
        h("p", { class: "el-links" }, el.links.flatMap((l, i) => [i ? " · " : null, ext(l.url, l.label)])))),
    h("section", { class: "card" }, h("h3", {}, "About the shop"), h("p", {}, el.about),
      h("p", { class: "el-links" }, "Follow along: ", el.social.flatMap((s, i) => [i ? " · " : null, ext(s.url, `${s.label} ↗`)]))),
    h("p", { class: "note" }, "New arrivals and the shop's announcements are read once a day from ",
      ext(el.site, "ellestique.com"), "; hours and details are machine-parsed from the same site. Prices and sizes change: check the shop before you go."));
}
