// OS-style shell: home-screen tiles, a dock, and windows. Each window hosts one widget <section>,
// rendered on first open and again after theme/width changes. Edit mode hides, resizes and reorders
// tiles; the layout is saved per browser, or for everyone via "Save as default" (./serve.sh only).
import { h } from "./ui.js";
import { icon } from "./icons.js";
import { enableDrag, moveBy } from "./drag.js";

const KEY = "kdash-home-layout";          // { order: [tile ids], hidden: [tile ids] }
const OLD_HIDDEN_KEY = "kdash-hidden-widgets";
let hidden = new Set();
let order = null;                         // full tile order, or null = default
let sizes = {};                           // tile id -> "s" | "m" | "l" | "xl"
let spacers = [];                         // ids of blank-space tiles ("space-…")
export const SIZES = [["s", "Small"], ["m", "Medium"], ["l", "Large"], ["xl", "Extra large"]];
let siteDefault = null;                   // embedded data/manual/home_layout.json
const windows = new Map();   // id -> { title, sub, icon, color, render }
const rendered = new Set();  // windows rendered at the current theme/width
let openId = null, openerTile = null, pushed = false;
let tileDefs = [];           // [{ id, opens, size, build }]
let dialog, winBody, winTitle, winSub, winIcon;

const phone = () => window.matchMedia?.("(max-width: 720px)").matches;
const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
function readLocal() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "null");
    if (v) return v;
    const old = JSON.parse(localStorage.getItem(OLD_HIDDEN_KEY) || "null"); // earlier versions
    return old ? { order: null, hidden: old } : null;
  } catch { return null; }
}
function applyLayout(l) {
  order = l?.order || null; hidden = new Set(l?.hidden || []); sizes = { ...(l?.sizes || {}) };
  spacers = (l?.spacers || []).filter((id) => /^space-[a-z0-9]{1,20}$/.test(id));
}
function loadHidden() { applyLayout(readLocal() || siteDefault); }
function saveHidden() {
  try {
    localStorage.setItem(KEY, JSON.stringify({ order, hidden: [...hidden], sizes, spacers }));
    localStorage.removeItem(OLD_HIDDEN_KEY);
  } catch { /* private mode: lasts for this visit */ }
}
const isDefaultLayout = () => !readLocal();

/** Tile defs in the saved order; widgets added since the save go at the bottom. */
function ordered(defs) {
  if (!order) return defs;
  const idx = new Map(order.map((id, i) => [id, i]));
  return [...defs.filter((d) => idx.has(d.id)).sort((a, b) => idx.get(a.id) - idx.get(b.id)),
    ...defs.filter((d) => !idx.has(d.id))];
}

/** Restore a hidden widget at the bottom of the home screen. */
function restore(id, name) {
  hidden.delete(id);
  order = [...ordered(currentDefs).map((d) => d.id).filter((x) => x !== id), id];
  saveHidden();
  renderHome();
  const el = document.querySelector(`[data-tile="${id}"]`);
  el?.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "center" });
  announce(`${name} added at the bottom.`);
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

