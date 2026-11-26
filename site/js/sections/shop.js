// Shopping tab: local shops, one widget each (Elle's Tique, Sweetest Beginnings, …). Products are read daily from
// each shop's home page (data/generated/<id>.json, etl/build_shops.py); hours and "open now" are worked out on the
// device. A shop can carry one dated event (a Black Friday sale), shown up to and on its day, and special hours for
// given dates (`special`: closed for Thanksgiving, open late on Black Friday), which override its weekly hours.
import { h, fill } from "../ui.js";
import { hoursTable, fmtClock } from "./made.js";

export const SHOPS = ["ellestique", "sweetest", "cardiacs", "spicetea", "cookcattle"]; // tile and window order
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const mins = (t) => { const [hh, mm] = t.split(":").map(Number); return hh * 60 + mm; };
const ext = (href, label, cls) => h("a", { href, target: "_blank", rel: "noopener", class: cls }, label);
const ymd = (d) => d.toLocaleDateString("en-CA");

export const shopLogo = (s, cls = "el-logo") => (s.logo ? h("span", { class: `${cls}${s.logo_wide ? " wide" : ""}` }, h("img", { src: s.logo, alt: `${s.name} logo` })) : null);

/** A day's hours: { open, close } or null (closed), with a date's special hours winning over the weekly ones. */
export function hoursOn(s, d) {
  const sp = (s.special || []).find((x) => x.date === ymd(d));
  if (sp) return sp.closed ? null : { open: sp.open, close: sp.close, special: sp.label || true };
  return s.hours.find((r) => r.days.includes(d.getDay())) || null;
}

/** Open now? If not, when it opens next (special hours included). */
export function shopOpen(s, now = new Date()) {
  const t = now.getHours() * 60 + now.getMinutes(), today = hoursOn(s, now);
  if (today && t >= mins(today.open) && t < mins(today.close)) {
    const left = mins(today.close) - t;
    return { open: true, label: left <= 60 ? `Open, closes soon (${fmtClock(today.close)})` : `Open until ${fmtClock(today.close)}` };
  }
  if (today && t < mins(today.open)) return { open: false, label: `Closed · opens ${fmtClock(today.open)} today` };
  for (let i = 1; i <= 7; i++) {
    const d = new Date(now); d.setDate(d.getDate() + i);
    const r = hoursOn(s, d);
    if (r) return { open: false, label: `Closed · opens ${i === 1 ? "tomorrow" : DAYS[d.getDay()]} ${fmtClock(r.open)}` };
  }
  return { open: false, label: "Closed" };
}

/** Special hours in the next two weeks: "Thursday, Nov 26: Closed (Thanksgiving)". */
export function specialList(s, now = new Date(), { days = 14, max = 99, compact = false } = {}) {
  const from = ymd(now), to = ymd(new Date(now.getTime() + days * 864e5));
  const list = (s.special || []).filter((x) => x.date >= from && x.date <= to).sort((a, b) => a.date.localeCompare(b.date)).slice(0, max);
  if (!list.length) return null;
  return h("ul", { class: `gem-prices el-special${compact ? " compact" : ""}`, role: "list" }, list.map((x) => h("li", { class: x.date === from ? "today" : "" },
    h("span", {}, new Date(`${x.date}T12:00`).toLocaleDateString("en-US", compact ? { weekday: "short", month: "short", day: "numeric" } : { weekday: "long", month: "short", day: "numeric" }),
      x.label ? ` (${x.label})` : ""),
    h("b", {}, x.closed ? "Closed" : `${fmtClock(x.open)} – ${fmtClock(x.close)}`))));
}

export function shopStatus(s, { compact = false } = {}) {
  const st = shopOpen(s);
  return h("span", { class: `pk-status ${st.open ? "open" : ""}` }, st.open ? "● " : "○ ", compact ? st.label.replace(/^Closed · o/, "O") : st.label);
}

