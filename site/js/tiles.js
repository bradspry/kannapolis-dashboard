// Home-screen tiles: one glanceable summary per widget. Each returns content for os.js to wrap.
import { h } from "./ui.js";
import { tokens } from "./theme.js";
import { gauge } from "./gauge.js";
import { chip } from "./os.js";
import { fy, num, pct, usd, usdCompact } from "./format.js";
import { upcomingEvents, whenLabel, fmtTime } from "./sections/events.js";
import { datasets, ago, fmtDate, byPublisher, formatCounts, statusDot } from "./sections/about.js";
import { weather, wxIcon } from "./weather.js";
import { alertBanner } from "./sections/weather.js";
import { callButtons, activeNotices, noticeCard, crimeRows, quarterLabel } from "./sections/police.js";
import { freeList, stationList } from "./sections/fire.js";
import { payButtons, feeLine } from "./sections/utility.js";
import { parkButtons, seasonStatus, holidayStatus, trainStatus, trainButton, snowfall } from "./sections/parks.js";
import { gemLineup, whenText as gemWhen, poster as gemPoster, rating as gemRating, ticketsButton } from "./sections/gem.js";
import { upcomingShows, whenBadge as swBadge, dayOf as swDay, timeOf as swTime, rentButton, showImage, weeklyStatus } from "./sections/swanee.js";
import { featuredMaker, makerImage, statusLine, siteButton, hoursFor, hoursText, hoursTable } from "./sections/made.js";
import { upcoming as edUpcoming, whenText as edWhen, edStatus, cover as edCover, orderButton as edOrder } from "./sections/editions.js";
import { favorites as wabFavorites, wabLogo, orderButton as wabOrder, price as wabPrice, todayHours as wabToday } from "./sections/whataburger.js";
import { splitVideos, whenBadge as vdBadge, thumb as vdThumb, watchButton as vdWatch, dayLabel as vdDay, timeLabel as vdTime } from "./sections/videos.js";
import { notices as wsNotices, missedButtons as wsMissed } from "./sections/waste.js";
import { levelGauge as drGauge, countyLine as drCounty, strip as drStrip } from "./sections/drought.js";
import { prepGames, nextHome, homeStands, standLabel, nextGameCard, fmtDay as bbDay, fmtTime as bbTime } from "./sections/baseball.js";

const NS = "http://www.w3.org/2000/svg";
const svgEl = (tag, attrs = {}) => {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
};

/** Tiny area sparkline. Stretches to its box. */
function sparkline(values, color) {
  const W = 200, H = 56, pad = 4;
  const min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
  const pts = values.map((v, i) => [pad + ((W - 2 * pad) * i) / (values.length - 1), H - pad - ((H - 2 * pad) * (v - min)) / span]);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join("");
  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: "none", class: "spark", "aria-hidden": "true" });
  const id = `sg${Math.random().toString(36).slice(2, 8)}`;
  const grad = svgEl("linearGradient", { id, x1: 0, y1: 0, x2: 0, y2: 1 });
  grad.append(svgEl("stop", { offset: "0", "stop-color": color, "stop-opacity": ".35" }), svgEl("stop", { offset: "1", "stop-color": color, "stop-opacity": "0" }));
  const defs = svgEl("defs"); defs.append(grad);
  const [lx, ly] = pts.at(-1);
  svg.append(defs,
    svgEl("path", { d: `${line}L${lx},${H}L${pad},${H}Z`, fill: `url(#${id})` }),
    svgEl("path", { d: line, fill: "none", stroke: color, "stroke-width": 2, "vector-effect": "non-scaling-stroke", "stroke-linejoin": "round" }),
    // End dot as a zero-length round-capped stroke, so it stays round when the sparkline stretches.
    svgEl("path", { d: `M${lx},${ly}h0`, stroke: color, "stroke-width": 8, "stroke-linecap": "round", "vector-effect": "non-scaling-stroke" }));
  return svg;
}

/** Donut ring with 2px surface gaps between segments. */
function donut(parts, size = 92, stroke = 12) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, total = parts.reduce((s, p) => s + p.value, 0);
  const svg = svgEl("svg", { viewBox: `0 0 ${size} ${size}`, class: "donut", "aria-hidden": "true" });
  let off = 0;
  for (const p of parts) {
    const len = (c * p.value) / total;
    svg.append(svgEl("circle", { cx: size / 2, cy: size / 2, r, fill: "none", stroke: p.color, "stroke-width": stroke,
      "stroke-dasharray": `${Math.max(0, len - 2)} ${c}`, "stroke-dashoffset": -off, transform: `rotate(-90 ${size / 2} ${size / 2})` }));
    off += len;
  }
  return svg;
}

const head = (iconName, color, title) => h("div", { class: "tile-head" }, chip(iconName, color), h("span", { class: "tile-title" }, title));

/** Department chief for a tile header (photo, name, title), from the City org chart. */
const chiefOf = (org, re) => org?.people?.find((p) => re.test(p.title));
const chiefBadge = (p, role) => (p ? h("div", { class: "tile-chief" },
  h("div", { class: "tile-chief-text" }, h("b", {}, p.name), h("span", {}, role)),
  p.photo ? h("img", { src: p.photo, alt: `${p.name}, ${role}`, loading: "lazy" }) : null) : null);
/** Header with the chief on the right (medium tiles). */
const headWithChief = (iconName, color, title, chief, role) => h("div", { class: "tile-head tile-head-chief" },
  chip(iconName, color), h("span", { class: "tile-title" }, title), chiefBadge(chief, role));
const big = (value, unit) => h("div", { class: "tile-big" }, value, unit ? h("small", {}, unit) : null);
const parseLocal = (s) => { const [d, t = "00:00"] = s.split("T"); const [y, m, dd] = d.split("-").map(Number); const [hh, mm] = t.split(":").map(Number); return new Date(y, m - 1, dd, hh, mm); };

// Sizes: s = 1×1, m = 2×1, l = 2×2, xl = 4×2. Each build(size) shows more as the tile grows.
const isBig = (size) => size === "l" || size === "xl";

/** Live NOAA radar (national base-reflectivity mosaic) centered on Kannapolis, for the weather tile's
 *  background. The image is a 2:1 box in plain lat/lon, sized so 1° of longitude is drawn at its true
 *  width at this latitude; the overlay SVG uses the same box, and both are cropped the same way
 *  (object-fit: cover / preserveAspectRatio slice), so rain, city limits and town dots line up.
 *  The URL changes every 5 minutes so the browser picks up fresh scans when the tile re-renders. */
const RADAR = { lat0: 34.887, lat1: 36.087, lon0: -82.096, lon1: -79.148, W: 1200, H: 600 };
const RADAR_HOME = [35.4874, -80.6217]; // Kannapolis city center (same point as the forecast)
function radarBackdrop(boundaries) {
  const { lat0, lat1, lon0, lon1, W, H } = RADAR;
  const bucket = Math.floor(Date.now() / 300000);
  const src = "https://opengeo.ncep.noaa.gov/geoserver/conus/conus_bref_qcd/ows?service=WMS&version=1.3.0&request=GetMap"
    + `&layers=conus_bref_qcd&styles=&crs=EPSG:4326&bbox=${lat0},${lon0},${lat1},${lon1}&width=${W}&height=${H}&format=image/png&transparent=true&t=${bucket}`;
  const img = h("img", { class: "wx-radar-img", src, alt: "", decoding: "async" });
  img.addEventListener("error", () => img.remove(), { once: true });
  const px = (lat, lon) => [((lon - lon0) / (lon1 - lon0)) * W, ((lat1 - lat) / (lat1 - lat0)) * H];
  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: "xMidYMid slice", class: "wx-radar-svg" });
  const city = boundaries?.features?.find((f) => f.properties.year === "current");
  if (city) svg.append(svgEl("path", { class: "wx-radar-city", d: city.geometry.coordinates.map((poly) => poly.map((ring) =>
    `M${ring.map(([x, y]) => px(y, x).map((v) => v.toFixed(1)).join(",")).join("L")}Z`).join("")).join("") }));
  const [hx, hy] = px(...RADAR_HOME);
  svg.append(svgEl("circle", { cx: hx, cy: hy, r: 4, class: "wx-radar-home" }));
  return h("div", { class: "wx-radar", "aria-hidden": "true" }, img, svg, h("span", { class: "wx-radar-credit" }, "Radar: NOAA"));
}

/** Static SVG zoning map for the XL Land use tile: one path per color (fast to draw), city limits on top.
 *  Uses a simple equirectangular projection corrected for latitude, which is accurate at city scale.
 *  The interactive map lives in the Land use window. */
