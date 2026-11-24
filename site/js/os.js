// OS-style shell: folder tabs of home-screen tiles, and windows. Each window hosts one widget <section>,
// rendered on first open and again after theme/width changes. Every tab has its own layout: Edit mode
// adds, removes, resizes and reorders that tab's tiles; layouts are saved per browser (per tab), or for
// everyone via "Save as default" (./serve.sh only), which saves all tabs.
// Home shows every widget unless removed (new widgets appear there by themselves); the other tabs show
// only the widgets put on them.
import { h } from "./ui.js";
import { icon } from "./icons.js";
import { enableDrag, moveBy } from "./drag.js";
import { TABS, defaultMembers, categoryOf, tabById, DEFAULT_PINNED } from "./tabs.js";

const KEY = "kdash-home-layout";          // Home tab: { order: [tile ids], hidden: [tile ids], sizes, spacers }
const keyFor = (t) => (t === "home" ? KEY : `kdash-tab-${t}`); // other tabs: same shape; order = the tab's widgets
const OLD_HIDDEN_KEY = "kdash-hidden-widgets";
let hidden = new Set();
let order = null;                         // full tile order, or null = default
let sizes = {};                           // tile id -> "s" | "m" | "l" | "xl"
let pinned = null;                        // the widget pinned to this tab's top-right corner, if any
let spacers = [];                         // ids of blank-space tiles ("space-…")
export const SIZES = [["s", "Small"], ["m", "Medium"], ["l", "Large"], ["xl", "Extra large"]];
let tab = "home";                         // the open folder tab
let siteDefaults = {};                    // tab id -> layout, from data/manual/home_layout.json
const windows = new Map();   // id -> { title, sub, icon, color, render }
const rendered = new Set();  // windows rendered at the current theme/width
let openId = null, openerTile = null, pushed = false;
let tileDefs = [];           // [{ id, opens, size, build }]
let dialog, winBody, winTitle, winSub, winIcon;

const phone = () => window.matchMedia?.("(max-width: 720px)").matches;
const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
function readLocal(t = tab) {
  try {
    const v = JSON.parse(localStorage.getItem(keyFor(t)) || "null");
    if (v) return v;
    if (t !== "home") return null;
    const old = JSON.parse(localStorage.getItem(OLD_HIDDEN_KEY) || "null"); // earlier versions
    return old ? { order: null, hidden: old } : null;
  } catch { return null; }
}
/** A tab nobody has arranged: its starting widgets (Home: everything). */
const allTileIds = () => (typeof tileDefs === "function" ? tileDefs() : tileDefs).map((d) => d.id);
const builtin = (t) => (t === "home" ? null : { order: defaultMembers(t, allTileIds()), hidden: [], sizes: {}, spacers: [], pinned: DEFAULT_PINNED[t] || null });
const effective = (t) => readLocal(t) || siteDefaults[t] || builtin(t);
const auto = () => tab === "home"; // widgets not in the saved order still show (new ones)
function applyLayout(l) {
  order = l?.order || null; hidden = new Set(l?.hidden || []); sizes = { ...(l?.sizes || {}) };
  spacers = (l?.spacers || []).filter((id) => /^space-[a-z0-9]{1,20}$/.test(id));
  pinned = typeof l?.pinned === "string" ? l.pinned : null;
}
function loadHidden() { applyLayout(effective(tab)); }
function saveHidden() {
  try {
    localStorage.setItem(keyFor(tab), JSON.stringify({ order, hidden: [...hidden], sizes, spacers, pinned }));
    if (tab === "home") localStorage.removeItem(OLD_HIDDEN_KEY);
  } catch { /* private mode: lasts for this visit */ }
}
const isDefaultLayout = () => !readLocal();

/** This tab's tile defs in the saved order. On Home, widgets added since the save go at the bottom. */
function ordered(defs) {
  if (!order) return auto() ? defs.filter((d) => d.home !== false) : [];
  const idx = new Map(order.map((id, i) => [id, i]));
  return [...defs.filter((d) => idx.has(d.id)).sort((a, b) => idx.get(a.id) - idx.get(b.id)),
    ...(auto() ? defs.filter((d) => !idx.has(d.id) && d.home !== false) : [])]; // home: false = added to Home only by hand
}

