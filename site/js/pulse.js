// "Right now": which widgets matter at this moment, and why. Each rule looks at a widget's own data and the
// clock and returns { score, reason } (0–100; nothing = not timely). os.js mixes these with how often this
// visitor opens each widget, keeps one or two per subject, and puts the top few above Home's saved layout.
// Rules read only data the page already has, so a reason is always something the widget itself shows.
import { weather } from "./weather.js";

const ymd = (d) => d.toLocaleDateString("en-CA"); // local YYYY-MM-DD
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const clock = (hhmm) => {
  if (!hhmm) return "";
  const [h, m] = hhmm.split(":").map(Number);
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h < 12 ? "AM" : "PM"}`;
};
const daysAgo = (iso, now) => (now - new Date(`${iso.slice(0, 10)}T12:00`)) / 864e5;
const clip = (s, n = 48) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
const isWeekend = (d) => [0, 5, 6].includes(d.getDay()) && !(d.getDay() === 5 && d.getHours() < 15); // Fri evening – Sun

/** A shop right now: its dated event (a Black Friday sale: top on the day, high the day before, a nudge that week),
 *  a holiday closing today (so nobody drives to a locked door), longer hours than usual today, and a small edge
 *  for being open now. The highest one wins. */
const shopPulse = (s, now) => {
  if (!s) return null;
  const name = s.short || s.name, today = ymd(now), found = [];
  const e = s.event;
  if (e && today <= e.date) {
    const days = Math.round((new Date(`${e.date}T12:00`) - new Date(`${today}T12:00`)) / 864e5);
    if (days === 0) found.push({ score: 70, reason: `${name}: ${clip(e.title, 40)} today` });
    else if (days === 1) found.push({ score: 50, reason: `${name}: ${clip(e.title, 40)} tomorrow` });
    else if (days < 7) found.push({ score: 20, reason: `${name}: ${clip(e.title, 40)} ${new Date(`${e.date}T12:00`).toLocaleDateString("en-US", { weekday: "long" })}` });
  }
  const weekly = (s.hours || []).find((r) => r.days.includes(now.getDay())) || null;
  const sp = (s.special || []).find((x) => x.date === today);
  const mins = (t) => { const [hh, mm] = t.split(":").map(Number); return hh * 60 + mm; };
  if (sp?.closed && weekly) found.push({ score: 55, reason: `${name} closed today${sp.label ? ` (${sp.label})` : ""}` });
  else if (sp && !sp.closed) {
    // Different hours today: before opening, say if it opens early; once open, say if it stays late or closes early.
    const t = (x) => new Date(2000, 0, 1, ...x.split(":").map(Number)).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).replace(":00", "");
    const at = 60 * now.getHours() + now.getMinutes();
    if (!weekly) { if (at < mins(sp.close)) found.push({ score: 35, reason: `${name} open today, ${t(sp.open)}–${t(sp.close)}` }); }
    else if (at < mins(sp.open)) { if (mins(sp.open) < mins(weekly.open)) found.push({ score: 35, reason: `${name} opens early today, at ${t(sp.open)}` }); }
    else if (at < mins(sp.close)) {
      if (mins(sp.close) < mins(weekly.close)) found.push({ score: 40, reason: `${name} closes early today, at ${t(sp.close)}` });
      else if (mins(sp.close) > mins(weekly.close)) found.push({ score: 35, reason: `${name} open late today, until ${t(sp.close)}` });
    }
  }
  const hrs = sp ? (sp.closed ? null : sp) : weekly, nowMin = 60 * now.getHours() + now.getMinutes();
  if (hrs && nowMin >= mins(hrs.open) && nowMin < mins(hrs.close)) found.push({ score: 12, reason: `${name} is open` }); // ranks open shops first; under 30, so no headline
  return found.sort((a, b) => b.score - a.score)[0] || null;
};

const RULES = {
  ellestique: (D, now) => shopPulse(D.ellestique, now),
  sweetest: (D, now) => shopPulse(D.sweetest, now),
  cardiacs: (D, now) => shopPulse(D.cardiacs, now),
  weather(D, now) {
    const w = weather();
    if (w?.alerts?.length) {
      const a = w.alerts[0], until = a.ends ? ` until ${a.ends.toLocaleString("en-US", { weekday: "short", hour: "numeric", ...(a.ends.getMinutes() ? { minute: "2-digit" } : {}) })}` : "";
      return { score: 95, reason: `${a.event || a.headline}${until}` };
    }
    const d = w?.days?.[0];
    if (d?.pop >= 60) return { score: 62, reason: `Rain likely today (${d.pop}%)` };
    if (d?.hi >= 95) return { score: 58, reason: `Hot today: high of ${d.hi}°` };
    if (d?.lo != null && d.lo <= 25) return { score: 55, reason: `Hard freeze: low of ${d.lo}°` };
    const h = now.getHours();
    return { score: h >= 5 && h < 10 ? 40 : 28, reason: d?.hi != null ? `Today: high of ${d.hi}°` : "Today's forecast" };
  },
  waste(D, now) {
    const ws = D.waste; if (!ws) return null;
    const today = ymd(now), tom = ymd(addDays(now, 1));
    const delay = (ws.delay_holidays || []).find((x) => x.date === today || x.date === tom);
    if (delay) return { score: 92, reason: `${delay.name} ${delay.date === today ? "today" : "tomorrow"}: pickup runs a day late` };
    const yard = (ws.yard_holidays || []).find((x) => x.date === today || x.date === tom);
    if (yard) return { score: 60, reason: `No yard-waste pickup ${yard.date === today ? "today" : "tomorrow"} (${yard.name})` };
    const leaf = ws.leaf_season;
    if (leaf && today >= leaf.start && today <= leaf.end) return { score: 24, reason: "Loose-leaf vacuum season" };
    return null;
  },
  parade(D, now) {
    // The Christmas Parade: up through the week, high the day before, at the top on the day (West Avenue closes at 6 AM).
    const p = D.parade;
    if (!p || ymd(now) > p.date) return null;
    const days = Math.round((new Date(`${p.date}T12:00`) - new Date(`${ymd(now)}T12:00`)) / 864e5);
    const [hh, mm] = p.time.split(":").map(Number), start = 60 * hh + mm, mins = 60 * now.getHours() + now.getMinutes();
    const t = new Date(2000, 0, 1, hh, mm).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).replace(":00", "");
    if (days === 0 && mins < start + 150) return { score: 88, reason: mins >= start ? "Christmas Parade on now" : `Christmas Parade tonight at ${t}: West Ave closed` };
    if (days === 1) return { score: 62, reason: `Christmas Parade tomorrow at ${t}` };
    if (days > 1 && days < 7) return { score: 40, reason: `Christmas Parade ${new Date(`${p.date}T12:00`).toLocaleDateString("en-US", { weekday: "long" })} at ${t}` };
    return null;
  },
  events(D, now) {
    const list = (D.events?.events || []).filter((e) => !e.canceled);
    const today = ymd(now), tom = ymd(addDays(now, 1));
    const on = (e, day) => (e.dates || [e.start?.slice(0, 10)]).includes(day);
    const mins = (hhmm) => { const [h, m] = hhmm.split(":").map(Number); return 60 * h + m; };
    const nowMin = 60 * now.getHours() + now.getMinutes();
    const t = list.find((e) => on(e, today) && (!e.time || nowMin < mins(e.time) + (e.duration_min || 60))); // not over yet
    if (t) return { score: isWeekend(now) ? 80 : 70, reason: `${t.time >= "15:00" ? "Tonight" : "Today"}: ${clip(t.title)}` };
    const m = list.find((e) => on(e, tom));
    if (m) return { score: 45, reason: `Tomorrow: ${clip(m.title)}` };
    return null;
  },
  meetings(D, now) {
    const today = ymd(now), tom = ymd(addDays(now, 1));
    const m = (D.meetings?.meetings || []).filter((x) => !x.canceled && x.start).sort((a, b) => a.start.localeCompare(b.start))
      .find((x) => x.start.slice(0, 10) >= today && x.start.slice(0, 10) <= tom);
    if (!m) return null;
    const when = m.start.slice(0, 10) === today ? "today" : "tomorrow";
    return { score: when === "today" ? 75 : 50, reason: `${clip(m.title, 36)} ${when} at ${clock(m.start.slice(11, 16))}` };
  },
  videos(D, now) {
    const v = D.videos?.videos?.[0];
    if (!v || daysAgo(v.posted || v.date, now) > 2) return null;
    return { score: 48, reason: `New video: ${clip(v.title, 42)}` };
  },
  news(D, now) {
    const n = D.news?.items?.[0];
    if (!n || daysAgo(n.date, now) > 3) return null;
    return { score: /holiday|closed|closure|delay|boil|outage|road/i.test(n.title) ? 58 : 38, reason: clip(n.title, 52) };
  },
  baseball(D, now) {
    const today = ymd(now);
    const g = (D.baseball?.games || []).find((x) => x.date >= today);
    if (!g) return null;
    const team = D.baseball.teams?.[g.opp] || g.opp, days = Math.round(daysAgo(g.date, now) * -1);
    if (g.date === today) return { score: 82, reason: `Game today ${g.home ? "at home" : "away"} vs ${team}${g.time ? `, ${clock(g.time)}` : ""}` };
    if (days <= 3) return { score: 40, reason: `Next game ${days === 1 ? "tomorrow" : `in ${days} days`} vs ${team}` };
    return null;
  },
  swanee(D, now) {
    const today = ymd(now);
    const e = (D.swanee?.events || []).filter((x) => x.start).sort((a, b) => a.start.localeCompare(b.start)).find((x) => x.start.slice(0, 10) >= today);
    if (!e) return null;
    const d = e.start.slice(0, 10);
    if (d === today) return { score: 66, reason: `Tonight at the Swanee: ${clip(e.title, 36)}` };
    if (d <= ymd(addDays(now, 3))) return { score: 34, reason: `Coming up: ${clip(e.title, 40)}` };
    return null;
  },
  library(D, now) {
    const today = ymd(now), here = new Set((D.library?.kannapolis_branches || []).map((b) => b.code || b));
    const ev = (D.library?.events || []).filter((e) => !e.closure && e.start?.slice(0, 10) === today && (!here.size || here.has(e.branch)));
    const closed = (D.library?.events || []).find((e) => e.closure && e.start?.slice(0, 10) === today && (!here.size || here.has(e.branch)));
    if (closed) return { score: 55, reason: `${closed.venue || "Library"} closed today` };
    return ev.length ? { score: 34, reason: `${ev.length} event${ev.length > 1 ? "s" : ""} at the Kannapolis library today` } : null;
  },
  drought(D, now) {
    const c = D.drought?.city; if (!c?.level) return null;
    const fresh = c.effective && daysAgo(c.effective, now) <= 7;
    return { score: (fresh ? 60 : 18) + 6 * c.level, reason: `${fresh ? "New: " : ""}Stage ${c.level}, ${c.name}` };
  },
  gas(D, now) {
    const g = D.gas?.grades?.regular, s = g?.stations?.[0]; if (!s) return null;
    const t = g.trend;
    if (t && Math.abs(t.delta) >= 0.05) return { score: 46, reason: `Gas ${t.delta < 0 ? "down" : "up"} ${Math.round(Math.abs(t.delta) * 100)}¢ this week` };
    if (now.getDay() === 5 || now.getDay() === 4) return { score: 42, reason: `Fill-up: $${s.price.toFixed(2)} at ${s.name}` };
    return { score: 18, reason: `Cheapest: $${s.price.toFixed(2)} at ${s.name}` };
  },
  stocks(D, now) {
    const p = D.stocks?.day_pct; if (p == null || [0, 6].includes(now.getDay())) return null;
    return Math.abs(p) >= 2 ? { score: 45, reason: `KANDEX ${p > 0 ? "up" : "down"} ${Math.abs(p).toFixed(1)}% on the day` } : null;
  },
  train(D, now) {
    const hm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const later = new Date(now.getTime() + 2 * 3600e3);
    const end = `${String(later.getHours()).padStart(2, "0")}:${String(later.getMinutes()).padStart(2, "0")}`;
    const next = (D.train?.trains || []).filter((t) => t.time > hm && (end > hm ? t.time <= end : true)).sort((a, b) => a.time.localeCompare(b.time))[0];
    return next ? { score: 36, reason: `Next train ${clock(next.time)} to ${next.to}` } : null;
  },
  police(D, now) {
    const n = (D.police?.notices || []).find((x) => !x.until || x.until >= ymd(now));
    return n ? { score: 34, reason: clip(n.title, 52) } : null;
  },
  incidents(D, now) {
    // DriveNC, checked every 15 minutes: a crash or closure around Kannapolis right now leads the Smart tabs.
    const inc = D.incidents;
    if (!inc?.fetched || now - new Date(inc.fetched) > 2 * 3600e3) return null; // stale: say nothing
    const on = (inc.events || []).filter((e) => (!e.start || new Date(e.start) <= now) && (!e.end || new Date(e.end) >= now));
    const where = (e) => [e.road, { Northbound: "NB", Southbound: "SB", Eastbound: "EB", Westbound: "WB" }[e.direction]].filter(Boolean).join(" ") || "near Kannapolis";
    const full = on.find((e) => e.full_closure && e.kind !== "roadwork");
    if (full) return { score: 90, reason: `${where(full)}: all lanes closed` };
    const crash = on.find((e) => e.kind === "incident");
    if (crash) return { score: 80, reason: `Incident on ${where(crash)}` };
    const closed = on.find((e) => e.kind === "closure");
    if (closed) return { score: 64, reason: `Road closure: ${where(closed)}` };
    const work = on.find((e) => e.kind === "roadwork");
    if (work) return { score: 28, reason: `Roadwork on ${where(work)}` };
    return null;
  },
  ktown(D, now) {
    const e = D.ktown?.episodes?.[0];
    return e && daysAgo(e.published, now) <= 4 ? { score: 38, reason: `New episode: ${clip(e.title, 40)}` } : null;
  },
  parks(D, now) {
    const hol = D.parks?.holiday, wx = (hol?.weather_closed || []).find((c) => c.date === ymd(now));
    if (wx) return { score: 76, reason: `Celebration of Lights closed tonight (${wx.why})` };
    if (!isWeekend(now)) return null;
    const d = weather()?.days?.[0];
    return d?.hi >= 55 && d.hi <= 88 && (d.pop ?? 0) < 30 ? { score: 44, reason: `Good park weather: ${d.hi}° and dry` } : null;
  },
  whataburger(D, now) {
    const h = now.getHours();
    return h >= 11 && h < 14 ? { score: 22, reason: "Lunchtime" } : null;
  },
  editions(D, now) {
    const h = now.getHours();
    return h >= 7 && h < 10 ? { score: 20, reason: "Coffee time downtown" } : null;
  },
};

/** Everyday usefulness, before anything timely: what a Kannapolis resident reaches for on an ordinary day.
 *  Home's Smart arrangement adds the timely score, how often this browser opens the widget, and its place
 *  in the saved layout. Widgets not listed count 10. */
export const BASE = {
  weather: 34, waste: 30, events: 30, news: 26, meetings: 22, train: 20, gas: 22, utility: 20, police: 18, fire: 14,
  parks: 18, library: 18, gem: 20, swanee: 16, parade: 15, drought: 16, water: 14, council: 16, videos: 14, ktown: 12, baseball: 14,
  editions: 14, whataburger: 14, made: 10, stocks: 12, rider: 12, shuttle: 9, paratransit: 13, flights: 12, homeless: 10,
  roads: 8, incidents: 14, ellestique: 12, sweetest: 10, cardiacs: 10, people: 12, growth: 10, budget: 12, "debt-service": 6, land: 8, org: 10, "g-tax-rate": 8, "g-debt-policy": 6,
  "g-debt-limit": 6, "g-owners": 6, about: 4, "school-bus": 6,
};

/** Smart mode's stories, one per tab that has one: chapters in reading order. The chapter holding the most
 *  timely widget leads; the rest keep this order. A tab's Smart view shows every widget in its story plus any
 *  you added to the tab; Mine shows exactly the tab's saved layout. A chapter's `big` widgets always get a large
 *  slot (a full-width tile first on a phone), whatever their score; its `xl` widgets take the full width. A
 *  `last` chapter always stays at the bottom, even when something in it is timely. Employer widgets (job-*) join a "work"
 *  chapter if the story has one; anything unlisted goes at the end. */
export const STORIES = {
  home: [
    { id: "home", name: "At Home", blurb: "Weather, trash, water and bills", ids: ["weather", "waste", "utility", "drought", "water"] },
    { id: "around", name: "Getting Around", blurb: "Traffic, trains, buses, gas and roads", ids: ["incidents", "train", "gas", "rider", "paratransit", "shuttle", "flights", "roads"] },
    { id: "out", name: "Out & About", blurb: "Things to do", ids: ["events", "parade", "gem", "swanee", "baseball", "parks", "library"] },
    { id: "local", name: "Local Flavor", blurb: "Eat, drink and shop local", ids: ["editions", "whataburger", "made", "ellestique", "sweetest", "cardiacs"] },
    { id: "hall", name: "City Hall", blurb: "News, meetings and decisions", ids: ["news", "meetings", "council", "videos", "org", "people", "budget",
      "debt-service", "growth", "land", "g-tax-rate", "g-debt-policy", "g-debt-limit", "g-owners"], big: ["council"], small: ["videos"] },
    { id: "safety", name: "Safety", blurb: "Police and fire", ids: ["police", "fire"] },
    { id: "community", name: "Community", blurb: "Neighbors, schools and local voices", ids: ["ktown", "homeless"] },
    { id: "work", name: "Work & Money", blurb: "Jobs and local companies", ids: ["stocks", "school-bus"] },
    { id: "site", name: "About This Site", blurb: "Where every number comes from", ids: ["about"], last: true, xl: ["about"] },
  ],
  // City: what the City of Kannapolis does for you, from the curb to the budget. Every widget here is powered
  // at least in part by City data (sources.csv), plus the weather and community context the City tab carries.
  city: [
    { id: "services", name: "City Services", blurb: "Trash, water, bills and the weather", ids: ["waste", "utility", "drought", "water", "weather"] },
    { id: "safety", name: "Public Safety", blurb: "Police and fire", ids: ["police", "fire"] },
    { id: "hall", name: "City Hall", blurb: "News, meetings, your council and City jobs", ids: ["news", "meetings", "council", "videos", "org", "job-city"], big: ["council"], small: ["videos"] },
    { id: "downtown", name: "Downtown & Parks", blurb: "City-run events, parks, theaters and the shuttle", ids: ["events", "parade", "parks", "gem", "swanee", "shuttle"] },
    { id: "money", name: "Budget & Taxes", blurb: "Where the money comes from and goes", ids: ["budget", "debt-service", "g-tax-rate", "g-debt-policy", "g-debt-limit"] },
    { id: "growth", name: "People & Growth", blurb: "Who lives here and how the city is changing", ids: ["people", "growth", "land", "g-owners"] },
    { id: "community", name: "Community", blurb: "Neighbors in need and the data behind this site", ids: ["homeless", "about"] },
  ],
  // Entertainment: a night or a weekend out, from what's on to where to eat after.
  fun: [
    { id: "shows", name: "Shows & Events", blurb: "Movies, live shows and what's on around town", ids: ["events", "parade", "gem", "swanee"] },
    { id: "outside", name: "Get Outside", blurb: "Parks, trails and Cannon Ballers games", ids: ["parks", "baseball"] },
    { id: "eat", name: "Eat & Drink", blurb: "Burgers, coffee and local beer", ids: ["whataburger", "editions", "made"] },
    { id: "read", name: "Read, Watch & Listen", blurb: "The library and a local podcast", ids: ["library", "ktown"] },
  ],
  // Shopping: local shops, downtown first, then around the area.
  shopping: [
    { id: "downtown", name: "Downtown on West Avenue", blurb: "Boutiques and collectibles a few doors apart", ids: ["ellestique", "cardiacs"], xl: ["ellestique", "cardiacs"] },
    { id: "around", name: "Around the Area", blurb: "Local shops a short drive away", ids: ["sweetest"], xl: ["sweetest"] },
  ],
  // Transportation: from your own street outward, to the next town and the next state.
  transportation: [
    { id: "driving", name: "Driving", blurb: "Crashes and roadwork, gas prices and who keeps up the roads", ids: ["incidents", "gas", "roads"] },
    { id: "bus", name: "Buses & Shuttles", blurb: "Rider buses, door-to-door rides and the downtown shuttle", ids: ["rider", "paratransit", "shuttle"] },
    { id: "far", name: "Trains & Planes", blurb: "Amtrak from Kannapolis and flights from Concord", ids: ["train", "flights"], big: ["flights"] },
  ],
};

/** Jobs' story, built from the employers in jobs.json: one chapter per kind of employer, in this order. Industry
 *  also carries the KANDEX (the area's publicly traded employers). School Bus Drivers stays pinned top-right. */
const JOB_CHAPTERS = [
  { id: "public", name: "Public Service", blurb: "City and county government", sectors: ["government"] },
  { id: "schools", name: "Schools", blurb: "Teachers, staff and drivers in three districts", sectors: ["schools"] },
  { id: "health", name: "Health Care", blurb: "Hospitals, public health and behavioral care", sectors: ["health"] },
  { id: "colleges", name: "Colleges & Universities", blurb: "Community college and the UNC System", sectors: ["colleges"] },
  { id: "industry", name: "Industry", blurb: "Plants, warehouses and the KANDEX", sectors: ["manufacturing", "distribution"], extra: ["stocks"] },
  { id: "retail", name: "Retail & More", blurb: "Stores, the Speedway and more", sectors: ["retail", "sports", "other"] },
];
export function jobsStory(jobs) {
  const emps = jobs?.employers || [];
  return JOB_CHAPTERS.map(({ sectors, extra = [], ...c }) => ({ ...c, ids: [...emps.filter((e) => sectors.includes(e.sector)).map((e) => `job-${e.slug}`), ...extra, ...(c.id === "schools" ? ["school-bus"] : [])] }));
}

/** { tileId: { score, reason } } for every widget with something timely. */
export function pulses(D, now = new Date()) {
  const out = {};
  for (const [id, rule] of Object.entries(RULES)) {
    try { const r = rule(D, now); if (r?.score > 0 && r.reason) out[id] = r; } catch (e) { console.warn(`pulse ${id}`, e); }
  }
  // Employers: how much they're hiring, plus openings first seen in the last week (first_seen, from the weekly
  // harvest). New openings matter more than a big standing count.
  for (const e of D.jobs?.employers || []) {
    const n = e.jobs?.length || 0;
    const fresh = (e.jobs || []).filter((j) => j.first_seen && daysAgo(j.first_seen, now) <= 7).length;
    out[`job-${e.slug}`] = fresh
      ? { score: 30 + 10 * Math.log10(1 + n) + 14 * Math.log2(1 + fresh), reason: `${fresh} new opening${fresh > 1 ? "s" : ""} at ${e.name} this week` }
      : { score: 10 + 12 * Math.log10(1 + n), reason: `${n} openings at ${e.name}` };
  }
  return out;
}