const zoningMapCache = new Map();
function zoningMap(geo, colorFor, boundaries) {
  const key = geo.features.map((f) => colorFor(f.properties.category)).join("|").length + ":" + colorFor("Residential");
  if (!zoningMapCache.has(key)) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const f of geo.features) for (const ring of f.geometry.coordinates) for (const [x, y] of ring) {
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    const k = Math.cos(((y0 + y1) / 2) * Math.PI / 180), W = 1000, H = Math.round((W * (y1 - y0)) / ((x1 - x0) * k));
    const px = (x, y) => `${((x - x0) / (x1 - x0) * W).toFixed(1)},${((y1 - y) / (y1 - y0) * H).toFixed(1)}`;
    const ringPath = (ring) => `M${ring.map(([x, y]) => px(x, y)).join("L")}Z`;
    const byColor = new Map();
    for (const f of geo.features) {
      const c = colorFor(f.properties.category);
      byColor.set(c, (byColor.get(c) || "") + f.geometry.coordinates.map(ringPath).join(""));
    }
    const city = boundaries?.features?.find((f) => f.properties.year === "current");
    const outline = city ? city.geometry.coordinates.map((poly) => poly.map(ringPath).join("")).join("") : null;
    zoningMapCache.set(key, { W, H, byColor, outline });
  }
  const { W, H, byColor, outline } = zoningMapCache.get(key);
  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, class: "zoning-svg", role: "img", "aria-label": "Map of Kannapolis zoning by category" });
  for (const [c, d] of byColor) svg.append(svgEl("path", { d, fill: c, "fill-rule": "evenodd", stroke: "var(--surface-1)", "stroke-width": 0.6 }));
  if (outline) svg.append(svgEl("path", { d: outline, fill: "none", stroke: "var(--text-primary)", "stroke-width": 2, "stroke-opacity": 0.55, "stroke-linejoin": "round" }));
  return svg;
}
const facts = (rows, cls = "") => h("dl", { class: `facts ${cls}` }, rows.filter(Boolean).flatMap(([k, v]) => [h("dt", {}, k), h("dd", {}, v)]));
/** ☎ and ✉ links for a person; omitted when the number or address isn't published. */
const contactLinks = (p) => [
  p.phone ? h("a", { class: "mail-link", href: `tel:${p.phone.replace(/[^0-9+]/g, "")}`, "aria-label": `Call ${p.name}, ${p.phone}` }, "☎") : null,
  p.email ? h("a", { class: "mail-link", href: `mailto:${p.email}`, "aria-label": `Email ${p.name}` }, "✉") : null,
];
const shortDate = (d) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

