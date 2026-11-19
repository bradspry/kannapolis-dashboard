// Weather data layer: live National Weather Service data in the browser (refreshed every 15 min),
// falling back to the snapshot embedded by etl/build_weather.py. Both are normalized the same way.
const REFRESH_MS = 15 * 60 * 1000;
const TIMEOUT_MS = 9000;

const cToF = (c) => (c == null ? null : Math.round((c * 9) / 5 + 32));
const kmhToMph = (k) => (k == null ? null : Math.round(k / 1.609));
const COMPASS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
const compass = (deg) => (deg == null ? "" : COMPASS[Math.round(deg / 22.5) % 16]);

/** Emoji for an NWS short forecast. */
export function wxIcon(text = "", isDay = true) {
  const t = text.toLowerCase();
  if (/thunder|t-storm/.test(t)) return "⛈️";
  if (/snow|flurr|blizzard/.test(t)) return "🌨️";
  if (/sleet|freezing|ice/.test(t)) return "🌨️";
  if (/rain|shower|drizzle/.test(t)) return /chance|slight|isolated|scattered/.test(t) && isDay ? "🌦️" : "🌧️";
  if (/fog|haze|smoke|mist/.test(t)) return "🌫️";
  if (/wind|breezy|blustery/.test(t)) return "💨";
  if (/overcast|^cloudy|mostly cloudy/.test(t)) return /mostly/.test(t) ? (isDay ? "🌥️" : "☁️") : "☁️";
  if (/partly|mostly sunny|mostly clear/.test(t)) return isDay ? "⛅" : "🌙";
  if (/sunny|clear|fair/.test(t)) return isDay ? "☀️" : "🌙";
  return isDay ? "🌤️" : "🌙";
}

export function normalize(meta, raw, source) {
  const fc = raw.forecast || [];
  const hr = (raw.hourly || []).map((p) => ({
    time: new Date(p.startTime), temp: p.temperature, text: p.shortForecast, isDay: p.isDaytime,
    pop: p.probabilityOfPrecipitation?.value ?? 0, wind: p.windSpeed, windDir: p.windDirection,
    humidity: p.relativeHumidity?.value ?? null,
  }));
  const now = new Date();
  const upcoming = hr.filter((h) => h.time.getTime() + 3600e3 > now.getTime());
  const o = raw.observation;
  const obsAge = o ? (now - new Date(o.timestamp)) / 3600e3 : Infinity;
  const h0 = upcoming[0];
  const current = o && obsAge < 3 && o.temperature?.value != null
    ? {
      temp: cToF(o.temperature.value), text: o.textDescription || h0?.text || "",
      feels: cToF(o.heatIndex?.value ?? o.windChill?.value ?? o.temperature.value),
      humidity: o.relativeHumidity?.value != null ? Math.round(o.relativeHumidity.value) : h0?.humidity,
      wind: o.windSpeed?.value != null ? `${kmhToMph(o.windSpeed.value)} mph ${compass(o.windDirection?.value)}`.trim() : h0?.wind,
      time: new Date(o.timestamp), observed: true,
    }
    : h0 ? { temp: h0.temp, text: h0.text, feels: null, humidity: h0.humidity, wind: `${h0.wind} ${h0.windDir}`, time: h0.time, observed: false } : null;
  if (current) current.isDay = h0 ? h0.isDay : true;

  const periods = fc.map((p) => ({
    name: p.name, start: new Date(p.startTime), isDay: p.isDaytime, temp: p.temperature, text: p.shortForecast,
    detail: p.detailedForecast, pop: p.probabilityOfPrecipitation?.value ?? 0, wind: `${p.windSpeed} ${p.windDirection}`,
  })).filter((p) => new Date(p.start.getTime() + 12 * 3600e3) > now);
  // Pair day + following night into days (first entry may be a lone "Tonight").
  const days = [];
  for (let i = 0; i < periods.length; i++) {
    const p = periods[i];
    if (p.isDay) {
      const night = periods[i + 1] && !periods[i + 1].isDay ? periods[i + 1] : null;
      days.push({ name: p.name, day: p, night, hi: p.temp, lo: night?.temp ?? null, pop: Math.max(p.pop, night?.pop ?? 0) });
      if (night) i++;
    } else {
      days.push({ name: p.name, day: null, night: p, hi: null, lo: p.temp, pop: p.pop });
    }
  }
  const alerts = (raw.alerts || []).map((a) => ({
    event: a.event, headline: a.headline, severity: a.severity, urgency: a.urgency,
    ends: a.ends || a.expires ? new Date(a.ends || a.expires) : null, description: a.description, instruction: a.instruction,
    sender: a.senderName,
  }));
  return { source, fetched: source === "live" ? now : null, meta, current, hourly: upcoming, days, periods, alerts };
}

async function getJSON(url) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, { headers: { Accept: "application/geo+json" }, signal: ctl.signal, cache: "no-store" });
    if (!r.ok) throw new Error(`${r.status}`);
    return await r.json();
  } finally { clearTimeout(timer); }
}

async function fetchLive(meta) {
  const [fc, hr, al, ob] = await Promise.allSettled([meta.urls.forecast, meta.urls.hourly, meta.urls.alerts, meta.urls.observation].map(getJSON));
  if (fc.status !== "fulfilled" || hr.status !== "fulfilled") throw new Error("forecast unavailable");
  return {
    forecast: fc.value.properties.periods,
    hourly: hr.value.properties.periods.slice(0, 48),
    alerts: al.status === "fulfilled" ? (al.value.features || []).map((f) => f.properties) : [],
    observation: ob.status === "fulfilled" ? ob.value.properties : null,
  };
}

let state = null;
const listeners = new Set();
export const weather = () => state;
export function onWeather(fn) { listeners.add(fn); }

/** Show the snapshot right away, then switch to live data and keep it fresh. */
export function startWeather(meta) {
  if (!meta) return;
  state = normalize(meta, meta.snapshot, "snapshot");
  const refresh = async () => {
    if (document.hidden) return;
    try {
      state = normalize(meta, await fetchLive(meta), "live");
      listeners.forEach((fn) => fn(state));
    } catch (e) {
      console.warn("Live weather unavailable; showing the saved forecast.", e.message);
    }
  };
  refresh();
  setInterval(refresh, REFRESH_MS);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && state?.fetched && Date.now() - state.fetched > REFRESH_MS) refresh();
  });
}