/** Take a widget off this tab (Home: hide it, so it doesn't come back as "new"). */
function removeTile(id, name) {
  if (auto()) hidden.add(id);
  else { order = ordered(currentDefs).map((d) => d.id).filter((x) => x !== id); delete sizes[id]; }
  saveHidden();
  renderHome();
  announce(`${name} removed from ${tabById(tab).name}.`);
}

/** Add a widget to the bottom of this tab. */
function restore(id, name) {
  hidden.delete(id);
  order = [...ordered(currentDefs).map((d) => d.id).filter((x) => x !== id), id];
  saveHidden();
  renderHome();
  const el = document.querySelector(`[data-tile="${id}"]`);
  el?.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "center" });
  announce(`${name} added to the bottom of ${tabById(tab).name}.`);
}
let currentDefs = [];
/** Called after a drag: visible tiles' new order. Hidden tiles keep their slots. */
function commitOrder(visibleIds) {
  const full = ordered(currentDefs).map((d) => d.id);
  const vis = new Set(visibleIds);
  let k = 0;
  order = full.map((id) => (vis.has(id) ? visibleIds[k++] : id));
  saveHidden();
  syncEditBar();
}

export function chip(name, color, ink) {
  const el = h("span", { class: "chip-icon" }, icon(name, 18));
  el.style.setProperty("--chip", color); // custom properties need setProperty
  if (ink) el.style.color = ink; // dark icon on a light chip (school-bus yellow)
  return el;
}

/** Register a window. `render` fills its <section>. */
export function defineWindow(id, def) { windows.set(id, def); }

/** Register home tiles in order. build() returns the tile's inner content. */
export function defineTiles(defs) { tileDefs = defs; }

