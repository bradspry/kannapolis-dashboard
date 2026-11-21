// Cabarrus County Public Library: a catalog search box, plus upcoming events with Kannapolis's two
// branches (KAN = Kannapolis Library, AFT = Afton Ridge) up front. Events come from the library's
// public events calendar; the search box just opens the library catalog with the visitor's search.
import { h } from "../ui.js";

const parse = (s) => { const [d, t = "00:00"] = s.split("T"); const [y, m, dd] = d.split("-").map(Number); const [hh, mm] = t.split(":").map(Number); return new Date(y, m - 1, dd, hh, mm); };
const day0 = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const fmtTime = (d) => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).replace(":00", "");
export function dayLabel(d, o = { weekday: "short", month: "short", day: "numeric" }) {
  const diff = Math.round((day0(d) - day0(new Date())) / 864e5);
  return diff === 0 ? "Today" : diff === 1 ? "Tomorrow" : d.toLocaleDateString("en-US", o);
}
const ext = (href, label, cls) => h("a", { href, target: "_blank", rel: "noopener", class: cls }, label);
const isLocal = (lib, e) => lib.kannapolis_branches.includes(e.branch);

/** Programs still to come (not closures), soonest first; `local` keeps only KAN and AFT. */
export function upcoming(lib, { local = false, branch = null, audience = null } = {}) {
  const now = new Date();
  return lib.events.map((e) => ({ ...e, _s: parse(e.start), _e: parse(e.end) }))
    .filter((e) => !e.closure && e._e > now && (!local || isLocal(lib, e)) && (!branch || e.branch === branch)
      && (!audience || e.audience.includes(audience)));
}

/** Closures in the next two weeks ("All libraries closed", early closings). */
export function closures(lib, days = 14) {
  const now = new Date(), until = new Date(now.getTime() + days * 864e5);
  return lib.events.filter((e) => e.closure).map((e) => ({ ...e, _s: parse(e.start), _e: parse(e.end) }))
    .filter((e) => e._e > now && e._s < until);
}

export const branchBadge = (lib, code) => code
  ? h("span", { class: `lib-badge b-${code.toLowerCase()}${lib.kannapolis_branches.includes(code) ? " local" : ""}`, title: lib.branches[code]?.name }, code)
  : null;

/** The catalog search box. Submitting opens the catalog's results in a new tab. */
// The home screen can redraw while someone is typing (live weather updates), so the tile's search box
// keeps its text and focus across redraws.
const drafts = new Map();
let focusedId = null;
export function searchBox(lib, { compact = false, id = "lib-q" } = {}) {
  const input = h("input", { type: "search", id, name: "qu", placeholder: compact ? "Search the catalog" : "Search books, movies, audiobooks, ebooks…", required: true, autocomplete: "off", enterkeyhint: "search",
    oninput: (e) => drafts.set(id, e.target.value), onfocus: () => (focusedId = id), onblur: (e) => { const el = e.target; setTimeout(() => { if (el.isConnected && focusedId === id) focusedId = null; }); } });
  input.value = drafts.get(id) || "";
  if (focusedId === id) requestAnimationFrame(() => { if (input.isConnected) { input.focus(); input.setSelectionRange(input.value.length, input.value.length); } });
  return h("form", { class: `lib-search${compact ? " compact" : ""}`, role: "search", action: lib.catalog.search.split("?")[0], method: "get", target: "_blank",
    onsubmit: (e) => {
      e.preventDefault();
      const q = input.value.trim();
      if (q) window.open(lib.catalog.search + encodeURIComponent(q), "_blank", "noopener");
    } },
    h("label", { class: "visually-hidden", for: id }, "Search the Cabarrus County Public Library catalog"),
    input, h("button", { type: "submit", class: "lib-search-btn" }, compact ? "Search" : "Search catalog"));
}