export function chip(name, color) {
  const el = h("span", { class: "chip-icon" }, icon(name, 18));
  el.style.setProperty("--chip", color); // custom properties need setProperty
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
  for (const t of defs) {
    if (hidden.has(t.id)) continue;
    let size = SIZES.some(([k]) => k === sizes[t.id]) ? sizes[t.id] : (t.size || "s");
    if (size === "xl" && phone()) size = "l"; // a phone grid is only 2 tiles wide
    let content;
    try { content = t.build(size); } catch (e) { console.error(`tile ${t.id}`, e); continue; }
    if (!content) continue;
    const w = windows.get(t.opens);
    const name = t.label || w?.title || t.id;
    const tile = h("article", { class: `tile-w size-${size}${t.kind ? ` kind-${t.kind}` : ""}${t.spacer ? " spacer" : ""}`, "data-tile": t.id, "data-opens": t.opens, "data-size": size },
      t.spacer ? null : h("button", { class: "tile-open", type: "button", "aria-haspopup": "dialog",
        "aria-label": `Open ${w?.title || t.opens}${t.label ? `: ${t.label}` : ""}`,
        onclick: (e) => openWindow(t.opens, e.currentTarget.closest(".tile-w")) }),
      content,
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
      h("button", { class: "tile-remove", type: "button", "aria-label": t.spacer ? "Delete this blank space" : `Hide the ${t.label || w?.title} widget`,
        onclick: () => (t.spacer ? removeSpacer(t.id) : (hidden.add(t.id), saveHidden(), renderHome())) }, icon("minus", 14)));
    tiles.push(tile);
  }
  home.replaceChildren(...tiles);
  const off = defs.filter((t) => hidden.has(t.id) && !t.spacer);
  tray.hidden = !off.length || !document.body.classList.contains("editing");
  syncEditBar();
  tray.replaceChildren(
    h("span", { class: "tray-label" }, "Hidden widgets"),
    ...off.map((t) => h("button", { class: "tray-chip", type: "button",
      onclick: () => restore(t.id, t.label || windows.get(t.opens)?.title || t.id) },
      icon("plus", 14), t.label || windows.get(t.opens)?.title || t.id)));
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

// ---------- dock ----------
function renderDock() {
  const dock = document.getElementById("dock");
  dock.replaceChildren(...[...windows].map(([id, w]) =>
    h("button", { class: "dock-btn", type: "button", "data-win": id, "aria-label": w.title, title: w.title,
      onclick: () => (openId === id ? closeWindow() : openWindow(id, document.querySelector(`.tile-w[data-opens="${id}"]`))) },
      chip(w.icon, w.color), h("span", { class: "dock-label" }, w.short || w.title))));
}
function syncDock() {
  document.querySelectorAll(".dock-btn").forEach((b) => b.classList.toggle("active", b.dataset.win === openId));
}

// ---------- windows ----------
function renderWindow(id) {
  const w = windows.get(id);
  try { w.render(); } catch (e) {
    console.error(`Failed to render ${id}:`, e);
    document.getElementById(id)?.prepend(h("p", { class: "error" }, "Part of this widget couldn't be displayed."));
  }
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
  winIcon.replaceChildren(chip(w.icon, w.color));
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
  syncDock();
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
    syncDock();
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
  const layout = { order: ordered(currentDefs).map((d) => d.id), hidden: [...hidden], sizes, spacers };
  announce("Saving…");
  try {
    const r = await fetch("/api/layout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(layout) });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.status);
    siteDefault = layout;
    try { localStorage.removeItem(KEY); } catch { /* ignore */ }
    announce("Saved. This is now the home page for everyone (data/manual/home_layout.json).");
  } catch (e) {
    announce(`Couldn't save: ${e.message}`);
  }
  syncEditBar();
}

export function initOS({ defaultLayout = null } = {}) {
  siteDefault = defaultLayout;
  loadHidden();
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
    try { localStorage.removeItem(KEY); localStorage.removeItem(OLD_HIDDEN_KEY); } catch { /* ignore */ }
    applyLayout(siteDefault);
    renderHome();
    announce("Layout reset to the default home page.");
  });
  document.getElementById("save-default").addEventListener("click", saveDefault);
  document.getElementById("add-spacer").addEventListener("click", addSpacer);
  enableDrag(document.getElementById("home"), {
    active: () => document.body.classList.contains("editing"),
    onDrop: (ids) => { commitOrder(ids); announce("Layout saved on this device."); },
  });
  detectSaving();
  renderDock();
}

/** Open the window named in the URL (#budget etc.), e.g. from a shared link. */
export function openFromHash() {
  const id = location.hash.slice(1);
  if (windows.has(id)) {
    history.replaceState(null, "", location.pathname + location.search);
    openWindow(id, null);
  }
}