// ---------- home screen ----------
export function renderHome() {
  const home = document.getElementById("home");
  const tray = document.getElementById("hidden-tray");
  const tiles = [];
  currentDefs = [...(typeof tileDefs === "function" ? tileDefs() : tileDefs),
    ...spacers.map((id) => ({ id, spacer: true, size: "s", label: "Blank space", build: () => h("span", { class: "spacer-label" }, "Blank space") }))];
  const defs = ordered(currentDefs);
  const homeSizes = tab === "home" ? {} : (effective("home")?.sizes || {}); // a widget new to a tab starts at its Home size
  const okSize = (s) => SIZES.some(([k]) => k === s);
  for (const t of defs) {
    if (hidden.has(t.id)) continue;
    let size = okSize(sizes[t.id]) ? sizes[t.id] : okSize(homeSizes[t.id]) ? homeSizes[t.id] : (t.size || "s");
    if (size === "xl" && phone()) size = "l"; // a phone grid is only 2 tiles wide
    let content;
    try { content = t.build(size); } catch (e) { console.error(`tile ${t.id}`, e); continue; }
    if (!content) continue;
    const w = windows.get(t.opens);
    const name = t.label || w?.title || t.id;
    const isPinned = pinned === t.id;
    const tile = h("article", { class: `tile-w size-${size}${t.kind ? ` kind-${t.kind}` : ""}${t.spacer ? " spacer" : ""}${isPinned ? " pinned" : ""}`, "data-tile": t.id, "data-opens": t.opens, "data-size": size },
      t.spacer ? null : h("button", { class: "tile-open", type: "button", "aria-haspopup": "dialog",
        "aria-label": `Open ${w?.title || t.opens}${t.label ? `: ${t.label}` : ""}`,
        onclick: (e) => openWindow(t.opens, e.currentTarget.closest(".tile-w")) }),
      t.spacer ? null : h("span", { class: `tile-ear ear-${categoryOf(t.id)}`, "aria-hidden": "true" }),
      content,
      h("button", { class: "tile-top", type: "button", title: "Move to top", "aria-label": `Move the ${t.label || w?.title} widget to the top`,
        onclick: (e) => {
          const el = e.currentTarget.closest(".tile-w");
          if (el === el.parentElement.firstElementChild) { announce(`${t.label || w?.title} is already at the top.`); return; }
          moveBy(el, -999, (ids) => {
            commitOrder(ids);
            announce(`${t.label || w?.title} moved to the top.`);
            window.scrollTo({ top: 0, behavior: reducedMotion() ? "auto" : "smooth" });
          });
        } }, icon("toTop", 16)),
      t.spacer ? null : h("button", { class: "tile-pin", type: "button", "aria-pressed": String(isPinned),
        title: isPinned ? "Unpin" : "Pin to the top-right corner",
        "aria-label": isPinned ? `Unpin the ${name} widget` : `Pin the ${name} widget to the top-right corner of ${tabById(tab).name}`,
        onclick: () => togglePin(t.id, name) }, icon("pin", 16)),
      h("button", { class: "tile-grip", type: "button", "aria-label": `Move the ${t.label || w?.title} widget. Use arrow keys, or drag.`,
        onkeydown: (e) => {
          const step = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[e.key];
          if (!step) return;
          e.preventDefault();
          moveBy(e.currentTarget.closest(".tile-w"), step, (ids, pos) => {
            commitOrder(ids);
            announce(`${t.label || w?.title} moved to position ${pos} of ${ids.length}`);
          });
        } }, icon("grip", 16)),
      h("div", { class: "size-picker", role: "group", "aria-label": `Size of the ${name} widget` },
        SIZES.map(([k, label]) => h("button", { type: "button", class: `size-opt opt-${k}`, "aria-pressed": String(k === size), title: label,
          "aria-label": `${label}`, onclick: () => setSize(t.id, k, name) }, k.toUpperCase()))),
      h("button", { class: "tile-remove", type: "button", "aria-label": t.spacer ? "Delete this blank space" : `Remove the ${name} widget from ${tabById(tab).name}`,
        onclick: () => (t.spacer ? removeSpacer(t.id) : removeTile(t.id, name)) }, icon("minus", 14)));
    for (const [k, v] of Object.entries(t.vars || {})) tile.style.setProperty(k, v); // e.g. an employer's --brand color
    tiles.push(tile);
  }
  const editing = document.body.classList.contains("editing");
  if (!tiles.length) {
    tiles.push(h("div", { class: "tab-empty" }, h("b", {}, `Nothing in ${tabById(tab).name} yet.`), " ",
      editing ? "Add widgets from the list below." : h("span", {}, "Tap ", h("b", {}, "Edit"), " to add any widget to this tab.")));
  }
  // A pinned widget goes first, and CSS holds it in the top-right corner (.pinned); the rest flow around it.
  const pi = tiles.findIndex((el) => el.classList?.contains("pinned"));
  if (pi > 0) tiles.unshift(...tiles.splice(pi, 1));
  home.replaceChildren(...tiles);
  // "Add a widget": every widget not on this tab, grouped by subject.
  const shown = new Set(defs.filter((t) => !hidden.has(t.id)).map((t) => t.id));
  const off = currentDefs.filter((t) => !t.spacer && !shown.has(t.id));
  tray.hidden = !off.length || !editing;
  syncEditBar();
  const nameOf = (t) => t.label || windows.get(t.opens)?.title || t.id;
  const groups = TABS.map((g) => ({ g, list: off.filter((t) => categoryOf(t.id) === g.id) })).filter((x) => x.list.length);
  tray.replaceChildren(
    h("div", { class: "tray-label" }, `Add a widget to ${tabById(tab).name}`),
    ...groups.map(({ g, list }) => h("div", { class: "tray-group" },
      h("span", { class: `tray-group-name ear-${g.id}` }, g.id === "home" ? "General" : g.name),
      ...list.sort((a, b) => nameOf(a).localeCompare(nameOf(b))).map((t) => h("button", { class: "tray-chip", type: "button",
        onclick: () => restore(t.id, nameOf(t)) }, icon("plus", 14), nameOf(t))))));
}

function togglePin(id, name) {
  if (!order) order = ordered(currentDefs).map((d) => d.id); // Home's automatic layout becomes a saved one
  pinned = pinned === id ? null : id;
  saveHidden();
  renderHome();
  announce(pinned ? `${name} is pinned to the top-right corner of ${tabById(tab).name}.` : `${name} is unpinned.`);
}

