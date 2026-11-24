// Weather window: alerts, current conditions, next 24 hours, and the 7-day forecast (NWS).
import * as Plot from "@observablehq/plot";
import { h, plotBase, dataTable } from "../ui.js";
import { tokens } from "../theme.js";
import { wxIcon } from "../weather.js";
import { makeMap, firstLabelLayer, maplibregl } from "../maps.js";

// ---------- Animated radar (NOAA national mosaic over a basemap) ----------
const RADAR_WMS = "https://opengeo.ncep.noaa.gov/geoserver/conus/conus_bref_qcd/ows?service=WMS&version=1.3.0&request=GetMap"
  + "&layers=conus_bref_qcd&styles=&crs=EPSG:3857&bbox={bbox-epsg-3857}&width=256&height=256&format=image/png&transparent=true";
const RADAR_LEGEND = "https://opengeo.ncep.noaa.gov/geoserver/conus/conus_bref_qcd/ows?service=WMS&request=GetLegendGraphic&format=image/png&layer=conus_bref_qcd";
const RADAR_FRAMES = 7, RADAR_STEP_MIN = 10, FRAME_MS = 650, HOLD_MS = 1800;
const HOME = [-80.6217, 35.4874]; // Kannapolis city center
let radarTimer = null;

/** Frame times: the last hour in 10-minute steps, oldest first. NOAA serves the scan nearest each time;
 *  the last frame asks for the latest scan (no time). Times are rounded so map tiles cache well. */
function radarFrames(now = Date.now()) {
  const step = RADAR_STEP_MIN * 60000, end = Math.floor(now / step) * step;
  return Array.from({ length: RADAR_FRAMES }, (_, i) => {
    const t = new Date(end - (RADAR_FRAMES - 1 - i) * step);
    return { t, latest: i === RADAR_FRAMES - 1 };
  });
}

function radarCard(boundaries) {
  if (radarTimer) { clearInterval(radarTimer); radarTimer = null; }
  const frames = radarFrames();
  const el = h("div", { class: "map wx-radar-map", id: "wx-radar-map", role: "img", "aria-label": "Animated weather radar around Kannapolis for the past hour" });
  const stamp = h("span", { class: "wx-radar-time" });
  const slider = h("input", { type: "range", min: 0, max: frames.length - 1, value: frames.length - 1, "aria-label": "Radar time" });
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  let playing = !reduce, i = frames.length - 1, map = null;
  const btn = h("button", { class: "chip wx-radar-play", type: "button" });
  const label = (f) => (f.latest ? `Latest · ${f.t.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}` : f.t.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }));
  const show = (n) => {
    i = n; slider.value = String(n); stamp.textContent = label(frames[n]);
    if (map) frames.forEach((_, k) => map.setPaintProperty(`radar-${k}`, "raster-opacity", k === n ? 0.78 : 0));
  };
  let last = 0;
  const tick = () => {
    if (!playing || document.hidden || !el.isConnected || !el.offsetParent) return; // paused, tab hidden, or window closed
    const now = performance.now();
    if (now - last < (i === frames.length - 1 ? HOLD_MS : FRAME_MS)) return;
    last = now; show((i + 1) % frames.length);
  };
  const setPlaying = (p) => { playing = p; btn.textContent = p ? "❚❚ Pause" : "▶ Play"; btn.setAttribute("aria-pressed", String(p)); };
  btn.addEventListener("click", () => setPlaying(!playing));
  slider.addEventListener("input", () => { setPlaying(false); show(+slider.value); });
  setPlaying(playing);
  show(i);

  // Start the map once the card is on the page (a detached, 0×0 container never draws). The window
  // opens with a zoom animation, so re-measure whenever the box changes size and re-center on Kannapolis.
  const bounds = [[HOME[0] - 1.25, HOME[1] - 0.75], [HOME[0] + 1.25, HOME[1] + 0.75]];
  requestAnimationFrame(() => makeMap(el, { bounds }).then((m) => {
    map = m;
    let userMoved = false;
    m.on("dragstart", () => { userMoved = true; }); m.on("zoomstart", (e) => { if (e.originalEvent) userMoved = true; });
    const fit = () => { m.resize(); if (!userMoved) m.fitBounds(bounds, { padding: 16, animate: false }); };
    new ResizeObserver(fit).observe(el);
    fit();
    const before = firstLabelLayer(m);
    frames.forEach((f, k) => {
      m.addSource(`radar-${k}`, { type: "raster", tileSize: 256, attribution: "Radar: NOAA/NWS",
        tiles: [f.latest ? RADAR_WMS : `${RADAR_WMS}&time=${f.t.toISOString().slice(0, 19)}Z`] });
      m.addLayer({ id: `radar-${k}`, type: "raster", source: `radar-${k}`, paint: { "raster-opacity": 0, "raster-fade-duration": 0 } }, before);
    });
    const city = boundaries?.features?.find((f) => f.properties.year === "current");
    if (city) {
      m.addSource("city", { type: "geojson", data: city });
      m.addLayer({ id: "city", type: "line", source: "city", paint: { "line-color": tokens().accent, "line-width": 1.6, "line-opacity": 0.9 } }, before);
    }
    new maplibregl.Marker({ color: tokens().accent, scale: 0.7 }).setLngLat(HOME).addTo(m);
    show(i);
    radarTimer = setInterval(tick, 100);
  }));

  return h("div", { class: "card wx-radar-card" },
    h("h3", {}, "Radar"), h("p", { class: "sub" }, "The past hour of precipitation around Kannapolis, from NOAA's national radar mosaic. Kannapolis city limits outlined."),
    el,
    h("div", { class: "wx-radar-controls" }, btn, slider, stamp),
    h("div", { class: "wx-radar-legend" },
      h("img", { src: RADAR_LEGEND, alt: "Radar color scale in dBZ, from about 10 (light rain, blue-green) through 40 (moderate, yellow) to 60 and above (very heavy rain or hail, red and purple)", loading: "lazy" }),
      h("span", { class: "tile-meta" }, "Color = rain intensity (dBZ): green is light, yellow moderate, red and purple heavy. Snow and drizzle may show weakly.")));
}