/** One event row; `dim` mutes branches outside Kannapolis. */
export function eventRow(lib, e, { showDay = true, dim = false, compact = false, badge = true } = {}) {
  const time = e.all_day ? "All day" : fmtTime(e._s);
  return h("li", { class: `lib-ev${dim && !isLocal(lib, e) ? " dim" : ""}${e.special ? " special" : ""}${badge ? "" : " no-badge"}` },
    compact
      ? h("span", { class: "lib-ev-when" }, h("b", {}, dayLabel(e._s, { month: "short", day: "numeric" })), ` ${time}`)
      : h("span", { class: "lib-ev-when" }, showDay ? h("b", {}, dayLabel(e._s)) : null, time),
    h("span", { class: "lib-ev-main" },
      h("a", { href: e.url, target: "_blank", rel: "noopener", class: "lib-ev-title" }, e.special ? h("span", { class: "lib-star", title: "Special event" }, "★ ") : null, e.title),
      compact ? null : h("small", {}, [lib.branches[e.branch]?.short || e.venue, e.audience.map((a) => lib.audiences.find((x) => x.key === a)?.label).join(", ")].filter(Boolean).join(" · "))),
    badge ? branchBadge(lib, e.branch) : null);
}

export function closureNote(lib, { compact = false } = {}) {
  const c = closures(lib);
  if (!c.length) return null;
  return h("p", { class: `lib-closed${compact ? " compact" : ""}` }, h("span", { "aria-hidden": "true" }, "⚠️ "),
    ...c.slice(0, compact ? 1 : 3).flatMap((x, i) => [i ? " · " : "", h("b", {}, dayLabel(x._s, { weekday: "short", month: "short", day: "numeric" })), ": ",
      x.title.replace(/^ALL LIBRARIES /i, "All libraries ").replace(/\b(CLOSED?|AT|PM)\b/g, (w) => w.toLowerCase()).replace(/(\d)pm/i, "$1 p.m.")]));
}

const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const at = (d, hm) => { const [hh, mm] = hm.split(":").map(Number); return new Date(d.getFullYear(), d.getMonth(), d.getDate(), hh, mm); };
/** Hours for one date: regular hours, cut short or cancelled by the calendar's closure notices. */
function hoursOn(lib, code, d) {
  const reg = lib.branches[code].hours?.[DAYS[d.getDay()]];
  if (!reg) return null;
  let [open, close] = [at(d, reg[0]), at(d, reg[1])];
  for (const c of closures(lib, 60)) {
    if (day0(c._s).getTime() !== day0(d).getTime()) continue;
    if (c.branch && c.branch !== code) continue;
    const m = c.title.match(/CLOSE[SD]?\s+AT\s+(\d{1,2})(?::(\d\d))?\s*([AP])\.?M/i);
    if (m) close = at(d, `${(+m[1] % 12) + (m[3].toUpperCase() === "P" ? 12 : 0)}:${m[2] || "00"}`);
    else return null;
  }
  return close > open ? [open, close] : null;
}
/** "Open now · until 8 PM" or "Closed · opens Mon 9 AM". */
export function openStatus(lib, code) {
  if (!lib.branches[code].hours) return null;
  const now = new Date(), today = hoursOn(lib, code, now);
  if (today && now >= today[0] && now < today[1]) return { open: true, text: `Open until ${fmtTime(today[1])}` };
  for (let i = 0; i < 8; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i), hrs = hoursOn(lib, code, d);
    if (hrs && hrs[0] > now) return { open: false, text: `Closed · opens ${i === 0 ? "" : i === 1 ? "tomorrow " : `${d.toLocaleDateString("en-US", { weekday: "short" })} `}${fmtTime(hrs[0])}` };
  }
  return { open: false, text: "Closed" };
}
export function statusLine(lib, codes = lib.kannapolis_branches) {
  const sts = codes.map((c) => [c, openStatus(lib, c)]).filter(([, st]) => st);
  // Same hours at both branches (the usual case): say it once.
  const groups = sts.length > 1 && sts.every(([, st]) => st.text === sts[0][1].text) ? [[sts.map(([c]) => c), sts[0][1]]] : sts.map(([c, st]) => [[c], st]);
  return h("p", { class: "lib-status" }, groups.map(([cs, st]) => h("span", {}, ...cs.map((c) => branchBadge(lib, c)), h("i", { class: st.open ? "on" : "off", "aria-hidden": "true" }), st.text)));
}

let audience = null, scope = "local";