// ---------- folder tabs ----------
function renderTabs() {
  const nav = document.getElementById("folder-tabs");
  if (!nav) return;
  nav.replaceChildren(...TABS.map((t) => h("button", { class: `folder-tab ear-${t.id}`, type: "button", role: "tab", id: `tab-${t.id}`,
    "aria-selected": String(t.id === tab), "aria-controls": "folder", tabindex: t.id === tab ? "0" : "-1",
    onclick: () => setTab(t.id),
    onkeydown: (e) => {
      const step = { ArrowLeft: -1, ArrowRight: 1 }[e.key];
      if (!step) return;
      e.preventDefault();
      const i = (TABS.findIndex((x) => x.id === tab) + step + TABS.length) % TABS.length;
      setTab(TABS[i].id);
      document.getElementById(`tab-${TABS[i].id}`)?.focus();
    } },
  t.short ? [h("span", { class: "tab-long" }, t.name), h("span", { class: "tab-short", "aria-hidden": "true" }, t.short)] : t.name)));
  const folder = document.getElementById("folder");
  folder.className = `folder folder-${tab}`;
  folder.setAttribute("aria-labelledby", `tab-${tab}`);
}

/** Open a folder tab. The URL carries it (?tab=city) so a tab can be shared or bookmarked. */
export function setTab(id, { push = true } = {}) {
  if (!TABS.some((t) => t.id === id)) id = "home";
  if (id === tab && document.getElementById("folder")?.classList.contains(`folder-${id}`)) return;
  tab = id;
  loadHidden();
  renderTabs();
  renderHome();
  if (push) {
    const u = new URL(location.href);
    if (id === "home") u.searchParams.delete("tab"); else u.searchParams.set("tab", id);
    history.pushState({ tab: id }, "", u.pathname + u.search + u.hash);
  }
  announce("");
}

/** Blank space: an invisible, resizable tile for shaping the layout (Edit mode only). */
function addSpacer() {
  const id = `space-${Date.now().toString(36)}`;
  spacers.push(id);
  if (order) order.push(id);
  saveHidden();
  renderHome();
  const el = document.querySelector(`[data-tile="${id}"]`);
  el?.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "center" });
  el?.querySelector(".tile-grip")?.focus({ preventScroll: true });
  announce("Blank space added at the end. Drag it where you want a gap.");
}
function removeSpacer(id) {
  spacers = spacers.filter((s) => s !== id);
  delete sizes[id];
  if (order) order = order.filter((x) => x !== id);
  saveHidden();
  renderHome();
  announce("Blank space deleted.");
}

/** Change a tile's size; other tiles glide to their new places. */
function setSize(id, size, name) {
  const home = document.getElementById("home");
  const first = new Map([...home.children].map((el) => [el.dataset.tile, el.getBoundingClientRect()]));
  sizes[id] = size;
  saveHidden();
  renderHome();
  const label = SIZES.find(([k]) => k === size)[1];
  announce(`${name} is now ${label.toLowerCase()}.`);
  const tile = home.querySelector(`[data-tile="${id}"]`);
  tile?.querySelector(`.opt-${size}`)?.focus({ preventScroll: true });
  if (reducedMotion()) return;
  for (const el of home.children) {
    const a = first.get(el.dataset.tile), b = el.getBoundingClientRect();
    if (!a) continue;
    if (el === tile) {
      el.animate([{ transform: `translate(${a.left - b.left}px, ${a.top - b.top}px) scale(${a.width / b.width}, ${a.height / b.height})`, transformOrigin: "top left", opacity: .6 },
        { transform: "none", transformOrigin: "top left", opacity: 1 }], { duration: 280, easing: "cubic-bezier(.2,.8,.2,1)" });
    } else if (a.left !== b.left || a.top !== b.top) {
      el.animate([{ transform: `translate(${a.left - b.left}px, ${a.top - b.top}px)` }, { transform: "none" }], { duration: 280, easing: "cubic-bezier(.2,.8,.2,1)" });
    }
  }
}

// ---------- windows ----------
let sourceRegistry = {};
/** The official source registry (data/manual/sources.csv); each entry lists the widgets it feeds. */
export function setSources(sources) { sourceRegistry = sources || {}; }

