// B&K Tea Cafe (103 West Ave): the most popular drinks with their photos, the full menu board with prices, and how
// to order (Square pickup). From data/manual/bktea.json (machine-parsed from bkteacafe.com; the menu is on images
// there, so it's a snapshot). Its hours aren't posted, so there's no open-now: call.
import { h, fill } from "../ui.js";

const ext = (href, label, cls) => h("a", { href, target: "_blank", rel: "noopener", class: cls }, label);
const tel = (n) => `tel:${n.replace(/\D/g, "")}`;

export const logo = (b, cls) => h("span", { class: `el-logo ${cls} bk-logo` }, h("img", { src: b.logo, alt: "B&K Tea Cafe logo" }));

/** The four most popular drinks: photo, name, kind, small price. */
export function favorites(b, n = 4, { compact = false } = {}) {
  return h("ul", { class: `bk-favs${compact ? " compact" : ""}`, role: "list" }, b.favorites.slice(0, n).map((d) => h("li", {},
    h("img", { src: d.photo, alt: d.name, loading: "lazy" }),
    h("b", {}, d.name), h("span", {}, `${d.what} · from ${d.price}`))));
}

const buttons = (b, { compact = false } = {}) => h("div", { class: "el-btns" },
  ext(b.order, "🧋 Order pickup ↗", `btn-primary el-call${compact ? " compact" : ""}`),
  h("a", { class: `pill-btn el-shop-2${compact ? " compact" : ""}`, href: tel(b.phone) }, "📞 Call"));

/** Customer favorites from the menu board (the heart), across sections. */
const hearts = (b) => b.menu.flatMap((s) => s.items.filter((i) => i.fav).map((i) => ({ ...i, section: s.section })));

export function bkTile(b, size, head) {
  const top = h("div", { class: "lib-tile-head" }, head("cup", b.color, "B&K Tea Cafe"), logo(b, size));
  const info = h("div", { class: "el-info" }, h("div", { class: "bb-next-label" }, `${b.kind} · ${b.area}`),
    h("p", { class: "tile-meta el-where" }, "📍 ", b.address_short, " · ", h("a", { href: tel(b.phone) }, "call for hours")));
  if (size === "s") return h("div", { class: "tile-body" }, top, info);
  if (size === "m") return h("div", { class: "tile-body" }, top, h("div", { class: "tile-split top el-m" },
    h("div", {}, info, buttons(b, { compact: true })), h("div", {}, favorites(b, 2, { compact: true }))));
  if (size === "l") return h("div", { class: "tile-body" }, top, info, h("div", { class: "mini-head" }, "Most popular"), favorites(b, 4, { compact: true }), buttons(b, { compact: true }));
  return h("div", { class: "tile-body" }, top, h("div", { class: "tile-split top el-xl" },
    h("div", { class: "el-xl-side" }, info, h("p", { class: "tile-meta" }, b.tagline),
      h("div", { class: "mini-head" }, "Customer favorites"),
      h("ul", { class: "bk-hearts", role: "list" }, hearts(b).slice(0, 6).map((i) => h("li", {}, h("span", {}, "♥ ", i.name), h("b", {}, i.small)))),
      buttons(b, { compact: true })),
    h("div", {}, h("div", { class: "mini-head bb-mh" }, "Most popular"), favorites(b, 4))));
}

export function renderBk(b) {
  const root = document.getElementById("bktea-body");
  root.style.setProperty("--bk", b.color); root.style.setProperty("--bk-accent", b.accent);
  const x = b.extras;
  fill(root,
    h("section", { class: "card el-hero bk-hero" }, logo(b, "lg"),
      h("div", { class: "el-hero-text" }, h("div", { class: "bb-next-label" }, "Bubble tea · West Avenue, downtown"), h("p", { class: "el-tagline" }, b.tagline),
        h("p", { class: "tile-meta" }, ext(b.map, `${b.address} ↗`), " · ", h("a", { href: tel(b.phone) }, b.phone)),
        h("p", { class: "tile-meta" }, b.hours_note)),
      h("div", { class: "el-hero-actions" }, buttons(b), ext(b.map, "Directions ↗", "pill-btn"))),
    h("section", { class: "card" }, h("h3", {}, "Most popular"), favorites(b, 4)),
    h("section", { class: "card bk-menu" }, h("h3", {}, "The menu"), h("p", { class: "tile-meta" }, "Small / large · ♥ customer favorite"),
      h("div", { class: "bk-menu-grid" }, b.menu.map((s) => h("div", { class: "bk-sec" }, h("h4", {}, s.section),
        h("ul", { role: "list" }, s.items.map((i) => h("li", { class: i.fav ? "fav" : "" }, h("span", {}, i.name, i.fav ? h("i", { "aria-label": "customer favorite" }, " ♥") : null), h("b", {}, i.small), h("b", {}, i.large)))),
        s.note ? h("p", { class: "tile-meta" }, s.note) : null)))),
    h("div", { class: "el-two" },
      h("section", { class: "card" }, h("h3", {}, "Make it yours"),
        h("p", {}, h("b", {}, "Sugar: "), x.sugar.join(" · ")), h("p", {}, h("b", {}, "Ice: "), x.ice.join(" · ")),
        h("p", {}, h("b", {}, "Milk alternatives: "), x.milk), h("p", {}, h("b", {}, `Toppings (${x.toppings_price}): `), x.toppings.join(", ")),
        h("p", {}, h("b", {}, "Also: "), x.mochi)),
      h("section", { class: "card" }, h("h3", {}, "About B&K"), h("p", {}, b.about),
        h("p", { class: "el-links" }, b.links.flatMap((l, i) => [i ? " · " : null, ext(l.url, `${l.label} ↗`)])),
        h("p", { class: "el-links" }, "Follow along: ", b.social.flatMap((s, i) => [i ? " · " : null, ext(s.url, `${s.label} ↗`)])))),
    h("p", { class: "note" }, "From ", ext(b.site, "bkteacafe.com"), ": the menu is read from its menu boards (prices change: check when you order). The address and phone are from Explore Cabarrus; hours aren't posted, so call before you go."));
}