const hourLabel = (d) => d.toLocaleTimeString("en-US", { hour: "numeric" });
const timeLabel = (d) => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
// Weekday from the date, not the name: the forecast says "Thanksgiving Day", not "Thursday".
const dayShort = (d) => (/^(tonight|overnight)$/i.test(d.name) ? "Tonight" : /^(today|this afternoon)$/i.test(d.name) ? "Today"
  : (d.day || d.night).start.toLocaleDateString("en-US", { weekday: "short" }));
const severityClass = (s) => ({ Extreme: "critical", Severe: "critical", Moderate: "warning" }[s] || "info");

export function alertBanner(alerts, { compact = false } = {}) {
  if (!alerts?.length) return null;
  const a = alerts[0];
  return h("div", { class: `wx-alert ${severityClass(a.severity)}${compact ? " compact" : ""}`, role: "alert" },
    h("span", { class: "wx-alert-icon", "aria-hidden": "true" }, "⚠"),
    h("span", {}, h("b", {}, a.event), compact ? null : a.ends ? ` until ${a.ends.toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" })}` : "",
      alerts.length > 1 ? ` (+${alerts.length - 1} more)` : ""));
}

export function renderWeather(w, boundaries) {
  const root = document.getElementById("weather-body");
  if (!w) { root.replaceChildren(h("p", { class: "loading" }, "Weather is unavailable.")); return; }
  const t = tokens();
  const c = w.current, today = w.days[0];

  const alertsBlock = w.alerts.length
    ? h("div", { class: "wx-alerts" }, w.alerts.map((a) => h("details", { class: `wx-alert-card ${severityClass(a.severity)}`, open: w.alerts.length === 1 },
      h("summary", {}, h("span", { class: "wx-alert-icon", "aria-hidden": "true" }, "⚠"), h("b", {}, a.event),
        a.ends ? h("span", { class: "muted" }, ` until ${a.ends.toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" })}`) : null),
      h("p", { class: "wx-alert-head" }, a.headline),
      a.description ? h("p", { class: "wx-alert-text" }, a.description) : null,
      a.instruction ? h("p", { class: "wx-alert-text" }, h("b", {}, "What to do: "), a.instruction) : null)))
    : h("p", { class: "wx-ok" }, h("span", { "aria-hidden": "true" }, "✓ "), "No active weather alerts for Kannapolis.");

  const hero = c ? h("div", { class: "card wx-hero" },
    h("div", { class: "wx-hero-main" },
      h("span", { class: "wx-hero-icon", "aria-hidden": "true" }, wxIcon(c.text, c.isDay)),
      h("div", {},
        h("div", { class: "wx-hero-temp" }, `${c.temp}°`),
        h("div", { class: "wx-hero-text" }, c.text),
        today ? h("div", { class: "muted" }, [today.hi != null ? `H ${today.hi}°` : null, today.lo != null ? `L ${today.lo}°` : null].filter(Boolean).join("  ·  ")) : null)),
    h("dl", { class: "facts wx-facts" },
      c.feels != null && c.feels !== c.temp ? [h("dt", {}, "Feels like"), h("dd", {}, `${c.feels}°`)] : null,
      c.humidity != null ? [h("dt", {}, "Humidity"), h("dd", {}, `${c.humidity}%`)] : null,
      c.wind ? [h("dt", {}, "Wind"), h("dd", {}, c.wind)] : null,
      h("dt", {}, c.observed ? "Observed" : "Forecast for"),
      h("dd", {}, c.observed ? `${w.meta.station.name}, ${timeLabel(c.time)}` : timeLabel(c.time)))) : null;

  // Next 24 hours: scrollable strip + temperature line.
  const next = w.hourly.slice(0, 24);
  const strip = h("ul", { class: "wx-strip", role: "list", "aria-label": "Next 24 hours" }, next.map((x, i) => h("li", {},
    h("span", { class: "wx-strip-time" }, i === 0 ? "Now" : hourLabel(x.time)),
    h("span", { class: "wx-strip-icon", "aria-hidden": "true", title: x.text }, wxIcon(x.text, x.isDay)),
    h("b", {}, `${x.temp}°`),
    h("span", { class: "wx-strip-pop" }, x.pop >= 10 ? `${x.pop}%` : ""))));
  const chartBox = h("div", { class: "chart" });
  const hourly = h("div", { class: "card" },
    h("h3", {}, "Next 24 hours"), h("p", { class: "sub" }, "Temperature (°F); chance of rain shown under each hour when 10% or more."),
    strip, chartBox,
    dataTable([{ key: "time", label: "Hour", format: (d) => hourLabel(d) }, { key: "temp", label: "Temp (°F)", num: true },
      { key: "pop", label: "Chance of rain", num: true, format: (v) => `${v}%` }, { key: "text", label: "Forecast" }], next));

  const all = w.days.flatMap((d) => [d.hi, d.lo]).filter((v) => v != null);
  const lo = Math.min(...all), hi = Math.max(...all), span = hi - lo || 1;
  const week = h("div", { class: "card" },
    h("h3", {}, "7-day forecast"), h("p", { class: "sub" }, "Tap a day for the full forecast."),
    h("ul", { class: "wx-week", role: "list" }, w.days.map((d) => {
      const p = d.day || d.night;
      const l = d.lo ?? d.hi, u = d.hi ?? d.lo;
      return h("li", {}, h("details", {},
        h("summary", {},
          h("span", { class: "wx-day" }, dayShort(d)),
          h("span", { class: "wx-day-icon", "aria-hidden": "true", title: p.text }, wxIcon(p.text, !!d.day)),
          h("span", { class: "wx-pop" }, d.pop >= 10 ? `${d.pop}%` : ""),
          h("span", { class: "wx-lo" }, d.lo != null ? `${d.lo}°` : ""),
          h("span", { class: "wx-range", "aria-hidden": "true" },
            h("i", { style: { left: `${(100 * (l - lo)) / span}%`, width: `${Math.max(4, (100 * (u - l)) / span)}%` } })),
          h("span", { class: "wx-hi" }, d.hi != null ? `${d.hi}°` : ""),
          h("span", { class: "visually-hidden" }, `${d.name}: ${p.text}. ${d.hi != null ? `High ${d.hi}.` : ""} ${d.lo != null ? `Low ${d.lo}.` : ""} ${d.pop}% chance of rain.`)),
        h("div", { class: "wx-detail" },
          d.day ? h("p", {}, h("b", {}, `${d.day.name}: `), d.day.detail) : null,
          d.night ? h("p", {}, h("b", {}, `${d.night.name}: `), d.night.detail) : null)));
    })));

  root.replaceChildren(
    alertsBlock,
    h("div", { class: "wx-top" }, hero, hourly),
    radarCard(boundaries),
    week,
    h("p", { class: "note" }, "Forecast and alerts from the ",
      h("a", { href: w.meta.urls.page, target: "_blank", rel: "noopener" }, `National Weather Service (${w.meta.office})`),
      `; current conditions from ${w.meta.station.name} (${w.meta.station.id}). `,
      w.source === "live" ? `Live, updated ${timeLabel(w.fetched)}; refreshes every 15 minutes.` : `Saved forecast from ${w.meta.generated}; live data unavailable.`));

  // Draw the line after it's in the DOM so it can measure its width.
  const width = chartBox.clientWidth || 600;
  chartBox.append(Plot.plot({
    ...plotBase(width, { height: 170, marginLeft: 36, marginBottom: 28 }),
    x: { type: "time", label: null, ticks: width < 520 ? 4 : 6, tickFormat: (d) => hourLabel(d) },
    y: { label: null, grid: true, ticks: 4, tickFormat: (v) => `${v}°`, domain: [Math.min(...next.map((x) => x.temp)) - 3, Math.max(...next.map((x) => x.temp)) + 3] },
    marks: [
      Plot.gridY({ stroke: t.grid, strokeOpacity: 1, ticks: 4 }),
      Plot.lineY(next, { x: "time", y: "temp", stroke: t.series[1], strokeWidth: 2, curve: "monotone-x" }),
      Plot.dot(next, Plot.selectMinY({ x: "time", y: "temp", fill: t.series[1], r: 4, stroke: t.surface, strokeWidth: 2 })),
      Plot.dot(next, Plot.selectMaxY({ x: "time", y: "temp", fill: t.series[1], r: 4, stroke: t.surface, strokeWidth: 2 })),
      Plot.text(next, Plot.selectMaxY({ x: "time", y: "temp", text: (d) => `${d.temp}°`, dy: -12, fill: t.text, fontWeight: 600 })),
      Plot.text(next, Plot.selectMinY({ x: "time", y: "temp", text: (d) => `${d.temp}°`, dy: -12, fill: t.text, fontWeight: 600 })),
      Plot.ruleX(next, Plot.pointerX({ x: "time", stroke: t.baseline })),
      Plot.tip(next, Plot.pointerX({ x: "time", y: "temp", title: (d) => `${hourLabel(d.time)}\n${d.temp}°F, ${d.text}\nChance of rain ${d.pop}%` })),
    ],
  }));
}