/** Every window ends with a "Sources" line built from the registry, so nothing goes uncited. */
function sourcesFooter(id) {
  const list = Object.values(sourceRegistry).filter((s) => (s.widgets || []).includes(id));
  if (!list.length) return null;
  return h("p", { class: "sources-foot" }, h("b", {}, "Sources: "),
    ...list.flatMap((s, i) => [h("a", { href: s.url, target: "_blank", rel: "noopener" }, s.title),
      ` (${s.publisher}${s.format ? `, ${s.format}` : ""})`, i < list.length - 1 ? " · " : ""]),
    " · ", h("a", { href: "#about" }, "All sources"));
}

function renderWindow(id) {
  const w = windows.get(id);
  try { w.render(); } catch (e) {
    console.error(`Failed to render ${id}:`, e);
    document.getElementById(id)?.prepend(h("p", { class: "error" }, "Part of this widget couldn't be displayed."));
  }
  const section = document.getElementById(id);
  section?.querySelector(":scope > .sources-foot")?.remove();
  const foot = sourcesFooter(id);
  if (foot) section?.append(foot);
  rendered.add(id);
}

function zoom(fromEl, reverse) {
  const panel = dialog.querySelector(".win-panel");
  if (!fromEl || reducedMotion() || !panel.animate) return Promise.resolve();
  const a = fromEl.getBoundingClientRect(), b = panel.getBoundingClientRect();
  if (!a.width || !b.width) return Promise.resolve();
  const from = `translate(${a.left - b.left}px, ${a.top - b.top}px) scale(${a.width / b.width}, ${a.height / b.height})`;
  const frames = [{ transform: from, opacity: 0.4, borderRadius: "28px" }, { transform: "none", opacity: 1 }];
  const anim = panel.animate(reverse ? frames.reverse() : frames,
    { duration: reverse ? 220 : 340, easing: "cubic-bezier(.2,.8,.2,1)", fill: "both" });
  return anim.finished.then(() => anim.cancel()).catch(() => {});
}

export function openWindow(id, fromTile, { push = true } = {}) {
  const w = windows.get(id);
  const section = document.getElementById(id);
  if (!w || !section) return;
  if (openId && openId !== id) closeWindow({ animate: false, pop: false });
  openId = id;
  openerTile = fromTile || null;
  winTitle.textContent = w.title;
  winSub.textContent = w.sub || "";
  const ic = chip(w.icon, w.color);
  if (w.ink) ic.style.color = w.ink; // icon color on a light chip (e.g. a yellow brand color)
  winIcon.replaceChildren(ic);
  winBody.replaceChildren(section);
  winBody.scrollTop = 0;
  if (!dialog.open) dialog.showModal();
  dialog.append(document.getElementById("tooltip")); // the modal's top layer would cover a page-level tooltip
  document.documentElement.classList.add("win-open");
  if (!rendered.has(id)) renderWindow(id);
  zoom(openerTile, false);
  if (push) {
    history.pushState({ win: id }, "", `#${id}`);
    pushed = true;
  }
}

export function closeWindow({ animate = true, pop = true } = {}) {
  if (!openId) return;
  const id = openId;
  const finish = () => {
    if (openId !== id) return; // reopened meanwhile
    dialog.close();
    document.body.append(document.getElementById("tooltip"));
    document.getElementById("store").append(document.getElementById(id));
    document.documentElement.classList.remove("win-open");
    openId = null;
    openerTile?.querySelector(".tile-open")?.focus({ preventScroll: true });
  };
  if (pop) {
    if (pushed) { pushed = false; history.back(); } else history.replaceState(null, "", location.pathname + location.search);
  }
  animate ? zoom(openerTile, true).then(finish) : finish();
}

/** New data for one window: redraw it if open, otherwise on next open. */
export function refreshWindow(id) {
  rendered.delete(id);
  if (openId === id) renderWindow(id);
}

/** Theme or width changed: redraw the home screen and the open window; others redraw on next open. */
export function invalidate() {
  rendered.clear();
  renderHome();
  if (openId) renderWindow(openId);
}

