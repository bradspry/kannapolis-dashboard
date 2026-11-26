// Putthaus ("Putts & Pints", 239 West Ave): indoor mini golf and golf simulators. Today's mini golf rate (weekday
// or weekend), open now, the course photo, and booking. From data/manual/putthaus.json (machine-parsed from
// putthaus.net).
import { h, fill } from "../ui.js";
import { shopOpen } from "./shop.js";

const ext = (href, label, cls) => h("a", { href, target: "_blank", rel: "noopener", class: cls }, label);
const tel = (n) => `tel:${n.replace(/\D/g, "")}`;

/** Mon–Thu or Fri–Sun rates, whichever applies today. */
export const todaysRates = (p, now = new Date()) => p.rates[[5, 6, 0].includes(now.getDay()) ? 1 : 0];

export function status(p) {
  const st = shopOpen(p);
  return h("span", { class: `pk-status ${st.open ? "open" : ""}` }, st.open ? "● " : "○ ", st.label.replace(/^Closed · o/, "O"));
}

const logo = (p, cls) => h("span", { class: `el-logo ${cls} ph-logo` }, h("img", { src: p.logo, alt: "Putthaus logo" }));

const buttons = (p, { compact = false } = {}) => h("div", { class: "el-btns" },
  ext(p.book_sim, "🏌️ Book a simulator ↗", `btn-primary el-call${compact ? " compact" : ""}`),
  h("a", { class: `pill-btn el-shop-2${compact ? " compact" : ""}`, href: tel(p.phone) }, "📞 Call"));

/** Today's rate card: adult price big, the others below. */
export function rateCard(p, { compact = false } = {}) {
  const r = todaysRates(p), adult = r.rows.find(([w]) => /adult/i.test(w));
  return h("div", { class: `ph-rate${compact ? " compact" : ""}` },
    h("div", { class: "ph-rate-top" }, h("span", {}, `Mini golf today · ${r.label}`), h("b", {}, adult[1]), h("small", {}, "adults")),
    h("ul", { role: "list" }, r.rows.filter((x) => x !== adult).map(([w, v]) => h("li", {}, h("span", {}, w), h("b", {}, v))),
      h("li", {}, h("span", {}, "3 & under"), h("b", {}, "Free"))));
}

export function putthausTile(p, size, head) {
  const top = h("div", { class: "lib-tile-head" }, head("flag", p.color, "Putthaus"), logo(p, size));
  const info = h("div", { class: "el-info" }, h("div", { class: "bb-next-label ph-kind" }, "Mini golf & simulators"), status(p),
    h("p", { class: "tile-meta el-where" }, "📍 ", p.address_short, " · downtown"));
  const photo = (cls) => h("img", { class: `ph-photo ${cls}`, src: p.photos[0].src, alt: p.photos[0].alt, loading: "lazy" });
  if (size === "s") return h("div", { class: "tile-body" }, top, info);
  if (size === "m") return h("div", { class: "tile-body" }, top, h("div", { class: "tile-split top el-m" },
    h("div", {}, info, buttons(p, { compact: true })), h("div", {}, rateCard(p, { compact: true }))));
  if (size === "l") return h("div", { class: "tile-body" }, top, h("div", { class: "tile-split top ph-l" },
    h("div", {}, info, rateCard(p, { compact: true }), buttons(p, { compact: true })), photo("l")));
  return h("div", { class: "tile-body" }, top, h("div", { class: "tile-split top ph-xl" },
    h("div", { class: "el-xl-side" }, info, rateCard(p),
      h("p", { class: "tile-meta ph-challenge" }, "🎯 ", h("b", {}, p.challenge.title), `: ${p.challenge.detail}`), buttons(p, { compact: true })),
    photo("xl"),
    h("ul", { class: "ph-games", role: "list" }, p.games.map((g) => h("li", {}, h("span", { "aria-hidden": "true" }, g.icon), h("div", {}, h("b", {}, g.title), h("p", {}, g.detail)))))));
}

export function renderPutthaus(p) {
  const root = document.getElementById("putthaus-body");
  fill(root,
    h("section", { class: "card el-hero ph-hero" }, logo(p, "lg"),
      h("div", { class: "el-hero-text" }, h("div", { class: "bb-next-label" }, `${p.tagline_short} · indoor mini golf & golf simulators · West Avenue`),
        status(p), h("p", { class: "tile-meta" }, ext(p.map, `${p.address} ↗`), " · ", h("a", { href: tel(p.phone) }, p.phone), " · ", h("a", { href: `mailto:${p.email}` }, p.email)),
        h("p", { class: "tile-meta" }, "Open every day, 10 AM – 10 PM")),
      h("div", { class: "el-hero-actions" }, buttons(p), ext(p.party, "🎉 Plan a party ↗", "pill-btn"), ext(p.map, "Directions ↗", "pill-btn"))),
    h("div", { class: "ph-photos" }, p.photos.map((x) => h("img", { src: x.src, alt: x.alt, loading: "lazy" }))),
    h("div", { class: "el-two" },
      h("section", { class: "card" }, h("h3", {}, "Mini golf rates"),
        h("div", { class: "ph-rate-cols" }, p.rates.map((r) => h("div", {}, h("h4", {}, r.label),
          h("ul", { class: "ph-rate-list", role: "list" }, r.rows.map(([w, v]) => h("li", {}, h("span", {}, w), h("b", {}, v))))))),
        h("p", { class: "tile-meta" }, p.rates_note),
        h("p", {}, "🎯 ", h("b", {}, p.challenge.title), `: ${p.challenge.detail}`)),
      h("section", { class: "card" }, h("h3", {}, "Ways to play"),
        h("ul", { class: "ph-games big", role: "list" }, p.games.map((g) => h("li", {}, h("span", { "aria-hidden": "true" }, g.icon), h("div", {}, h("b", {}, g.title), h("p", {}, g.detail))))),
        h("p", { class: "el-links" }, ext(p.book_sim, "Book a simulator ↗"), " · ", ext(p.party, "Party request form ↗")))),
    h("p", { class: "note" }, "Rates, hours and details are machine-parsed from ", ext(p.site, "putthaus.net"), ". Simulator times are booked on Booked Bays; call to check before you go."));
}
