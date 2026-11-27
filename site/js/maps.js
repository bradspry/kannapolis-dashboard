// MapLibre helpers: a themed basemap, fit-to-data, and cleanup on re-render.
import * as maplibregl from "maplibre-gl";
import { isDark } from "./theme.js";

const live = new Map(); // container id -> map

/** Resolves with a loaded map, or never resolves (with a fallback message shown) if WebGL is unavailable. */
export function makeMap(container, { bounds, interactive = true, attribution = true } = {}) {
  const id = container.id;
  if (live.has(id)) { live.get(id).remove(); live.delete(id); }
  let map;
  try {
    map = createMap(container, bounds, interactive, attribution);
  } catch (e) {
    console.warn("Map unavailable:", e);
    container.classList.add("map-fallback");
    container.textContent = "This map needs WebGL, which isn't available in this browser. The table below has the same information.";
    return new Promise(() => {});
  }
  live.set(id, map);
  // Maps still drawing, for the share-card pictures (etl/share_shots.mjs waits for 0).
  window.__mapsPending = (window.__mapsPending || 0) + 1;
  let done = false;
  const settle = () => { if (!done) { done = true; window.__mapsPending--; } };
  map.once("idle", settle);
  map.once("remove", settle);
  return new Promise((resolve) => map.on("load", () => resolve(map)));
}

function createMap(container, bounds, interactive, attribution) {
  const map = new maplibregl.Map({
    container,
    style: `https://tiles.openfreemap.org/styles/${isDark() ? "dark" : "positron"}`,
    bounds,
    fitBoundsOptions: { padding: 24 },
    attributionControl: attribution ? { compact: true } : false, // off only where the caller shows the credit itself
    cooperativeGestures: true, // page scroll isn't hijacked on phones
    interactive,
  });
  if (interactive) map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
  return map;
}

export function bboxOf(geojson) {
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  const visit = (c) => {
    if (typeof c[0] === "number") {
      x0 = Math.min(x0, c[0]); y0 = Math.min(y0, c[1]); x1 = Math.max(x1, c[0]); y1 = Math.max(y1, c[1]);
    } else c.forEach(visit);
  };
  geojson.features.forEach((f) => visit(f.geometry.coordinates));
  return [[x0, y0], [x1, y1]];
}

/** First symbol (label) layer, so data fills sit under street & place names. */
export function firstLabelLayer(map) {
  return map.getStyle().layers.find((l) => l.type === "symbol")?.id;
}

export { maplibregl };
