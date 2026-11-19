// Weather window: alerts, current conditions, next 24 hours, and the 7-day forecast (NWS).
import * as Plot from "@observablehq/plot";
import { h, plotBase, dataTable } from "../ui.js";
import { tokens } from "../theme.js";
import { wxIcon } from "../weather.js";

const hourLabel = (d) => d.toLocaleTimeString("en-US", { hour: "numeric" });
const timeLabel = (d) => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
const dayShort = (name) => (/^(tonight|overnight)$/i.test(name) ? "Tonight" : /^(today|this afternoon)$/i.test(name) ? "Today" : name.replace(/ Night$/, "").slice(0, 3));
const severityClass = (s) => ({ Extreme: "critical", Severe: "critical", Moderate: "warning" }[s] || "info");

export function alertBanner(alerts, { compact = false } = {}) {
  if (!alerts?.length) return null;
  const a = alerts[0];
  return h("div", { class: `wx-alert ${severityClass(a.severity)}${compact ? " compact" : ""}`, role: "alert" },
    h("span", { class: "wx-alert-icon", "aria-hidden": "true" }, "⚠"),
    h("span", {}, h("b", {}, a.event), compact ? null : a.ends ? ` until ${a.ends.toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" })}` : "",
      alerts.length > 1 ? ` (+${alerts.length - 1} more)` : ""));
}

export function renderWeather(w) {
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
          h("span", { class: "wx-day" }, dayShort(d.name)),
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