export function tileDefs(data, COLORS) {
  const { census, budget, property, zoning, council, org, meetings, news, events, police, fire, baseball, utility, parks, gem, swanee, made, editions, whataburger, videos, waste, drought } = data;
  const t = tokens();
  const geo = census.geographies;
  const k = geo.Kannapolis, nc = geo["North Carolina"], cab = geo["Cabarrus County"], us = geo["United States"];
  const debt = budget.debt_history.at(-1), debt0 = budget.debt_history[0];
  const rate = budget.tax_rate_history.at(-1);
  const ds = budget.debt_service_fy2027 || [];
  const dsTot = (i) => i.principal + i.interest + i.other;
  const gfDs = ds.filter((i) => i.fund === "General Fund").reduce((s, i) => s + dsTot(i), 0);
  const gfSpend = budget.funds_fy2027.find((f) => f.fund === "General Fund")?.amount;
  const pct0 = (v) => `${Math.round(v)}%`;

  // Gauge tiles: dial alone when small; dial + facts when bigger.
  const gaugeTile = (def, g, extra) => ({
    ...def, kind: "gauge", size: def.size || "s",
    build: (size) => {
      // Small: the NC marker key (if any) replaces the caption; otherwise a short caption.
      const dial = gauge({ ...g, id: `${def.id}-${size}`, context: size === "s" && !g.marker ? (g.short || g.context) : null });
      if (size === "s") return dial;
      return h("div", { class: `gauge-tile gt-${size}` },
        h("div", { class: "gt-dial" }, dial),
        h("div", { class: "gt-info" },
          head("gauge", COLORS.gauge, def.label),
          h("p", { class: "tile-meta" }, g.context),
          facts(isBig(size) ? extra : extra.slice(0, 2))));
    },
  });

  const parseM = () => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return meetings.meetings.map((m) => ({ ...m, _d: parseLocal(m.start) })).filter((m) => m._d >= today && !m.canceled).sort((a, b) => a._d - b._d);
  };

  return [
    data.weatherMeta && {
      id: "weather", opens: "weather", size: "s", label: "Weather",
      build: (size) => {
        const w = weather();
        if (!w?.current) return null;
        const c = w.current, today = w.days[0];
        const hilo = today ? [today.hi != null ? `H ${today.hi}°` : null, today.lo != null ? `L ${today.lo}°` : null].filter(Boolean).join(" · ") : "";
        const now = h("div", { class: "wx-now" },
          h("span", { class: "wx-now-icon", "aria-hidden": "true" }, wxIcon(c.text, c.isDay)),
          h("div", {}, h("div", { class: "wx-now-temp" }, `${c.temp}°`), h("div", { class: "wx-now-text" }, c.text), h("div", { class: "tile-meta" }, hilo)));
        const dayName = (d) => /^(tonight|overnight)$/i.test(d.name) ? "Tonight" : /^(today|this afternoon)$/i.test(d.name) ? "Today" : d.name.slice(0, 3);
        // 5-day strip: day, icon, high (low below), rain chance.
        const fiveDay = h("ul", { class: "wx-hours wx-five" }, w.days.slice(0, 5).map((d) => h("li", {},
          h("span", {}, dayName(d)), h("i", { "aria-hidden": "true" }, wxIcon((d.day || d.night).text, !!d.day)),
          h("b", {}, d.hi != null ? `${d.hi}°` : `${d.lo}°`), h("em", {}, d.hi != null && d.lo != null ? `${d.lo}°` : ""),
          h("small", {}, d.pop >= 10 ? `${d.pop}%` : ""))));
        const all = w.days.flatMap((d) => [d.hi, d.lo]).filter((v) => v != null);
        const lo = Math.min(...all), span = Math.max(...all) - lo || 1;
        const days = (n) => h("ul", { class: "wx-days" }, w.days.slice(0, n).map((d) => {
          const p = d.day || d.night, l = d.lo ?? d.hi, u = d.hi ?? d.lo;
          return h("li", {},
            h("span", {}, dayName(d)),
            h("i", { "aria-hidden": "true" }, wxIcon(p.text, !!d.day)),
            h("small", {}, d.lo != null ? `${d.lo}°` : ""),
            h("span", { class: "wx-range" }, h("i", { style: { left: `${(100 * (l - lo)) / span}%`, width: `${Math.max(6, (100 * (u - l)) / span)}%` } })),
            h("b", {}, d.hi != null ? `${d.hi}°` : ""));
        }));
        const top = [radarBackdrop(data.boundaries), head("weather", COLORS.weather, "Kannapolis Weather"), alertBanner(w.alerts, { compact: true })];
        if (size === "s") return h("div", { class: "tile-body wx-tile" }, ...top, now);
        if (size === "m") return h("div", { class: "tile-body wx-tile" }, ...top, h("div", { class: "tile-split wx-m" }, now, fiveDay));
        if (size === "l") return h("div", { class: "tile-body wx-tile" }, ...top, now, days(5));
        return h("div", { class: "tile-body wx-tile" }, ...top, h("div", { class: "tile-split wx-xl" }, now, days(5)));
      },
    },
    police && {
      id: "police", opens: "police", size: "m", label: "Kannapolis Police",
      build: (size) => {
        const last = police.quarters.at(-1);
        const notice = activeNotices(police)[0];
        const headline = h("div", { class: "kpd-headline" },
          h("b", {}, String(last.total_reports)), h("span", {}, ` serious crimes reported ${quarterLabel(last.quarter)} · ${last.status["Cleared by arrest"]}% cleared by arrest`));
        const quick = h("div", { class: "kpd-quick" },
          police.services.filter((s) => /Report a non-emergency|Map of recent/.test(s.title)).map((s) =>
            h("a", { href: s.url, target: "_blank", rel: "noopener" }, /Report/.test(s.title) ? "Report online ↗" : "Event map ↗")));
        const top = [head("police", COLORS.police, "Kannapolis Police")];
        if (size === "s") return h("div", { class: "tile-body" }, ...top, callButtons(police, { compact: true }));
        if (size === "m") return h("div", { class: "tile-body" }, headWithChief("police", COLORS.police, "Kannapolis Police", chiefOf(org, /police chief/i), "Police Chief"),
          h("div", { class: "tile-split kpd-m" }, callButtons(police, { compact: true }),
            h("div", {}, headline, crimeRows(police, { limit: 3, quarters: [last.quarter] }))));
        if (size === "l") return h("div", { class: "tile-body" }, ...top, callButtons(police, { compact: true }),
          notice ? noticeCard(notice, { compact: true }) : null, headline, crimeRows(police, { limit: notice ? 4 : 6, quarters: [last.quarter] }), quick);
        return h("div", { class: "tile-body" }, ...top,
          h("div", { class: "tile-split kpd-xl" },
            h("div", {}, callButtons(police), notice ? noticeCard(notice, { compact: true }) : null, quick),
            h("div", {}, headline,
              h("ul", { class: "mini-legend" }, police.quarters.map((q, i) => h("li", {}, h("i", { style: { background: t.series[i % 2] } }), quarterLabel(q.quarter)))),
              crimeRows(police, { limit: 7 }))));
      },
    },
    fire && {
      id: "fire", opens: "fire", size: "m", label: "Kannapolis Fire Department",
      build: (size) => {
        const top = [head("fire", COLORS.fire, "Kannapolis Fire Dept.")];
        const freeHead = h("div", { class: "mini-head" }, "Free for residents");
        if (size === "s") return h("div", { class: "tile-body" }, ...top, callButtons(fire, { compact: true }));
        if (size === "m") return h("div", { class: "tile-body" }, headWithChief("fire", COLORS.fire, "Kannapolis Fire Dept.", chiefOf(org, /fire chief/i), "Fire Chief"),
          h("div", { class: "tile-split kpd-m" }, callButtons(fire, { compact: true }), h("div", { class: "kfd-m-free" }, freeHead, freeList(fire, 3))));
        if (size === "l") return h("div", { class: "tile-body" }, ...top, callButtons(fire, { compact: true }),
          freeHead, freeList(fire, 2), h("div", { class: "mini-head kfd-st-head" }, "Fire stations"), stationList(fire, { compact: true }));
        return h("div", { class: "tile-body" }, ...top,
          h("div", { class: "tile-split kpd-xl" },
            h("div", {}, callButtons(fire), freeHead, freeList(fire, 4)),
            h("div", {}, h("div", { class: "mini-head" }, "Fire stations"), stationList(fire, { compact: true }),
              h("p", { class: "tile-meta" }, "ISO Class 1: the best fire-protection rating possible"))));
      },
    },
    drought && {
      id: "drought", opens: "drought", size: "m", label: "Current Drought Conditions",
      build: (size) => {
        const dr = drought, lv = dr.levels[String(dr.city.level)];
        const top = [head("drop", COLORS.drought, "Current Drought Conditions")];
        const monitor = h("div", {}, h("div", { class: "mini-head bb-mh" }, `Drought Monitor · ${new Date(`${dr.counties[0].weeks.at(-1).date}T12:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`),
          ...dr.counties.map((c) => drCounty(dr, c)));
        const year = h("div", {}, h("div", { class: "mini-head" }, "Cabarrus County, past year"), drStrip(dr, dr.counties[0], 52),
          h("div", { class: "dr-strip-axis" }, h("span", {}, "a year ago"), h("span", {}, "this week")));
        const tips = h("ul", { class: "pk-rules dr-tile-tips" }, (lv.mandatory ? ["Mandatory rules are in effect. See the City's drought page."] : dr.voluntary_tips.slice(0, 3)).map((x) => h("li", {}, x)));
        const dial = drGauge(dr, `drought-${size}`);
        if (size === "s") return h("div", { class: "tile-body" }, ...top, dial);
        if (size === "m") return h("div", { class: "tile-body" }, ...top, h("div", { class: "tile-split top dr-m" }, dial, monitor));
        if (size === "l") return h("div", { class: "tile-body" }, ...top,
          h("div", { class: "tile-split top dr-m" }, dial, h("div", {}, monitor, h("p", { class: "tile-meta dr-goal" }, `City goal: ${lv.goal.replace(/^Cut/, "cut")}.`))), year, tips);
        return h("div", { class: "tile-body" }, ...top,
          h("div", { class: "tile-split top" }, h("div", {}, dial, h("p", { class: "tile-meta dr-goal" }, lv.goal), tips),
            h("div", {}, monitor, year, h("div", { class: "mini-head" }, "Rowan County, past year"), drStrip(dr, dr.counties[1], 52))));
      },
    },
    waste && {
      id: "waste", opens: "waste", size: "m", label: "Waste Collection",
      build: (size) => {
        const top = [head("trash", COLORS.waste, "Waste Collection")];
        const now = wsNotices(waste);
        const noteList = (n) => now.length ? h("ul", { class: "ub-mini ws-mini" }, now.slice(0, n).map((x) => h("li", {}, h("b", { "aria-hidden": "true" }, x.emoji), h("span", {}, x.short)))) : null;
        const finder = h("a", { class: "ws-finder", href: waste.cartology.page, target: "_blank", rel: "noopener" }, "📅 Find your pickup day (CARTology) ↗");
        const schedule = (n) => h("ul", { class: "ub-mini ws-sched" }, waste.services.slice(0, n).map((s) => h("li", {}, h("b", {}, s.name), h("span", {}, s.every))));
        const sched = schedule(3);
        const label = h("div", { class: "bb-next-label ws-label" }, "Missed a pickup? Within 24 hours:");
        if (size === "s") return h("div", { class: "tile-body" }, ...top, label, wsMissed(waste, { compact: true }));
        if (size === "m") return h("div", { class: "tile-body" }, ...top,
          h("div", { class: "tile-split top" }, h("div", {}, label, wsMissed(waste, { compact: true })),
            h("div", {}, h("div", { class: "mini-head bb-mh" }, now.length ? "Heads up" : "Schedule"), noteList(2) || sched, finder)));
        // Large: the department director in the header (like the police and fire chiefs) and the CARTology app links.
        if (size === "l") return h("div", { class: "tile-body" }, headWithChief("trash", COLORS.waste, "Waste Collection", waste.director, "Director of Transportation & Environmental Services"),
          label, wsMissed(waste, { compact: true, side: true }),
          // Heads up: the first two notes stacked, the third (usually loose-leaf season) beside them.
          now.length ? [h("div", { class: "mini-head" }, "Heads up"),
            h("div", { class: "ws-heads" }, noteList(2),
              now[2] ? h("ul", { class: "ub-mini ws-mini" }, h("li", {}, h("b", { "aria-hidden": "true" }, now[2].emoji), h("span", {}, now[2].short))) : null)] : null,
          h("div", { class: "mini-head" }, "What goes where"),
          h("ul", { class: "ws-where", role: "list" }, waste.services.map((x) => h("li", {},
            h("span", { class: "ws-where-emoji", "aria-hidden": "true" }, x.emoji), h("span", {}, h("b", {}, x.short_name), h("small", {}, x.short))))),
          h("div", { class: "ws-finder-row" }, h("a", { href: waste.cartology.page, target: "_blank", rel: "noopener" }, "📅 Find your day ↗"),
            h("a", { href: waste.cartology.app_store, target: "_blank", rel: "noopener" }, "iPhone app ↗"),
            h("a", { href: waste.cartology.google_play, target: "_blank", rel: "noopener" }, "Android app ↗")));
        return h("div", { class: "tile-body" }, ...top,
          h("div", { class: "tile-split top" },
            h("div", {}, label, wsMissed(waste, { compact: true }), finder),
            h("div", {}, now.length ? [h("div", { class: "mini-head bb-mh" }, "Heads up"), noteList(3)] : null,
              h("div", { class: "mini-head" }, "Schedule"), sched)));
      },
    },
    videos && {
      id: "videos", opens: "videos", size: "m", label: "Council Meeting Videos",
      build: (size) => {
        const { next, recent } = splitVideos(videos);
        const latest = recent[0];
        const top = [head("video", COLORS.videos, "Council Meeting Videos")];
        const nextBlock = next ? h("div", { class: "vd-tile-next" },
          h("div", { class: "date-block sm" }, h("span", {}, next._d.toLocaleDateString("en-US", { month: "short" })), h("b", {}, next._d.getDate())),
          h("div", {}, h("div", { class: "bb-next-label" }, next.live ? "Streaming now" : vdBadge(next) || "Next meeting · live"),
            h("div", { class: "gem-tile-title" }, `${vdDay(next._d, { weekday: "long" })} · ${vdTime(next._d)}`), vdWatch(next, { compact: true }))) : null;
        const latestBlock = latest ? h("a", { class: "vd-tile-latest", href: latest.url, target: "_blank", rel: "noopener", "aria-label": `Watch the ${vdDay(latest._d, { month: "long", day: "numeric" })} meeting on YouTube` },
          vdThumb(latest, "sm"), h("div", {}, h("div", { class: "bb-next-label" }, "Latest recording"), h("b", {}, vdDay(latest._d, { month: "short", day: "numeric" })),
            h("span", { class: "tile-meta" }, `${latest.views.toLocaleString("en-US")} views`))) : null;
        const more = (n) => h("ul", { class: "mini-list" }, recent.slice(1, 1 + n).map((v) => h("li", {}, h("span", { class: "mini-date" }, vdDay(v._d, { month: "short", day: "numeric" })),
          h("a", { href: v.url, target: "_blank", rel: "noopener" }, `Council meeting ↗`))));
        if (size === "s") return h("div", { class: "tile-body" }, ...top, nextBlock || latestBlock);
        const earlier = (n) => h("p", { class: "tile-meta vd-earlier" }, "Earlier: ", ...recent.slice(1, 1 + n).flatMap((v, i) => [i ? " · " : "",
          h("a", { href: v.url, target: "_blank", rel: "noopener" }, vdDay(v._d, { month: "short", day: "numeric" }))]));
        if (size === "m") return h("div", { class: "tile-body" }, ...top, h("div", { class: "tile-split top" }, nextBlock || latestBlock,
          next ? h("div", {}, latestBlock, earlier(3)) : h("div", {}, h("div", { class: "mini-head bb-mh" }, "Earlier"), more(3))));
        if (size === "l") return h("div", { class: "tile-body" }, ...top, nextBlock, latestBlock, h("div", { class: "mini-head" }, "Earlier meetings"), more(3));
        return h("div", { class: "tile-body" }, ...top,
          h("div", { class: "tile-split top" }, h("div", {}, nextBlock, latestBlock),
            h("div", { class: "vd-tile-row" }, recent.slice(1, 5).map((v) => h("a", { href: v.url, target: "_blank", rel: "noopener", class: "vd-tile-mini" }, vdThumb(v, "sm"), h("span", {}, vdDay(v._d, { month: "short", day: "numeric" })))))));
      },
    },
    whataburger && {
      id: "whataburger", opens: "whataburger", size: "m", label: "What-A-Burger #1",
      build: (size) => {
        const wab = whataburger;
        const top = [head("burger", COLORS.whataburger, "What-A-Burger #1")];
        const who = h("div", { class: "gem-tile-now mk-tile-now" }, wabLogo(wab, "sm"),
          h("div", {}, h("div", { class: "bb-next-label" }, "Drive-in · N Cannon Blvd"), h("div", { class: "gem-tile-title" }, wab.name),
            h("div", { class: "tile-meta" }, `Today: ${wabToday(wab)}`), statusLine(wab, "", { compact: true })));
        const favs = (n) => h("ul", { class: "ub-mini mk-mini wab-mini" }, wabFavorites(wab).slice(0, n).map((f) => h("li", {}, h("b", {}, f.item ? wabPrice(f.item) : ""), h("span", {}, f.label))));
        if (size === "s") return h("div", { class: "tile-body" }, ...top, who);
        if (size === "m") return h("div", { class: "tile-body" }, ...top,
          h("div", { class: "tile-split top" }, who, h("div", {}, h("div", { class: "mini-head bb-mh" }, "Local favorites"), favs(3), wabOrder(wab, { compact: true }))));
        if (size === "l") return h("div", { class: "tile-body" }, ...top, who, h("div", { class: "mini-head" }, "Local favorites"), favs(5), wabOrder(wab, { compact: true }));
        return h("div", { class: "tile-body" }, ...top,
          h("div", { class: "tile-split top" }, h("div", {}, who, wabOrder(wab, { compact: true })),
            h("div", {}, h("div", { class: "mini-head bb-mh" }, "Local favorites"), favs(6))));
      },
    },
    editions && {
      id: "editions", opens: "editions", size: "m", label: "Kannapolis Reads and Yarns",
      build: (size) => {
        const ed = editions;
        const top = [head("book", COLORS.editions, "Kannapolis Reads and Yarns")];
        const evs = edUpcoming(ed);
        const status = h("div", { class: "ed-tile-status" }, h("div", { class: "gem-tile-title" }, "Editions · S Main St"), edStatus(ed, "store", { compact: true }), edStatus(ed, "drive", { compact: true }));
        const covers = (n) => h("div", { class: "ed-covers" }, ed.books.slice(0, n).map((b) => edCover(b, "sm")));
        const events = (n) => h("ul", { class: "ub-mini ed-mini" }, evs.slice(0, n).map((e) => h("li", {}, h("b", {}, edWhen(e).split(" · ")[0]), h("span", {}, e.title))));
        if (size === "s") return h("div", { class: "tile-body" }, ...top, status);
        if (size === "m") return h("div", { class: "tile-body" }, ...top,
          h("div", { class: "tile-split top" }, h("div", {}, status, edOrder(ed, { compact: true })),
            h("div", {}, h("div", { class: "mini-head bb-mh" }, "New books"), covers(4))));
        if (size === "l") return h("div", { class: "tile-body" }, ...top, status,
          h("div", { class: "mini-head" }, "New books"), covers(5), h("div", { class: "mini-head" }, "Coming up"), events(3), edOrder(ed, { compact: true }));
        return h("div", { class: "tile-body" }, ...top,
          h("div", { class: "tile-split top" },
            h("div", {}, status, h("div", { class: "mini-head" }, "Coming up"), events(4), edOrder(ed, { compact: true })),
            h("div", {}, h("div", { class: "mini-head bb-mh" }, "New books"), covers(8))));
      },
    },
    made && {
      id: "made", opens: "made", size: "m", label: "Made in Kannapolis",
      build: (size) => {
        const m = featuredMaker(made);
        const top = [head("mug", COLORS.made, "Made in Kannapolis")];
        const today = hoursText(hoursFor(m, new Date().getDay()));
        const who = h("div", { class: "gem-tile-now mk-tile-now" }, makerImage(m, size === "s" ? "sm" : "md"),
          h("div", {}, h("div", { class: "bb-next-label" }, `${m.kind.split(" &")[0]} · Est. ${m.est}`), h("div", { class: "gem-tile-title" }, m.name),
            h("div", { class: "tile-meta" }, "🎖 Veteran-owned · West Ave"), statusLine(m)));
        const beers = h("ul", { class: "ub-mini mk-mini" }, m.beers.map((b) => h("li", {}, h("b", {}, b.abv), h("span", {}, b.name))));
        if (size === "s") return h("div", { class: "tile-body" }, ...top, who);
        if (size === "m") return h("div", { class: "tile-body" }, ...top,
          h("div", { class: "tile-split top" }, who, h("div", {}, h("div", { class: "mini-head bb-mh" }, "Made here"), beers,
            h("p", { class: "tile-meta" }, `Today: ${today}`), siteButton(m, { compact: true }))));
        if (size === "l") return h("div", { class: "tile-body" }, ...top, who,
          h("div", { class: "mini-head" }, "Made here"), beers, h("p", { class: "tile-meta" }, `Today: ${today}`), siteButton(m, { compact: true }));
        return h("div", { class: "tile-body" }, ...top,
          h("div", { class: "tile-split top" },
            h("div", {}, who, h("div", { class: "mini-head" }, "Made here"), beers, siteButton(m, { compact: true })),
            h("div", {}, h("div", { class: "mini-head bb-mh" }, "Taproom hours"), hoursTable(m))));
      },
    },
    swanee && {
      id: "swanee", opens: "swanee", size: "m", label: "The Swanee Theatre",
      build: (size) => {
        const shows = upcomingShows(swanee);
        const next = shows[0];
        const top = [head("mic", COLORS.swanee, "The Swanee Theatre")];
        const nextBlock = next ? h("div", { class: "gem-tile-now" }, showImage(next, "sm"),
          h("div", {}, h("div", { class: "bb-next-label" }, swBadge(next._d) || "Next show"), h("div", { class: "gem-tile-title" }, next.title),
            h("div", { class: "tile-meta" }, `${swDay(next._d)} · ${swTime(next._d)}`))) : h("p", { class: "tile-meta" }, "No shows listed right now.");
        const list = (n) => h("ul", { class: "mini-list" }, shows.slice(1, 1 + n).map((e) =>
          h("li", {}, h("span", { class: "mini-date" }, swDay(e._d, { month: "short", day: "numeric" })), h("span", {}, e.title))));
        const weekly = h("ul", { class: "ub-mini pk-mini" }, swanee.weekly.map((w) => h("li", {}, h("b", {}, w.title), h("span", {}, weeklyStatus(w).label))));
        if (size === "s") return h("div", { class: "tile-body" }, ...top, nextBlock);
        if (size === "m") return h("div", { class: "tile-body" }, ...top,
          h("div", { class: "tile-split top" }, nextBlock, h("div", {}, h("div", { class: "mini-head bb-mh" }, "Coming up"), list(2), rentButton(swanee, { compact: true }))));
        if (size === "l") return h("div", { class: "tile-body" }, ...top, nextBlock,
          h("div", { class: "mini-head" }, "Coming up"), list(4), rentButton(swanee, { compact: true }));
        return h("div", { class: "tile-body" }, ...top,
          h("div", { class: "tile-split top" },
            h("div", {}, nextBlock, h("div", { class: "mini-head" }, "Weekly happenings"), weekly, rentButton(swanee, { compact: true })),
            h("div", {}, h("div", { class: "mini-head bb-mh" }, "Coming up"), list(7))));
      },
    },
    gem && {
      id: "gem", opens: "gem", size: "m", label: "The Gem Theatre",
      build: (size) => {
        const { now, next } = gemLineup(gem);
        const top = [head("film", COLORS.gem, "The Gem Theatre")];
        const nowBlock = (ps) => now ? h("div", { class: "gem-tile-now" }, gemPoster(now, ps),
          h("div", {}, h("div", { class: "bb-next-label" }, "Now showing"), h("div", { class: "gem-tile-title" }, now.title, " ", gemRating(now)),
            h("div", { class: "tile-meta" }, gemWhen(now)))) : h("p", { class: "tile-meta" }, "See the ticket page for what's showing.");
        const nextList = (n) => h("ul", { class: "mini-list" }, next.slice(0, n).map((f) =>
          h("li", {}, h("span", { class: "mini-date" }, new Date(`${f.start}T12:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })), h("span", {}, `${f.title}${f.rating ? ` (${f.rating})` : ""}`))));
        if (size === "s") return h("div", { class: "tile-body" }, ...top, nowBlock("sm"));
        if (size === "m") return h("div", { class: "tile-body" }, ...top,
          h("div", { class: "tile-split top" }, nowBlock("sm"), h("div", {}, h("div", { class: "mini-head bb-mh" }, "Coming soon"), nextList(2), ticketsButton(gem, "Tickets"))));
        if (size === "l") return h("div", { class: "tile-body" }, ...top, nowBlock("md"),
          h("div", { class: "mini-head" }, "Coming soon"), nextList(3), ticketsButton(gem));
        return h("div", { class: "tile-body" }, ...top,
          h("div", { class: "gem-strip" }, [now, ...next].filter(Boolean).slice(0, 4).map((f, i) => h("div", { class: "gem-strip-item" }, gemPoster(f, "md"),
            h("b", {}, f.title), h("small", {}, i === 0 && f === now ? "Now showing" : gemWhen(f))))), ticketsButton(gem));
      },
    },
    parks && {
      id: "parks", opens: "parks", size: "m", label: "Parks & Recreation",
      build: (size) => {
        const hol = holidayStatus(parks.holiday);
        const holLine = hol ? h("p", { class: "pk-hol-line" }, h("span", { "aria-hidden": "true" }, "🎄 "), h("b", {}, "Celebration of Lights: "), hol.label, hol.open ? h("span", { "aria-hidden": "true" }, " ✨") : null) : null;
        const train = trainStatus(parks.holiday);
        // Winterland Express: tonight's reservation situation, plus the reserve button when online seats apply.
        const trainLine = train && !train.reserve ? h("p", { class: "pk-hol-line pk-train-line" }, h("span", { "aria-hidden": "true" }, "🚂 "), h("b", {}, "Winterland Express: "), train.short) : null;
        const trainBtn = train?.reserve ? trainButton(parks.holiday, { compact: true }) : null;
        // During the holiday season the tile title gets a little festive (decorative only).
        const title = hol ? h("div", { class: "tile-head" }, chip("tree", COLORS.parks), h("span", { class: "tile-title" }, "Parks & Recreation"), h("span", { class: "pk-hol-tilt", "aria-hidden": "true" }, "🎄❄️🎁")) : head("tree", COLORS.parks, "Parks & Recreation");
        const snow = hol ? snowfall(size === "s" ? 14 : size === "m" ? 24 : 34) : null;
        const top = [snow, title, holLine, trainLine];
        const parkRows = (n) => h("ul", { class: "ub-mini pk-mini" }, parks.parks.slice(0, n).map((p) =>
          h("li", {}, h("b", {}, p.name), h("span", {}, p.tags.slice(0, 3).join(" · ")))));
        const seasonal = h("ul", { class: "ub-mini pk-mini" }, parks.seasonal.map((s) => { const st = seasonStatus(s); return h("li", {}, h("b", {}, s.what.replace("Village Park ", "")), h("span", {}, st.label)); }));
        const counts = h("p", { class: "tile-meta pk-counts" }, `${parks.parks.length} parks · ${parks.greenways.length} greenways · weather hotline ${parks.weather_hotline}`);
        if (size === "s") return h("div", { class: "tile-body" }, snow, title, holLine, trainBtn || parkButtons(parks, { compact: true, primaryOnly: true }));
        if (size === "m") return h("div", { class: "tile-body" }, snow, title,
          h("div", { class: "tile-split top ub-m" }, parkButtons(parks, { compact: true }),
            h("div", {}, hol ? holLine : h("div", { class: "mini-head bb-mh" }, "Popular parks"),
              train ? [trainLine, trainBtn] : parkRows(hol ? 2 : 3))), hol ? null : counts);
        if (size === "l") return h("div", { class: "tile-body" }, ...top, trainBtn, parkButtons(parks, { compact: true }),
          h("div", { class: "mini-head" }, "Parks"), parkRows(train ? 4 : 5), counts);
        return h("div", { class: "tile-body" }, ...top,
          h("div", { class: "tile-split top" },
            h("div", {}, parkButtons(parks), trainBtn, h("div", { class: "mini-head" }, "Village Park, seasonal"), seasonal, counts),
            h("div", {}, h("div", { class: "mini-head bb-mh" }, "Parks"), parkRows(7))));
      },
    },
    utility && {
      id: "utility", opens: "utility", size: "m", label: "Pay Utility Bill",
      build: (size) => {
        const top = [head("bill", COLORS.utility, "Pay Utility Bill")];
        const t = utility.terms;
        const callMain = h("a", { href: `tel:${utility.phones.main.replace(/[^0-9]/g, "")}`, class: "ub-inline" }, utility.phones.main);
        const ways = (n) => h("ul", { class: "ub-mini" }, utility.ways.filter((w) => !/Online|phone/i.test(w.how)).slice(0, n).map((w) =>
          h("li", {}, h("b", {}, w.how), h("span", {}, w.detail.split(/[.:]/)[0]))));
        const dueDays = h("ul", { class: "ub-mini" },
          h("li", {}, h("b", {}, `Day ${t.past_due_day}`), h("span", {}, "Past due")),
          h("li", {}, h("b", {}, `Day ${t.late_fee_day}`), h("span", {}, `Late fee: ${t.late_fee_rate * 100}%, max $${t.late_fee_max}`)),
          h("li", {}, h("b", {}, `Day ${t.disconnect_day}`), h("span", {}, "Service may be cut off")));
        if (size === "s") return h("div", { class: "tile-body" }, ...top, payButtons(utility, { compact: true }));
        if (size === "m") return h("div", { class: "tile-body" }, ...top,
          h("div", { class: "tile-split top ub-m" }, payButtons(utility, { compact: true }), h("div", {}, h("div", { class: "mini-head bb-mh" }, "Other ways"), ways(2))), feeLine(utility));
        if (size === "l") return h("div", { class: "tile-body" }, ...top, payButtons(utility, { compact: true }), feeLine(utility),
          h("div", { class: "mini-head" }, "After your bill date"), dueDays,
          h("p", { class: "tile-meta" }, "Behind? Ask for a payment plan: ", callMain));
        return h("div", { class: "tile-body" }, ...top,
          h("div", { class: "tile-split top" },
            h("div", {}, payButtons(utility), feeLine(utility), h("div", { class: "mini-head" }, "Other ways"), ways(4)),
            h("div", {}, h("div", { class: "mini-head bb-mh" }, "After your bill date"), dueDays,
              h("p", { class: "tile-meta" }, "Behind on your bill? Customer Service will set up a payment plan: ", callMain))));
      },
    },
    baseball && {
      id: "baseball", opens: "baseball", size: "m", label: "Cannon Ballers",
      build: (size) => {
        const games = prepGames(baseball);
        const today0 = new Date(); today0.setHours(0, 0, 0, 0);
        const stands = homeStands(games).filter((s) => s.end >= today0);
        const g = nextHome(games);
        const top = [head("baseball", COLORS.baseball, "Cannon Ballers 2027")];
        const upcoming = (n) => h("ul", { class: "mini-list" }, games.filter((x) => x.home && x._d >= today0 && x !== g).slice(0, n).map((x) =>
          h("li", {}, h("span", { class: "mini-date" }, bbDay(x._d, { month: "short", day: "numeric" })), h("span", {}, `vs ${x.opp} · ${bbTime(x.time)}`))));
        const standList = (n) => h("ul", { class: "bb-stands compact", role: "list" }, stands.slice(0, n).map((s) =>
          h("li", {}, h("span", { class: "bb-stand-dates" }, standLabel(s)), h("b", {}, `vs ${s.name}`), h("small", {}, `${s.games.length}`))));
        if (!g) return h("div", { class: "tile-body" }, ...top, nextGameCard(baseball, games, { compact: true }));
        if (size === "s") return h("div", { class: "tile-body" }, ...top, nextGameCard(baseball, games, { compact: true }));
        if (size === "m") return h("div", { class: "tile-body" }, ...top,
          h("div", { class: "tile-split top" }, nextGameCard(baseball, games, { compact: true }), h("div", {}, h("div", { class: "mini-head bb-mh" }, "Next at home"), upcoming(3))));
        if (size === "l") return h("div", { class: "tile-body" }, ...top, nextGameCard(baseball, games),
          h("div", { class: "mini-head" }, "Upcoming home stands"), standList(5));
        return h("div", { class: "tile-body" }, ...top,
          h("div", { class: "tile-split top" }, h("div", {}, nextGameCard(baseball, games), h("div", { class: "mini-head" }, "Next at home"), upcoming(4)),
            h("div", {}, h("div", { class: "mini-head bb-mh" }, "Upcoming home stands"), standList(8))));
      },
    },
    gaugeTile({ id: "g-debt-limit", opens: "budget", label: "Legal Debt Limit Used" },
      { label: "Legal Debt Limit Used", value: (100 * debt.net_debt_applicable) / debt.debt_limit, max: 100, format: (v) => pct(v), tickFormat: pct0,
        context: `${usdCompact(debt.net_debt_applicable)} of ${usdCompact(debt.debt_limit)} allowed by state law` },
      [["Debt counted toward limit", usd(debt.net_debt_applicable)], ["State limit (8% of value)", usd(debt.debt_limit)], ["Room left", usd(debt.legal_debt_margin)], ["As of", `June 30, ${debt.fiscal_year}`]]),
    gfDs && gfSpend && gaugeTile({ id: "g-debt-policy", opens: "debt-service", label: "Taxes Going to Debt" },
      { label: "Taxes Going to Debt", value: (100 * gfDs) / gfSpend, max: 20, zones: [{ from: 15, to: 20 }], format: (v) => pct(v), tickFormat: pct0,
        context: "Red: over the City's 15% policy cap" },
      [["General Fund debt payments", usd(gfDs)], ["General Fund spending", usd(gfSpend)], ["City policy cap", "15%"], ["Budget year", "FY27"]]),
    {
      id: "people", opens: "people", size: "m", label: "Residents",
      build: (size) => {
        const pops = budget.debt_history.map((d) => d.population);
        const growth = (100 * (debt.population - debt0.population)) / debt0.population;
        const number = h("div", {}, big(num(debt.population)), h("div", { class: "tile-delta up" }, `▲ ${pct(growth, 0)} since ${debt0.fiscal_year}`));
        if (size === "s") return h("div", { class: "tile-body" }, head("people", COLORS.people, "Residents"), number, h("div", { class: "tile-spark sm" }, sparkline(pops, t.series[0])));
        const stats = [["Median household income", `${usd(k.median_household_income)}`, `NC ${usd(nc.median_household_income)}`],
          ["Median home value", usd(k.median_home_value), `NC ${usd(nc.median_home_value)}`],
          ["Median age", String(k.median_age), `NC ${nc.median_age}`],
          ["Below poverty line", pct(k.poverty_rate), `NC ${pct(nc.poverty_rate)}`],
          ["Bachelor's degree or higher", pct(k.bachelors_plus_pct), `NC ${pct(nc.bachelors_plus_pct)}`],
          ["Median rent", usd(k.median_gross_rent), `NC ${usd(nc.median_gross_rent)}`]];
        if (size === "m") {
          // Left: population + three key numbers vs. NC. Right: population trend + age mix.
          const quick = h("ul", { class: "ub-mini pp-mini" },
            [["Income", usdCompact(k.median_household_income), usdCompact(nc.median_household_income)],
             ["Home value", usdCompact(k.median_home_value), usdCompact(nc.median_home_value)],
             ["Median age", String(k.median_age), String(nc.median_age)]].map(([a, b, c]) =>
              h("li", {}, h("span", {}, a), h("b", {}, b), h("small", {}, `NC ${c}`))));
          const ages = Object.entries(k.age).map(([label, v], i) => ({ label: label.replace(" and over", "+").replace(" to ", "–"), v, c: t.series[i] }));
          const ageBar = h("div", {}, h("div", { class: "mini-head bb-mh" }, "Age mix"),
            h("div", { class: "mini-bar", "aria-hidden": "true" }, ages.map((a) => h("span", { style: { flex: `${a.v} 1 0`, background: a.c } }))),
            h("ul", { class: "mini-legend" }, ages.map((a) => h("li", {}, h("i", { style: { background: a.c } }), `${a.label} ${pct(a.v, 0)}`))));
          return h("div", { class: "tile-body" }, head("people", COLORS.people, "Residents"),
            h("div", { class: "tile-split top pp-m" },
              h("div", {}, number, quick),
              h("div", { class: "pp-m-right" }, h("div", { class: "tile-spark pp-spark" }, sparkline(pops, t.series[0])), ageBar)));
        }
        return h("div", { class: "tile-body" }, head("people", COLORS.people, "Residents"),
          h("div", { class: `tile-split ${size === "xl" ? "wide" : ""}` }, number, h("div", { class: "tile-spark" }, sparkline(pops, t.series[0]))),
          h("ul", { class: `stat-rows ${size === "xl" ? "cols-2" : ""}` }, stats.slice(0, size === "xl" ? 6 : 4).map(([a, b, c]) =>
            h("li", {}, h("span", {}, a), h("b", {}, b), h("small", {}, c)))),
          h("div", { class: "tile-meta" }, `${census.release} · population from City audit (${debt.fiscal_year})`));
      },
    },
    meetings && {
      id: "meetings", opens: "meetings", size: "l", label: "Next Meetings",
      build: (size) => {
        const up = parseM(), next = up[0];
        const nextBlock = next ? h("div", { class: "next-mtg" },
          h("div", { class: "date-block" }, h("span", {}, next._d.toLocaleDateString("en-US", { month: "short" })), h("b", {}, next._d.getDate())),
          h("div", {},
            h("div", { class: "next-title" }, next.title),
            h("div", { class: "tile-meta" }, `${next._d.toLocaleDateString("en-US", { weekday: size === "s" ? "short" : "long" })} · ${next._d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`),
            h("span", { class: `pill ${next.agenda ? "ok" : ""}` }, next.agenda ? "Agenda posted" : size === "s" ? "No agenda yet" : "Agenda not posted yet"))) : h("p", { class: "tile-meta" }, "No upcoming meetings posted.");
        const list = (n) => up.length > 1 ? [h("div", { class: "mini-head" }, "Coming up"),
          h("ul", { class: `mini-list ${size === "xl" ? "cols-2" : ""}` }, up.slice(1, 1 + n).map((m) => h("li", {}, h("span", { class: "mini-date" }, shortDate(m._d)), h("span", {}, m.title))))] : [];
        if (size === "m") return h("div", { class: "tile-body" }, head("meetings", COLORS.meetings, "Public Meetings"),
          h("div", { class: "tile-split top" }, nextBlock, h("div", {}, ...list(2))));
        return h("div", { class: "tile-body" }, head("meetings", COLORS.meetings, "Public Meetings"), nextBlock, ...(size === "s" ? [] : list(size === "xl" ? 8 : 5)));
      },
    },
    events?.events?.length && {
      id: "events", opens: "events", size: "m", label: "Upcoming Events",
      build: (size) => {
        const up = upcomingEvents(events);
        const n = { s: 1, m: 2, l: 5, xl: 8 }[size];
        const row = (e) => {
          const series = e.count > 1;
          const when = whenLabel(e);
          return h("li", { class: "ev-mini" },
            h("span", { class: `ev-chip${series && e._onNow ? " now" : ""}` },
              series && e._onNow ? "On now" : shortDate(e._next)),
            h("div", {},
              h("div", { class: "ev-mini-title" }, e.title),
              h("div", { class: "tile-meta" }, series ? `${e.recurrence.split(",")[0]} to ${shortDate(e._dates.at(-1))} · ${fmtTime(e.time)}`
                : [when, fmtTime(e.time), size !== "m" ? e.location : null].filter(Boolean).join(" · "))));
        };
        return h("div", { class: "tile-body" }, head("events", COLORS.events, "Upcoming Events"),
          up.length ? h("ul", { class: `ev-mini-list ${size === "s" ? "solo" : ""} ${size === "xl" ? "cols-2" : ""}` }, up.slice(0, n).map(row))
            : h("p", { class: "tile-meta" }, "Nothing on the City calendar right now."));
      },
    },
    gaugeTile({ id: "g-tax-rate", opens: "budget", label: "City Tax Rate" },
      { label: "City Tax Rate", value: rate.rate_per_100 * 100, max: 150, format: (v) => `${v.toFixed(2)}¢`, tickFormat: (v) => (v ? "$1.50" : "0¢"),
        context: `per $100 of value (${fy(rate.fiscal_year)}) · dial ends at the state max`, short: `per $100 · state max $1.50` },
      [["On a $300,000 home", `${usd(3000 * rate.rate_per_100)} a year`], ["State maximum", "$1.50 per $100"], ["Taxable value (est.)", usdCompact(rate.assessed_value)], ["Change from last year", (() => { const prev = budget.tax_rate_history.at(-2)?.rate_per_100; return prev == null ? "—" : prev === rate.rate_per_100 ? "No change" : `from ${(prev * 100).toFixed(2)}¢`; })()]]),
    gaugeTile({ id: "g-owners", opens: "people", label: "Homeowners" },
      { label: "Homeowners", value: k.owner_occupied_pct, max: 100, format: (v) => pct(v), tickFormat: pct0,
        marker: { value: nc.owner_occupied_pct, label: `NC ${pct(nc.owner_occupied_pct)}` }, context: "Share of occupied homes lived in by their owner" },
      [["Kannapolis", pct(k.owner_occupied_pct)], ["Cabarrus County", pct(cab.owner_occupied_pct)], ["North Carolina", pct(nc.owner_occupied_pct)], ["United States", pct(us.owner_occupied_pct)]]),
    {
      id: "budget", opens: "budget", size: "m", label: "City Budget",
      build: (size) => {
        const funds = [...budget.funds_fy2027].sort((a, b) => b.amount - a.amount);
        const top = funds.slice(0, 3), rest = funds.slice(3).reduce((s, f) => s + f.amount, 0);
        const parts = [...top.map((f, i) => ({ label: f.fund.replace(" Fund", ""), value: f.amount, color: t.series[i] })), { label: "Other funds", value: rest, color: t.mutedFill }];
        const sum = parts.reduce((s, p) => s + p.value, 0);
        const bar = h("div", { class: "mini-bar", "aria-hidden": "true" }, parts.map((p) => h("span", { style: { flex: `${p.value} 1 0`, background: p.color } })));
        const body = [head("budget", COLORS.budget, "FY27 Budget"), big(usdCompact(budget.headline.total_budget_fy2027))];
        if (size === "s") return h("div", { class: "tile-body" }, ...body, h("div", { class: "tile-meta" }, `${num(budget.headline.full_time_positions_fy2027)} full-time jobs`), bar);
        if (size === "m") return h("div", { class: "tile-body" }, ...body, bar,
          h("ul", { class: "mini-legend" }, parts.map((p) => h("li", {}, h("i", { style: { background: p.color } }), `${p.label} ${pct((100 * p.value) / sum, 0)}`))));
        const max = funds[0].amount;
        return h("div", { class: "tile-body" }, ...body, h("div", { class: "tile-meta" }, `All funds, adopted · ${num(budget.headline.full_time_positions_fy2027)} full-time jobs`),
          h("ul", { class: `fund-bars ${size === "xl" ? "cols-2" : ""}` }, funds.map((f) => h("li", {},
            h("div", { class: "fb-label" }, h("span", {}, f.fund), h("b", {}, usdCompact(f.amount))),
            h("div", { class: "fb-track" }, h("span", { style: { width: `${(100 * f.amount) / max}%` } }))))));
      },
    },
    ds.length && {
      id: "debt-service", opens: "debt-service", size: "s", label: "City Debt",
      build: (size) => {
        const sum = (key) => ds.reduce((s, i) => s + i[key], 0);
        const tot = ds.reduce((s, i) => s + dsTot(i), 0);
        const parts = [{ label: "Principal", v: sum("principal"), c: t.series[0] }, { label: "Interest", v: sum("interest"), c: t.series[1] }, { label: "Issuance & new debt", v: sum("other"), c: t.series[2] }];
        const bar = h("div", { class: "mini-bar", "aria-hidden": "true" }, parts.map((p) => h("span", { style: { flex: `${p.v} 1 0`, background: p.c } })));
        const legend = (n) => h("ul", { class: "mini-legend" }, parts.slice(0, n).map((p) => h("li", {}, h("i", { style: { background: p.c } }), `${p.label} ${usdCompact(p.v)}`)));
        // Lead with what the City owes (latest audit); this year's payments come second.
        const body = [head("debt", COLORS.debt, "City Debt"), big(usdCompact(debt.total_debt)),
          h("div", { class: "tile-meta" }, `total owed · June 30, ${debt.fiscal_year} audit · ${usd(debt.debt_per_capita)} per resident`)];
        const pay = (n) => h("div", { class: "ds-tile-pay" }, h("div", { class: "mini-head" }, `Payments this year (FY27): ${usdCompact(tot)}`), bar, n ? legend(n) : null);
        if (size === "s") return h("div", { class: "tile-body" }, ...body, pay(0));
        if (size === "m") return h("div", { class: "tile-body" }, ...body, pay(3));
        const topPay = ds.filter((i) => dsTot(i) > 0).sort((a, b) => dsTot(b) - dsTot(a)).slice(0, size === "xl" ? 8 : 4);
        return h("div", { class: "tile-body" }, ...body, pay(3),
          h("div", { class: "mini-head" }, "Biggest payments this year"),
          h("ul", { class: `mini-list money ${size === "xl" ? "cols-2" : ""}` }, topPay.map((i) => h("li", {}, h("span", {}, i.project), h("b", {}, usdCompact(dsTot(i)))))));
      },
    },
    news?.items?.length && {
      id: "news", opens: "news", size: "l", label: "City News",
      build: (size) => {
        const n = { s: 1, m: 2, l: 5, xl: 6 }[size];
        const items = news.items.slice(0, n);
        return h("div", { class: "tile-body" }, head("news", COLORS.news, "City News"),
          h("ul", { class: `news-mini ${size === "s" ? "solo" : ""} ${size === "xl" ? "cols-2" : ""}` }, items.map((it) => h("li", {},
            h("span", { class: "mini-date" }, it.date ? shortDate(new Date(`${it.date}T12:00`)) : ""),
            h("div", {}, h("span", { class: "news-mini-title" }, it.title),
              size === "xl" && it.snippet ? h("p", { class: "news-mini-snippet" }, it.snippet) : null)))));
      },
    },
    {
      id: "growth", opens: "growth", size: "m", label: "Taxable Property",
      build: (size) => {
        const rows = budget.tax_rate_history.filter((r) => r.assessed_value);
        const first = rows[0], last = rows.at(-1);
        const number = h("div", {}, big(usdCompact(last.assessed_value)), h("div", { class: "tile-delta up" }, `▲ ${Math.round((last.assessed_value / first.assessed_value) * 10) / 10}× since ${fy(first.fiscal_year)}`));
        const spark = h("div", { class: `tile-spark ${size === "s" ? "sm" : ""}` }, sparkline(rows.map((r) => r.assessed_value), t.series[2]));
        if (size === "s") return h("div", { class: "tile-body" }, head("growth", COLORS.growth, "Taxable Property"), number, spark);
        if (size === "m") return h("div", { class: "tile-body" }, head("growth", COLORS.growth, "Taxable Property"),
          h("div", { class: "tile-split" }, h("div", {}, number, h("div", { class: "tile-meta" }, property?.current ? `${property.current.area_sqmi.toFixed(0)} sq mi in Cabarrus County` : "Assessed value, whole city")), spark));
        const c = property?.current;
        return h("div", { class: "tile-body" }, head("growth", COLORS.growth, "Taxable Property"),
          h("div", { class: "tile-split" }, number, spark),
          c ? facts([["Land area (Cabarrus part)", `${c.area_sqmi.toFixed(1)} sq mi`], ["Tax parcels", num(c.parcels)], ["Median parcel value", usd(c.median_value)],
            ["Vacant parcels", `${num(c.vacant_parcels)} (${pct((100 * c.vacant_parcels) / c.parcels, 0)})`],
            size === "xl" && ["Buildings' share of value", pct((100 * c.building_value) / c.total_value, 0)], size === "xl" && ["County appraised value", usdCompact(c.total_value)]], size === "xl" ? "cols-2" : "") : null);
      },
    },
    zoning && {
      id: "land", opens: "land", size: "s", label: "Land Use",
      build: (size) => {
        const cats = [...zoning.categories].sort((a, b) => b.acres - a.acres);
        const n = size === "s" ? 3 : size === "m" ? 3 : 6;
        const parts = [...cats.slice(0, n).map((c, i) => ({ ...c, value: c.acres, color: t.series[i] })),
          { category: "Other", value: cats.slice(n).reduce((s, c) => s + c.acres, 0), pct: cats.slice(n).reduce((s, c) => s + c.pct, 0), color: t.mutedFill }].filter((p) => p.value > 0);
        const ring = h("div", { class: "ring-wrap" }, donut(parts, isBig(size) ? 150 : 104, isBig(size) ? 16 : 12),
          h("div", { class: "ring-label" }, h("b", {}, pct(cats[0].pct, 0)), h("span", {}, cats[0].category)));
        if (size === "s") return h("div", { class: "tile-body" }, head("land", COLORS.land, "Land Use"), ring);
        const leg = h("ul", { class: `ring-legend${isBig(size) ? " with-acres" : ""}` }, parts.map((p) => h("li", {}, h("i", { style: { background: p.color } }), h("span", {}, p.category),
          isBig(size) ? h("small", {}, `${num(Math.round(p.value))} ac`) : null, h("b", {}, pct(p.pct, 0)))));
        if (size === "m") return h("div", { class: "tile-body" }, head("land", COLORS.land, "Land Use"), h("div", { class: "tile-split ring-split" }, ring, leg));
        // Large / XL: acres per category, the biggest zoning districts, and (XL) a zoning map.
        const districts = h("div", {}, h("div", { class: "mini-head" }, "Largest zoning districts"),
          h("ul", { class: "ub-mini land-districts" }, zoning.districts.slice(0, 3).map((d) => h("li", {}, h("b", {}, d.code), h("span", {}, d.category), h("small", {}, `${num(d.acres)} ac`)))));
        const meta = h("div", { class: "tile-meta" }, `${num(zoning.total_acres)} zoned acres · Cabarrus County part of the city`);
        if (size === "l") return h("div", { class: "tile-body" }, head("land", COLORS.land, "Land Use"), h("div", { class: "tile-split ring-split" }, ring, leg), districts, meta);
        const colorOf = new Map(parts.map((p) => [p.category, p.color]));
        const map = data.zoningGeo ? zoningMap(data.zoningGeo, (cat) => colorOf.get(cat) || t.mutedFill, data.boundaries) : null;
        return h("div", { class: "tile-body" }, head("land", COLORS.land, "Land Use"),
          h("div", { class: "tile-split top land-xl" },
            h("div", {}, h("div", { class: "tile-split ring-split" }, ring, leg), districts, meta),
            map ? h("figure", { class: "land-map" }, map) : null));
      },
    },
    council && {
      id: "council", opens: "council", size: "m", label: "City Council",
      build: (size) => {
        const avatar = (m) => (m.photo ? h("img", { src: m.photo, alt: "" }) : h("span", { class: "avatar-fallback" }, m.name[0]));
        const mayor = council.members.find((m) => m.role === "Mayor");
        const email = h("a", { class: "tile-action", href: `mailto:${council.group_email}` }, size === "s" ? "Email all" : "Email all of Council");
        if (size === "s") return h("div", { class: "tile-body" }, head("council", COLORS.council, "City Council"),
          h("div", { class: "avatars" }, council.members.slice(0, 4).map(avatar)),
          h("div", { class: "tile-meta" }, `${council.members.length} members`), email);
        if (size === "m") {
          // Right side: the next Council meeting, and the two Council leaders.
          const next = meetings && parseM().find((m) => /council/i.test(`${m.category || ""} ${m.title}`));
          const leaders = council.members.filter((m) => m.role === "Mayor" || m.role === "Mayor Pro Tem");
          return h("div", { class: "tile-body" }, head("council", COLORS.council, "Your City Council"),
            h("div", { class: "council-m" },
              h("div", { class: "council-m-left" },
                h("div", { class: "avatars" }, council.members.map(avatar)),
                h("div", { class: "tile-meta" }, `${council.members.length} members · one email reaches them all`), email),
              h("div", { class: "council-m-right" },
                next ? h("div", { class: "council-next" },
                  h("div", { class: "date-block sm" }, h("span", {}, next._d.toLocaleDateString("en-US", { month: "short" })), h("b", {}, next._d.getDate())),
                  h("div", {},
                    h("div", { class: "mini-head" }, "Next Council meeting"),
                    h("div", { class: "council-next-when" }, `${next._d.toLocaleDateString("en-US", { weekday: "long" })} · ${next._d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`),
                    h("span", { class: `pill ${next.agenda ? "ok" : ""}` }, next.agenda ? "Agenda posted" : "No agenda yet"))) : null,
                h("ul", { class: "council-leaders" }, leaders.map((m) => h("li", {}, avatar(m),
                  h("div", {}, h("b", {}, m.name), h("span", {}, m.role)), ...contactLinks(m)))))));
        }
        // Large/XL: everyone, then the next Council meetings (agenda link once it's posted), then the group email.
        const upcomingCouncil = meetings ? parseM().filter((m) => /council/i.test(`${m.category || ""} ${m.title}`)).slice(0, size === "xl" ? 3 : 2) : [];
        const meetingRows = upcomingCouncil.length ? h("div", { class: "council-up" }, h("div", { class: "mini-head" }, "Next Council meetings"),
          h("ul", { class: "ub-mini council-up-list" }, upcomingCouncil.map((m) => h("li", {},
            h("b", {}, m._d.toLocaleDateString("en-US", { month: "short", day: "numeric" })),
            h("span", {}, `${m._d.toLocaleDateString("en-US", { weekday: "short" })} ${m._d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })} · ${m.title.replace(/^Kannapolis /, "")}`),
            m.agenda?.url ? h("a", { class: "council-agenda", href: m.agenda.url, target: "_blank", rel: "noopener" }, "Agenda ↗") : h("small", {}, "No agenda yet"))))) : null;
        return h("div", { class: "tile-body" }, head("council", COLORS.council, "Your City Council"),
          h("ul", { class: "people-list cols-2 council-list" }, council.members.map((m) => h("li", {}, avatar(m),
            h("div", {}, h("b", {}, m.name), h("span", {}, m.role)), h("span", { class: "contact-links" }, contactLinks(m))))),
          meetingRows,
          h("div", { class: "council-email-row" }, email, h("span", { class: "tile-meta" }, council.group_note)));
      },
    },
    org && {
      id: "org", opens: "org", size: "s", label: "City Staff",
      build: (size) => {
        const ppl = org.people.filter((p) => p.id !== "council" && !p.vacant);
        const mgr = ppl.find((p) => p.title === "City Manager");
        const person = (p) => h("div", { class: "person" }, p.photo ? h("img", { src: p.photo, alt: "" }) : null, h("div", {}, h("b", {}, p.name), h("span", {}, p.title)));
        if (size === "s") return h("div", { class: "tile-body" }, head("org", COLORS.org, "Who Runs the City"), mgr ? person(mgr) : null, h("div", { class: "tile-meta" }, `${ppl.length} leaders and departments`));
        const n = { m: 4, l: 10, xl: 15 }[size];
        const list = ppl.slice(0, n);
        return h("div", { class: "tile-body" }, head("org", COLORS.org, "Who Runs the City"),
          h("ul", { class: `people-list cols-2 org-list ${size === "xl" ? "cols-3" : ""}` }, list.map((p) => h("li", {},
            p.photo ? h("img", { src: p.photo, alt: "" }) : h("span", { class: "avatar-fallback" }, p.name[0]),
            h("div", {}, h("b", {}, p.name), h("span", {}, p.title)),
            h("span", { class: "contact-links" }, contactLinks(p))))),
          h("div", { class: "tile-meta" }, `${ppl.length} leaders in all`));
      },
    },
    {
      id: "about", opens: "about", size: "s", label: "About the Data",
      build: (size) => {
        const sources = budget.sources, n = Object.keys(sources).length;
        const fresh = datasets(data);
        const newest = fresh.reduce((x, y) => (y.date > x.date ? y : x), fresh[0]);
        const counts = h("ul", { class: "fmt-counts" }, formatCounts(sources).map(([f, c]) => h("li", {}, h("b", {}, c), ` ${f}`)));
        const top = [head("about", COLORS.about, "About the Data"),
          h("div", { class: "about-big" }, big(String(n)), h("span", {}, "official sources"))];
        const refreshed = h("div", { class: "tile-meta" }, newest ? `Data refreshed ${ago(newest.age).toLowerCase()} · ${fmtDate(newest.date)}` : "");
        if (size === "s") return h("div", { class: "tile-body" }, ...top, refreshed);
        if (size === "m") return h("div", { class: "tile-body" }, ...top, counts, refreshed);
        const freshList = (k) => h("ul", { class: "fresh-mini" }, fresh.slice(0, k).map((f) =>
          h("li", {}, statusDot(f.status), h("span", {}, f.name), h("small", {}, f.status === "manual" ? "parsed" : ago(f.age)))));
        if (size === "l") return h("div", { class: "tile-body" }, ...top, counts,
          h("div", { class: "mini-head" }, "Freshness"), freshList(6));
        return h("div", { class: "tile-body" }, ...top,
          h("div", { class: "about-xl" },
            h("div", {}, h("div", { class: "mini-head" }, "Sources by publisher"),
              h("ul", { class: "pub-list" }, byPublisher(sources).slice(0, 5).map(([pub, list]) => h("li", {},
                h("b", {}, pub), h("span", {}, list.map((x) => x.format).filter((v, i, arr) => arr.indexOf(v) === i).join(" · ")), h("small", {}, list.length))))),
            h("div", {}, h("div", { class: "mini-head" }, "Freshness"), freshList(8))));
      },
    },
  ].filter(Boolean);
}
