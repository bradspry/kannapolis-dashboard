// Theme handling: read CSS tokens (Plot & MapLibre need literal colors) and re-render on change.
const KEY = "kdash-theme";
const listeners = new Set();

function stored() {
  try { return localStorage.getItem(KEY); } catch { return null; }
}
function store(v) {
  try { v ? localStorage.setItem(KEY, v) : localStorage.removeItem(KEY); } catch { /* private mode */ }
}

export function isDark() {
  const forced = document.documentElement.dataset.theme;
  if (forced) return forced === "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function tokens() {
  const cs = getComputedStyle(document.documentElement);
  const v = (name) => cs.getPropertyValue(name).trim();
  return {
    dark: isDark(),
    surface: v("--surface-1"),
    page: v("--page"),
    text: v("--text-primary"),
    text2: v("--text-secondary"),
    muted: v("--text-muted"),
    axis: v("--axis"),
    grid: v("--grid"),
    baseline: v("--baseline"),
    accent: v("--accent"),
    mutedFill: v("--muted-fill"),
    series: [1, 2, 3, 4, 5, 6, 7, 8].map((i) => v(`--series-${i}`)),
    seq: [1, 2, 3, 4, 5, 6, 7].map((i) => v(`--seq-${i}`)),
  };
}

export function onThemeChange(fn) { listeners.add(fn); }
function emit() { listeners.forEach((fn) => fn()); }

// Optional "Moss & Rust" fall palette for backgrounds, lines, outlines, icons and accent (not charts).
const PALETTE_KEY = "kdash-palette";
function initPalette() {
  const btn = document.getElementById("palette-toggle");
  let saved = null;
  try { saved = localStorage.getItem(PALETTE_KEY); } catch { /* private mode */ }
  const set = (on) => {
    if (on) document.documentElement.dataset.palette = "fall"; else delete document.documentElement.dataset.palette;
    btn?.setAttribute("aria-pressed", String(on));
  };
  set(saved === "fall");
  btn?.addEventListener("click", () => {
    const on = document.documentElement.dataset.palette !== "fall";
    set(on);
    try { on ? localStorage.setItem(PALETTE_KEY, "fall") : localStorage.removeItem(PALETTE_KEY); } catch { /* ignore */ }
    emit(); // charts read --grid/--baseline, so redraw them
  });
}

export function initTheme() {
  initPalette();
  // Dark is the default; the toggle's choice (light or dark) is remembered per browser.
  document.documentElement.dataset.theme = stored() || "dark";
  const btn = document.getElementById("theme-toggle");
  const label = btn.querySelector(".theme-label");
  const sync = () => { label.textContent = isDark() ? "Light" : "Dark"; };
  sync();
  btn.addEventListener("click", () => {
    const next = isDark() ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    store(next);
    sync();
    emit();
  });
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (!document.documentElement.dataset.theme) { sync(); emit(); }
  });
}
