// Shopping tab: local shops, one widget each (Elle's Tique, Sweetest Beginnings, …). Products are read daily from
// each shop's home page (data/generated/<id>.json, etl/build_shops.py); hours and "open now" are worked out on the
// device. A shop can carry one dated event (a Black Friday sale), shown up to and on its day, and special hours for
// given dates (`special`: closed for Thanksgiving, open late on Black Friday), which override its weekly hours.
import { h, fill } from "../ui.js";
import { hoursTable, fmtClock } from "./made.js";

export const SHOPS = ["ellestique", "sweetest", "cardiacs"]; // tile and window order
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
export function specialList(s, now = new Date()) {
  const from = ymd(now), to = ymd(new Date(now.getTime() + 14 * 864e5));
  const list = (s.special || []).filter((x) => x.date >= from && x.date <= to).sort((a, b) => a.date.localeCompare(b.date));
  if (!list.length) return null;
  return h("ul", { class: "gem-prices el-special", role: "list" }, list.map((x) => h("li", { class: x.date === from ? "today" : "" },
    h("span", {}, new Date(`${x.date}T12:00`).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" }), x.label ? ` (${x.label})` : ""),
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

export const shopButton = (s, { compact = false, label = "Shop online ↗" } = {}) =>
  h("a", { class: `btn-primary el-shop${compact ? " compact" : ""}`, href: s.site, target: "_blank", rel: "noopener" }, label);

/** "📍 109 West Ave · downtown" */
export const where = (s) => h("p", { class: "tile-meta el-where" }, "📍 ", s.address.split(",")[0], s.area ? ` · ${s.area}` : "");

/** The tile for one shop, at any size. */
export function shopTile(s, size, head) {
  const top = h("div", { class: "lib-tile-head" }, head("bag", s.color, s.short || s.name), shopLogo(s, `el-logo ${size}`));
  const info = h("div", { class: "el-info" }, h("div", { class: "bb-next-label" }, s.kind), shopStatus(s, { compact: true }), where(s));
  const label = s.arrivals_label || "New arrivals";
  if (size === "s") return h("div", { class: "tile-body" }, top, info, eventLine(s, { compact: true }));
  if (size === "m") return h("div", { class: "tile-body" }, top, h("div", { class: "tile-split top el-m" },
    h("div", {}, info, eventLine(s, { compact: true }), shopButton(s, { compact: true })), h("div", {}, items(s, 2, { compact: true }))));
  if (size === "l") return h("div", { class: "tile-body" }, top, info, eventLine(s, { compact: true }),
    h("div", { class: "mini-head" }, label), items(s, 4, { compact: true }), shopButton(s, { compact: true }));
  return h("div", { class: "tile-body" }, top, h("div", { class: "tile-split top el-xl" },
    h("div", {}, info, eventLine(s) || (s.notes?.[0] ? h("p", { class: "tile-meta el-note" }, s.notes[0]) : null), shopButton(s, { compact: true })),
    h("div", {}, h("div", { class: "mini-head bb-mh" }, label), items(s, 6, { compact: true }))));
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
        shopStatus(s),
        h("p", { class: "tile-meta" }, ext(s.map, `${s.address} ↗`), s.directions ? ` · ${s.directions}` : "")),
      h("div", { class: "el-hero-actions" }, shopButton(s), ext(s.map, "Directions ↗", "pill-btn"))),
    ev ? h("section", { class: "card el-event-card" }, h("h3", {}, `${ev.when}: ${ev.title}`), h("p", {}, ev.detail),
      ev.url ? h("p", {}, ext(ev.url, "Details ↗")) : null) : null,
    s.notes?.length ? h("section", { class: "card el-notes" }, h("ul", { role: "list" }, s.notes.map((n) => h("li", {}, n)))) : null,
    s.arrivals?.length ? h("section", { class: "card" }, h("h3", {}, label), items(s, 12),
      s.arrivals_url ? h("p", { class: "tile-meta" }, ext(s.arrivals_url, s.arrivals_more || "See more ↗")) : null) : null,
    h("div", { class: "el-two" },
      h("section", { class: "card" }, h("h3", {}, "Hours"), hoursTable(s), s.hours_note ? h("p", { class: "tile-meta" }, s.hours_note) : null,
        specialList(s) ? [h("h3", { class: "el-special-h" }, "Special hours"), specialList(s)] : null,
        s.phone ? h("p", { class: "tile-meta" }, h("a", { href: `tel:${s.phone.replace(/\D/g, "")}` }, `☎ ${s.phone}`)) : null),
      h("section", { class: "card" }, h("h3", {}, "Shop by category"),
        h("div", { class: "el-chips" }, s.shop.map((c) => ext(c.url, c.label, "chip"))),
        s.links?.length ? h("p", { class: "el-links" }, s.links.flatMap((l, i) => [i ? " · " : null, ext(l.url, l.label)])) : null)),
    h("section", { class: "card" }, h("h3", {}, "About the shop"), h("p", {}, s.about),
      s.social?.length ? h("p", { class: "el-links" }, "Follow along: ", s.social.flatMap((x, i) => [i ? " · " : null, ext(x.url, `${x.label} ↗`)])) : null),
    h("p", { class: "note" }, `${label} and the shop's notices are read once a day from `, ext(s.site, s.site.replace(/^https?:\/\//, "")),
      "; hours and details are machine-parsed from the same site. Prices and stock change: check the shop before you go."));
}
