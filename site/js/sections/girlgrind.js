// Girl Grind Beverage Co. (806 S Main St, drive-thru): best sellers with photos, this month's signature drinks,
// the menu and build-your-own fizzy. From data/manual/girlgrind.json (machine-parsed from its site; the menus are
// images there, so it's a snapshot, and the signature drinks change monthly). Hours aren't posted: call.
import { h, fill } from "../ui.js";

const ext = (href, label, cls) => h("a", { href, target: "_blank", rel: "noopener", class: cls }, label);
const tel = (n) => `tel:${n.replace(/\D/g, "")}`;
const monthName = (ym) => new Date(`${ym}-15T12:00`).toLocaleDateString("en-US", { month: "long" });
/** "November signature drinks", or "Last posted: November" once the month has passed. */
const specialsLabel = (g, now = new Date()) => (now.toLocaleDateString("en-CA").slice(0, 7) === g.specials.month
  ? `${monthName(g.specials.month)} signature drinks` : `Signature drinks (last posted: ${monthName(g.specials.month)})`);

const logo = (g, cls) => h("span", { class: `el-logo ${cls} gg-logo` }, h("img", { src: g.logo, alt: "Girl Grind Beverage Co. logo" }));

export function bestSellers(g, n = 5, { compact = false } = {}) {
  return h("ul", { class: `gg-best${compact ? " compact" : ""}`, role: "list" }, g.best.slice(0, n).map((d) => h("li", {},
    h("img", { src: d.photo, alt: d.name, loading: "lazy" }), h("b", {}, d.name), compact ? null : h("span", {}, d.what))));
}

/** A few of this month's signature drinks: name, group, ingredients. */
function specialsList(g, n, { desc = true } = {}) {
  const all = g.specials.groups.flatMap((gr) => gr.items.map((i) => ({ ...i, group: gr.group })));
  return h("ul", { class: "gg-specials", role: "list" }, all.slice(0, n).map((i) => h("li", {},
    h("div", {}, h("b", {}, i.name), h("small", {}, i.group)), desc ? h("p", {}, i.desc) : null)));
}

const buttons = (g, { compact = false } = {}) => h("div", { class: "el-btns" },
  h("a", { class: `btn-primary el-call${compact ? " compact" : ""}`, href: tel(g.phone) }, "📞 Call"),
  ext(g.map, "Directions ↗", `pill-btn el-shop-2${compact ? " compact" : ""}`));

/** The owner at the right of the header (medium and up), like the other shops. */
function headWithOwner(g, size, head) {
  const hd = head("cup", g.color, "Girl Grind");
  if (g.owner_photo && size !== "s") {
    hd.classList.add("tile-head-chief");
    hd.append(h("div", { class: "tile-chief" }, h("div", { class: "tile-chief-text" }, h("b", {}, g.owner), h("span", {}, "Owner")),
      h("img", { src: g.owner_photo, alt: `${g.owner}, owner`, loading: "lazy" })));
  }
  return hd;
}

export function girlGrindTile(g, size, head) {
  const top = h("div", { class: "lib-tile-head" }, headWithOwner(g, size, head), logo(g, size));
  const info = h("div", { class: "el-info" }, h("div", { class: "bb-next-label" }, "Drive-thru drinks"),
    h("p", { class: "tile-meta el-where" }, "📍 ", g.address_short, " · ", h("a", { href: tel(g.phone) }, "call for hours")));
  if (size === "s") return h("div", { class: "tile-body" }, top, info);
  if (size === "m") return h("div", { class: "tile-body" }, top, h("div", { class: "tile-split top el-m" },
    h("div", {}, info, buttons(g, { compact: true })), h("div", {}, bestSellers(g, 2, { compact: true }))));
  if (size === "l") return h("div", { class: "tile-body" }, top, info, h("div", { class: "mini-head" }, "Best sellers"), bestSellers(g, 4, { compact: true }),
    h("div", { class: "mini-head" }, specialsLabel(g)), specialsList(g, 2, { desc: false }), buttons(g, { compact: true }));
  return h("div", { class: "tile-body" }, top, h("div", { class: "tile-split top gg-xl" },
    h("div", { class: "el-xl-side" }, info, h("p", { class: "tile-meta" }, g.where),
      h("div", { class: "mini-head" }, specialsLabel(g)), specialsList(g, 4), buttons(g, { compact: true })),
    h("div", {}, h("div", { class: "mini-head bb-mh" }, "Best sellers"), bestSellers(g, 5))));
}