// ---------- edit bar ----------
const announce = (msg) => { const el = document.getElementById("edit-status"); if (el) el.textContent = msg; };
let canSaveDefault = false;
function syncEditBar() {
  const bar = document.getElementById("edit-bar");
  if (!bar) return;
  bar.hidden = !document.body.classList.contains("editing");
  document.getElementById("reset-layout").disabled = isDefaultLayout();
  document.getElementById("reset-layout").textContent = `Reset ${tabById(tab).name}`;
  document.getElementById("save-default").hidden = !canSaveDefault;
  document.getElementById("edit-local-note").hidden = canSaveDefault;
}
async function detectSaving() {
  if (!location.protocol.startsWith("http")) return;
  try {
    const r = await fetch("/api/layout", { cache: "no-store" });
    canSaveDefault = r.ok && (await r.json()).ok === true;
  } catch { canSaveDefault = false; }
  syncEditBar();
}
async function saveDefault() {
  // Every tab: this one as it is now; the others as this browser has them (or their current default).
  const norm = (l) => ({ order: l?.order || [], hidden: l?.hidden || [], sizes: l?.sizes || {}, spacers: l?.spacers || [], ...(l?.pinned ? { pinned: l.pinned } : {}) });
  const tabs = Object.fromEntries(TABS.map((t) => [t.id, t.id === tab
    ? norm({ order: ordered(currentDefs).map((d) => d.id), hidden: [...hidden], sizes, spacers, pinned })
    : norm(effective(t.id))]));
  announce("Saving…");
  try {
    const r = await fetch("/api/layout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tabs }) });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.status);
    siteDefaults = tabs;
    try { for (const t of TABS) localStorage.removeItem(keyFor(t.id)); } catch { /* ignore */ }
    announce("Saved. These tabs are now the default for everyone (data/manual/home_layout.json).");
  } catch (e) {
    announce(`Couldn't save: ${e.message}`);
  }
  syncEditBar();
}

export function initOS({ defaultLayout = null } = {}) {
  // home_layout.json: { tabs: { home: {...}, city: {...}, ... } }, or (before tabs) just Home's layout.
  siteDefaults = defaultLayout?.tabs || (defaultLayout ? { home: defaultLayout } : {});
  const wanted = new URLSearchParams(location.search).get("tab");
  tab = TABS.some((t) => t.id === wanted) ? wanted : "home";
  loadHidden();
  renderTabs();
  dialog = document.getElementById("window");
  winBody = dialog.querySelector(".win-body");
  winTitle = dialog.querySelector(".win-title");
  winSub = dialog.querySelector(".win-sub");
  winIcon = dialog.querySelector(".win-icon");
  dialog.querySelector(".win-close").addEventListener("click", () => closeWindow());
  dialog.addEventListener("cancel", (e) => { e.preventDefault(); closeWindow(); });
  // Click on the backdrop (outside the panel) closes.
  dialog.addEventListener("click", (e) => { if (e.target === dialog) closeWindow(); });
  window.addEventListener("popstate", () => {
    const t = new URLSearchParams(location.search).get("tab") || "home";
    if (t !== tab) setTab(t, { push: false });
    const id = location.hash.slice(1);
    if (windows.has(id)) { pushed = false; openWindow(id, null, { push: false }); }
    else if (openId) { pushed = false; closeWindow({ pop: false }); }
  });
  const edit = document.getElementById("edit-toggle");
  edit.addEventListener("click", () => {
    const on = document.body.classList.toggle("editing");
    edit.setAttribute("aria-pressed", String(on));
    edit.querySelector(".label").textContent = on ? "Done" : "Edit";
    if (on) announce("");
    renderHome();
  });
  document.getElementById("reset-layout").addEventListener("click", () => {
    try { localStorage.removeItem(keyFor(tab)); if (tab === "home") localStorage.removeItem(OLD_HIDDEN_KEY); } catch { /* ignore */ }
    applyLayout(siteDefaults[tab] || builtin(tab));
    renderHome();
    announce(`${tabById(tab).name} reset to the default.`);
  });
  document.getElementById("save-default").addEventListener("click", saveDefault);
  document.getElementById("add-spacer").addEventListener("click", addSpacer);
  enableDrag(document.getElementById("home"), {
    active: () => document.body.classList.contains("editing"),
    onDrop: (ids) => { commitOrder(ids); announce("Layout saved on this device."); },
  });
  detectSaving();
}

/** Open the window named in the URL (#budget etc.), e.g. from a shared link. */
export function openFromHash() {
  const id = location.hash.slice(1);
  if (windows.has(id)) {
    history.replaceState(null, "", location.pathname + location.search);
    openWindow(id, null);
  }
}