export function renderLibrary(lib) {
  const root = document.getElementById("library-body");
  const list = h("div", { class: "lib-days" });
  const chips = h("div", { class: "lib-filters" });
  const draw = () => {
    const chip = (label, on, fn) => h("button", { class: "chip", type: "button", "aria-pressed": String(on), onclick: () => { fn(); draw(); } }, label);
    chips.replaceChildren(
      h("div", { class: "chips", role: "group", "aria-label": "Branches" },
        chip("Kannapolis branches", scope === "local", () => (scope = "local")),
        chip("Kannapolis Library (KAN)", scope === "KAN", () => (scope = "KAN")),
        chip("Afton Ridge (AFT)", scope === "AFT", () => (scope = "AFT")),
        chip("All branches", scope === "all", () => (scope = "all"))),
      h("div", { class: "chips", role: "group", "aria-label": "Who it's for" },
        chip("Everyone", !audience, () => (audience = null)),
        ...lib.audiences.map((a) => chip(a.label, audience === a.key, () => (audience = a.key)))));
    const evs = upcoming(lib, { local: scope === "local", branch: ["KAN", "AFT"].includes(scope) ? scope : null, audience });
    const days = new Map();
    for (const e of evs) { const k = day0(e._s).getTime(); if (!days.has(k)) days.set(k, []); days.get(k).push(e); }
    list.replaceChildren(...(evs.length ? [...days.values()].slice(0, 14).map((d) =>
      h("section", { class: "lib-day" }, h("h4", {}, dayLabel(d[0]._s, { weekday: "long", month: "long", day: "numeric" })),
        h("ul", { class: "lib-evs", role: "list" }, d.map((e) => eventRow(lib, e, { showDay: false, dim: scope === "all" })))))
      : [h("p", { class: "tile-meta" }, "No matching events in the next four weeks.")]));
  };

  const branchCard = (code) => {
    const b = lib.branches[code], next = upcoming(lib, { branch: code })[0];
    return h("section", { class: "card lib-branch" },
      h("div", { class: "lib-branch-head" }, branchBadge(lib, code), h("h3", {}, b.name)),
      h("p", { class: "tile-meta" }, ext(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(b.address)}`, b.address),
        b.phone ? [" · ", h("a", { href: `tel:${b.phone.replace(/[^0-9]/g, "")}` }, b.phone)] : null),
      statusLine(lib, [code]), b.hours_text ? h("p", { class: "tile-meta" }, b.hours_text) : null,
      next ? h("p", { class: "lib-branch-next" }, h("span", {}, "Next: "), ext(next.url, next.title), ` · ${dayLabel(next._s)}, ${fmtTime(next._s)}`) : null,
      h("p", { class: "tile-meta" }, `${upcoming(lib, { branch: code }).length} events in the next four weeks`));
  };

  root.replaceChildren(
    h("section", { class: "card lib-hero" },
      lib.logo ? h("div", { class: "lib-logo" }, h("img", { src: lib.logo, alt: "Cabarrus County Public Library System" })) : null,
      h("h3", {}, "Search the library catalog"),
      searchBox(lib, { id: "lib-q-win" }),
      h("p", { class: "tile-meta" }, "Opens the Cabarrus County Public Library catalog in a new tab, where you can place holds with your library card. ",
        ext(lib.catalog.home, "Catalog home ↗"), " · ", ext(lib.links.get_card, "Get a library card ↗"), " · ", ext(lib.links.locations, "All locations & hours ↗"), " · ", ext(lib.links.home, "Library website ↗"))),
    closureNote(lib),
    h("div", { class: "grid" }, branchCard("KAN"), branchCard("AFT")),
    h("section", { class: "card" },
      h("h3", {}, "Upcoming events"),
      h("p", { class: "sub" }, "Free programs from the library's events calendar. ★ = special event. Tap an event for details and registration."),
      chips, list),
    h("div", { class: "pk-links" }, ext(lib.links.events, "Full events calendar ↗"), ext(lib.catalog.home, "Library catalog ↗"), ext(lib.links.locations, "All locations & hours ↗"), ext(lib.links.get_card, "Get a library card ↗")),
    h("p", { class: "note" }, `Events read daily from the library's public events calendar (updated ${lib.generated}). Branch hours from the library's Locations page; holiday closures from the events calendar. The catalog is searched on the library's own site.`));
  draw();
}