export function renderGirlGrind(g) {
  const root = document.getElementById("girlgrind-body");
  const f = g.fizzy, sp = g.specials;
  fill(root,
    h("section", { class: "card el-hero gg-hero" }, logo(g, "lg"),
      h("div", { class: "el-hero-text" }, h("div", { class: "bb-next-label" }, "Specialty drinks · walk-in or drive-thru · South Main Street"),
        h("p", { class: "el-tagline" }, g.tagline), h("p", { class: "tile-meta" }, ext(g.map, `${g.address} ↗`), " · ", h("a", { href: tel(g.phone) }, g.phone)),
        h("p", { class: "tile-meta" }, g.where), h("p", { class: "tile-meta" }, g.hours_note)),
      h("div", { class: "el-hero-actions" }, buttons(g))),
    h("section", { class: "card" }, h("h3", {}, "Best sellers"), bestSellers(g, 5)),
    h("section", { class: "card" }, h("h3", {}, specialsLabel(g)),
      h("div", { class: "gg-groups" }, sp.groups.map((gr) => h("div", {}, h("h4", {}, gr.group, h("small", {}, ` · ${gr.sizes}`)),
        h("ul", { class: "gg-specials", role: "list" }, gr.items.map((i) => h("li", {}, h("div", {}, h("b", {}, i.name), i.extra ? h("small", {}, i.extra) : null), h("p", {}, i.desc))))))),
      h("p", { class: "tile-meta" }, `Milk & creamer options: ${sp.milk}. New signature drinks every month.`)),
    h("div", { class: "el-two" },
      h("section", { class: "card" }, h("h3", {}, "Build your own fizzy"),
        h("p", {}, h("b", {}, "Size: "), f.sizes.join(" · ")),
        h("p", {}, h("b", {}, "Fizz (one soda included): "), f.sodas.join(", "), ` · ${f.redbull}`),
        h("p", {}, h("b", {}, "Flavors: "), `${f.flavors}+ to mix, ${f.flavor_price}, many sugar-free`),
        h("p", {}, h("b", {}, "Be extra: "), f.extras)),
      h("section", { class: "card" }, h("h3", {}, "Coffee, shakes & smoothies"),
        g.menu.map((m) => h("div", { class: "gg-menu-sec" }, h("h4", {}, m.section, m.sizes ? h("small", {}, ` · ${m.sizes}`) : null),
          h("p", {}, m.items.join(" · ")), m.note ? h("p", { class: "tile-meta" }, m.note) : null)))),
    h("section", { class: "card" }, h("h3", {}, "About Girl Grind"),
      g.owner_photo ? h("div", { class: "el-owner-card" }, h("img", { src: g.owner_photo, alt: `${g.owner}, owner of Girl Grind`, loading: "lazy" }),
        h("div", {}, h("b", {}, g.owner), h("span", {}, "Owner, Girl Grind Beverage Co."))) : null,
      h("figure", { class: "el-family" }, h("img", { src: g.market_photo.src, alt: g.market_photo.alt, loading: "lazy" })),
      h("p", {}, g.about), h("p", { class: "tile-meta" }, `Allergens: ${g.allergen}`),
      h("p", { class: "el-links" }, g.links.flatMap((l, i) => [i ? " · " : null, ext(l.url, `${l.label} ↗`)])),
      h("p", { class: "el-links" }, "Follow along: ", g.social.flatMap((s, i) => [i ? " · " : null, ext(s.url, `${s.label} ↗`)]))),
    h("p", { class: "note" }, "From the ", ext(g.site, "Girl Grind website"), ": its menus are images there, read into this page; the signature drinks change every month. Hours aren't posted, so call before you go."));
}