/** The shop's event while it's coming up (from show_from) through its day; null otherwise. Adds a `when` label. */
export function shopEvent(s, now = new Date()) {
  const e = s.event, today = ymd(now);
  if (!e || today > e.date || (e.show_from && today < e.show_from)) return null;
  const days = Math.round((new Date(`${e.date}T12:00`) - new Date(`${today}T12:00`)) / 864e5);
  const when = days === 0 ? "Today" : days === 1 ? "Tomorrow" : new Date(`${e.date}T12:00`).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
  return { ...e, days, when };
}
export function eventLine(s, { compact = false } = {}) {
  const e = shopEvent(s);
  if (!e) return null;
  const when = compact && e.days > 1 ? new Date(`${e.date}T12:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : e.when;
  // compact: the two-line clamp sits on an inner span, so a third line can't peek into the padding
  return h("p", { class: `el-event${compact ? " compact" : ""}` }, h("span", { class: "el-event-text" }, h("b", {}, `${when}: `), e.title, compact ? null : ` · ${e.detail}`));
}

/** One product: picture, name, price (and the struck-through price on sale). */
export function item(a, { compact = false } = {}) {
  return h("li", { class: `el-item${compact ? " compact" : ""}` },
    h("a", { href: a.url, target: "_blank", rel: "noopener", class: "el-item-link" },
      a.image ? h("img", { src: a.image, alt: "", loading: "lazy" }) : h("span", { class: "el-noimg", "aria-hidden": "true" }, "🛍"),
      h("span", { class: "el-item-name" }, a.name),
      h("span", { class: "el-item-price" }, a.was ? h("s", {}, a.was) : null, a.was ? " " : null, a.price || "", a.sold_out ? h("em", {}, " · Sold out") : null)));
}
export const items = (s, n, o) => h("ul", { class: `el-grid${o?.compact ? " compact" : ""}`, role: "list" }, (s.arrivals || []).slice(0, n).map((a) => item(a, o)));

/** "Shop online" plus, for a shop that takes phone orders (`call_button`), a Call button beside it. */
export const shopButtons = (s, o = {}) => (s.call_button && s.phone
  ? h("div", { class: "el-btns" }, h("a", { class: `btn-primary el-call${o.compact ? " compact" : ""}`, href: `tel:${s.phone.replace(/\D/g, "")}`, "aria-label": `Call ${s.name}, ${s.phone}` }, "📞 Call"),
    h("a", { class: `pill-btn el-shop-2${o.compact ? " compact" : ""}`, href: s.site, target: "_blank", rel: "noopener" }, "Shop online ↗"),
    ...(s.social_buttons ? (s.social || []).map((x) => h("a", { class: `pill-btn el-shop-2 el-social${o.compact ? " compact" : ""}`, href: x.url, target: "_blank", rel: "noopener", "aria-label": `${s.name} on ${x.label}` }, `${x.label} ↗`)) : []))
  : shopButton(s, o));

export const shopButton = (s, { compact = false, label = "Shop online ↗" } = {}) =>
  h("a", { class: `btn-primary el-shop${compact ? " compact" : ""}`, href: s.site, target: "_blank", rel: "noopener" }, label);

/** "📍 109 West Ave · downtown" */
/** "Owned by Claire" */
export const owner = (s, cls = "tile-meta el-owner") => (s.owner ? h("p", { class: cls }, `Owned by ${s.owner}`) : null);

export const where = (s) => h("p", { class: "tile-meta el-where" }, "📍 ", s.address_short || s.address.split(",")[0], s.area ? ` · ${s.area}` : "");

/** The tile for one shop, at any size. */
export function shopTile(s, size, head) {
  // An owner with a photo sits at the right of the header, like the police and fire chiefs; otherwise a line under the kind.
  const hd = head("bag", s.color, s.short || s.name);
  if (s.owner_photo) {
    hd.classList.add("tile-head-chief");
    hd.append(h("div", { class: "tile-chief" }, h("div", { class: "tile-chief-text" }, h("b", {}, s.owner), h("span", {}, "Owner")),
      h("img", { src: s.owner_photo, alt: `${s.owner}, owner`, loading: "lazy" })));
  }
  const top = h("div", { class: "lib-tile-head" }, hd, shopLogo(s, `el-logo ${size}`));
  const info = h("div", { class: "el-info" }, h("div", { class: "bb-next-label" }, s.kind), s.owner_photo ? null : owner(s), shopStatus(s, { compact: true }), where(s));
  if (!s.arrivals?.length && s.photo && size !== "s") return photoTile(s, size, top, info);
  const label = s.arrivals_label || "New arrivals";
  if (size === "s") return h("div", { class: "tile-body" }, top, info, eventLine(s, { compact: true }));
  if (size === "m") return h("div", { class: "tile-body" }, top, h("div", { class: "tile-split top el-m" },
    h("div", {}, info, eventLine(s, { compact: true }), shopButton(s, { compact: true })), h("div", {}, items(s, 2, { compact: true }))));
  if (size === "l") return h("div", { class: "tile-body" }, top, info, eventLine(s, { compact: true }),
    h("div", { class: "mini-head" }, label), items(s, 4, { compact: true }), shopButton(s, { compact: true }));
  // Extra-large: the shop's story on the left (event, notices, the week's hours, categories), and two rows of
  // products on the right (fit.js trims the grid if a row won't fit).
  return h("div", { class: "tile-body" }, top, h("div", { class: "tile-split top el-xl" },
    h("div", { class: "el-xl-side" }, info, eventLine(s, { compact: true }),
      s.notes?.length ? h("ul", { class: "el-xl-notes", role: "list" }, s.notes.slice(0, 2).map((n) => h("li", {}, n))) : null,
      h("p", { class: "tile-meta el-xl-hours" }, "🕒 ", hoursSummary(s)),
      h("div", { class: "el-chips compact" }, s.shop.slice(0, 6).map((c) => h("a", { href: c.url, target: "_blank", rel: "noopener", class: "chip" }, c.label))),
      ktownLine(s), shopButtons(s, { compact: true })),
    h("div", {}, h("div", { class: "mini-head bb-mh" }, label), items(s, 10, { compact: true }))));
}

/** A shop with no product list a page carries (its chain's catalog answers automated clients with 429): the
 *  storefront photo, its notices, and the special hours coming up (holidays, the parade). */
const photo = (s, cls = "el-photo") => h("img", { class: cls, src: s.photo, alt: s.photo_alt || `${s.name} storefront`, loading: "lazy" });
function photoTile(s, size, top, info) {
  const coming = specialList(s, new Date(), { days: 45, max: size === "xl" ? 5 : 3, compact: true });
  const notes = s.notes?.length ? h("ul", { class: "el-xl-notes", role: "list" }, s.notes.slice(0, 2).map((n) => h("li", {}, n))) : null;
  if (size === "m") return h("div", { class: "tile-body" }, top, h("div", { class: "tile-split top el-m" },
    h("div", {}, info, shopButtons(s, { compact: true })), h("div", {}, photo(s, "el-photo m"))));
  if (size === "l") return h("div", { class: "tile-body" }, top, info, photo(s, "el-photo l"),
    coming ? [h("div", { class: "mini-head" }, "Holiday hours"), coming] : notes, shopButtons(s, { compact: true }));
  return h("div", { class: "tile-body" }, top, h("div", { class: "tile-split top el-xl" },
    h("div", { class: "el-xl-side" }, info, notes, h("p", { class: "tile-meta el-xl-hours" }, "🕒 ", hoursSummary(s)),
      h("div", { class: "el-chips compact" }, s.shop.slice(0, 6).map((c) => h("a", { href: c.url, target: "_blank", rel: "noopener", class: "chip" }, c.label))),
      shopButtons(s, { compact: true })),
    h("div", { class: "el-photo-col" }, photo(s, "el-photo xl"), coming ? [h("div", { class: "mini-head" }, "Holiday hours"), coming] : null)));
}

/** K-Town Connection episodes about the shop (build_shops ktown_for): a thumbnail with a play mark, the episode, the title. */
export function ktownLine(s, { compact = true } = {}) {
  const e = s.ktown?.[0]; if (!e) return null;
  return h("a", { class: `el-ktown${compact ? " compact" : ""}`, href: e.url, target: "_blank", rel: "noopener" },
    h("span", { class: "el-ktown-thumb" }, h("img", { src: e.thumb, alt: "", loading: "lazy" }), h("i", { "aria-hidden": "true" }, "▶")),
    h("span", { class: "el-ktown-text" }, h("small", {}, `🎙 On K-Town Connection · EP ${e.ep}`), h("b", {}, e.title)));
}
export function ktownCard(s) {
  if (!s.ktown?.length) return null;
  return h("section", { class: "card" }, h("h3", {}, `${s.short || s.name} on K-Town Connection`),
    h("ul", { class: "el-ktown-list", role: "list" }, s.ktown.map((e) => h("li", {},
      h("a", { class: "el-ktown-thumb big", href: e.url, target: "_blank", rel: "noopener", "aria-label": `Watch EP ${e.ep}: ${e.title}` }, h("img", { src: e.thumb, alt: "", loading: "lazy" }), h("i", { "aria-hidden": "true" }, "▶")),
      h("div", {}, h("small", {}, `EP ${e.ep} · ${new Date(`${e.date}T12:00`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`),
        h("b", {}, h("a", { href: e.url, target: "_blank", rel: "noopener" }, e.title)), e.summary ? h("p", {}, e.summary) : null)))),
    h("p", { class: "tile-meta" }, "From the K-Town Connection podcast, the Kannapolis show on YouTube."));
}

/** The week in one line: "Tue–Fri 11 AM – 6 PM · Sat 10 AM – 6 PM · Sun 1 – 4 PM · Mon closed". */
export function hoursSummary(s) {
  const order = [1, 2, 3, 4, 5, 6, 0], short = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const key = (d) => { const r = s.hours.find((x) => x.days.includes(d)); return r ? `${fmtClock(r.open)} – ${fmtClock(r.close)}` : "closed"; };
  // Group the days with the same hours wherever they fall in the week, then write each group's days as runs:
  // "Tue, Thu–Fri 4 PM – 7 PM · Sat 9 AM – 1 PM · Mon, Wed, Sun closed".
  const groups = new Map();
  for (const d of order) groups.set(key(d), [...(groups.get(key(d)) || []), d]);
  const days = (list) => {
    const runs = [];
    for (const d of list) {
      const last = runs.at(-1);
      if (last && order.indexOf(d) === order.indexOf(last.to) + 1) last.to = d; else runs.push({ from: d, to: d });
    }
    return runs.map((r) => (r.from === r.to ? short[r.from] : `${short[r.from]}–${short[r.to]}`)).join(", ");
  };
  const parts = [...groups].filter(([k]) => k !== "closed").map(([k, list]) => `${days(list)} ${k}`);
  if (groups.has("closed")) parts.push(`${days(groups.get("closed"))} closed`);
  return parts.join(" · ");
}

export function renderShop(s) {
  const root = document.getElementById(`${s.id}-body`);
  root.style.setProperty("--el-color", s.color);
  const ev = shopEvent(s), label = s.arrivals_label || "New arrivals";
  fill(root,
    h("section", { class: "card el-hero" }, shopLogo(s, "el-logo lg"),
      h("div", { class: "el-hero-text" },
        h("div", { class: "bb-next-label" }, [s.kind, s.area_long || s.area].filter(Boolean).join(" · ")),
        h("p", { class: "el-tagline" }, s.tagline),
        s.owner_photo ? null : owner(s, "el-owner win"),
        shopStatus(s),
        h("p", { class: "tile-meta" }, ext(s.map, `${s.address} ↗`), s.directions ? ` · ${s.directions}` : "")),
      h("div", { class: "el-hero-actions" }, shopButtons(s), ext(s.map, "Directions ↗", "pill-btn"))),
    ev ? h("section", { class: "card el-event-card" }, h("h3", {}, `${ev.when}: ${ev.title}`), h("p", {}, ev.detail),
      ev.url ? h("p", {}, ext(ev.url, "Details ↗")) : null) : null,
    s.notes?.length ? h("section", { class: "card el-notes" }, h("ul", { role: "list" }, s.notes.map((n) => h("li", {}, n)))) : null,
    !s.arrivals?.length && s.photo ? h("section", { class: "card el-photo-card" }, photo(s, "el-photo win")) : null,
    s.arrivals?.length ? h("section", { class: "card" }, h("h3", {}, label), items(s, 12),
      s.arrivals_url ? h("p", { class: "tile-meta" }, ext(s.arrivals_url, s.arrivals_more || "See more ↗")) : null) : null,
    h("div", { class: "el-two" },
      h("section", { class: "card" }, h("h3", {}, "Hours"), hoursTable(s), s.hours_note ? h("p", { class: "tile-meta" }, s.hours_note) : null,
        specialList(s, new Date(), { days: s.no_products ? 60 : 14 }) ? [h("h3", { class: "el-special-h" }, s.no_products ? "Holiday hours" : "Special hours"), specialList(s, new Date(), { days: s.no_products ? 60 : 14 })] : null,
        s.phone ? h("p", { class: "tile-meta" }, h("a", { href: `tel:${s.phone.replace(/\D/g, "")}` }, `☎ ${s.phone}`), s.email ? [" · ", h("a", { href: `mailto:${s.email}` }, `✉ ${s.email}`)] : null) : null),
      h("section", { class: "card" }, h("h3", {}, "Shop by category"),
        h("div", { class: "el-chips" }, s.shop.map((c) => ext(c.url, c.label, "chip"))),
        s.links?.length ? h("p", { class: "el-links" }, s.links.flatMap((l, i) => [i ? " · " : null, ext(l.url, l.label)])) : null)),
    ktownCard(s),
    h("section", { class: "card" }, h("h3", {}, "About the shop"),
      s.family_photo ? h("figure", { class: "el-family" }, h("img", { src: s.family_photo.src, alt: s.family_photo.alt, loading: "lazy" }),
        s.family_photo.caption ? h("figcaption", {}, s.family_photo.caption) : null) : null,
      s.owner_photo ? h("div", { class: "el-owner-card" }, h("img", { src: s.owner_photo, alt: `${s.owner}, owner of ${s.name}`, loading: "lazy" }),
        h("div", {}, h("b", {}, s.owner), h("span", {}, `Owner, ${s.short || s.name}`))) : null,
      h("p", {}, s.about),
      s.social?.length ? h("p", { class: "el-links" }, "Follow along: ", s.social.flatMap((x, i) => [i ? " · " : null, ext(x.url, `${x.label} ↗`)])) : null),
    s.no_products
      ? h("p", { class: "note" }, "Hours, holiday hours and details are read once a day from the shop's ", ext(s.page || s.site, "store page"),
        ". Hours can change: call before you go.")
      : h("p", { class: "note" }, `${label} and the shop's notices are read once a day from `, ext(s.site, s.site.replace(/^https?:\/\//, "")),
        "; hours and details are machine-parsed from the same site. Prices and stock change: check the shop before you go."));
}
