// Parks & Recreation for residents: find a park by what you want to do, reserve a shelter,
// sign up for programs, greenways, seasonal attractions, rules and ways to get involved.
// "Nearest park" uses the device's location only on the device; it is never sent anywhere.
import { h, contactButtons } from "../ui.js";
import { makeMap, maplibregl } from "../maps.js";

const tel = (n) => `tel:${n.replace(/[^0-9]/g, "")}`;
const directions = (p) => (p.lat ? `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lon}`
  : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${p.address}, Kannapolis, NC`)}`);
const ext = (url) => (/^(mailto|tel):/.test(url) ? {} : { target: "_blank", rel: "noopener" });
const arrow = (url) => (/^(mailto|tel):/.test(url) ? "" : " ↗");

function miles(a, b) {
  const R = 3958.8, r = (d) => (d * Math.PI) / 180;
  const x = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lon - a.lon) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

const localISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const shortDate = (iso) => new Date(`${iso}T12:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
/** Tonight's hours from {"sun-thu": …, "fri-sat": …}. */
const hoursFor = (hours, d) => (hours ? ([5, 6].includes(d.getDay()) ? hours["fri-sat"] : hours["sun-thu"]) : null);

/** Seasonal attractions can have several seasons (e.g. summer, then the Celebration of Lights). */
export function seasonStatus(s, now = new Date()) {
  const d = localISO(now);
  const cur = s.seasons.find((x) => x.start <= d && d <= x.end);
  if (cur) {
    if ((cur.closed || []).includes(d)) return { open: false, label: "Closed today (holiday)", season: cur };
    const hrs = hoursFor(cur.hours, now);
    return { open: true, label: hrs ? `Open tonight ${hrs}` : "Open this season", season: cur };
  }
  const next = s.seasons.filter((x) => x.start > d).sort((a, b) => a.start.localeCompare(b.start))[0];
  if (next) return { open: false, label: `Next opens ${shortDate(next.start)}`, season: next };
  return { open: false, label: "Closed for the season", season: s.seasons.at(-1) };
}

/** The holiday event: shown from show_from through the end date. */
export function holidayStatus(hol, now = new Date()) {
  const d = localISO(now);
  if (!hol || d < hol.show_from || d > hol.end) return null;
  if (d < hol.start) return { live: false, label: `Starts ${shortDate(hol.start)}` };
  if (hol.closed.includes(d)) return { live: true, open: false, label: "Closed today (holiday)" };
  return { live: true, open: true, label: `Open tonight ${hoursFor(hol.hours, now)}` };
}

export const upcomingHolidayEvents = (hol, now = new Date()) => (hol?.events || []).filter((e) => e.date >= localISO(now));

/** Primary actions: reserve a shelter, sign up for programs. */
export function parkButtons(pr, { compact = false, primaryOnly = false } = {}) {
  return h("div", { class: `ub-pay${compact ? " compact" : ""}${primaryOnly ? " single" : ""}` },
    h("a", { class: "ub-btn primary", href: pr.actions.reserve, target: "_blank", rel: "noopener" },
      h("span", { "aria-hidden": "true" }, "⛺"), h("span", {}, h("b", {}, "Reserve a shelter"), compact ? null : h("small", {}, "Half-day online; full-day by phone"))),
    primaryOnly ? null : h("a", { class: "ub-btn", href: pr.actions.register, target: "_blank", rel: "noopener" },
      h("span", { "aria-hidden": "true" }, "⚽"), h("span", {}, h("b", {}, "Sign up"), h("small", {}, compact ? "Sports & programs" : "Youth sports, classes & camps"))));
}

const fmtT = (t) => { if (!t) return ""; const [hh, mm] = t.split(":").map(Number); return new Date(2000, 0, 1, hh, mm).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }); };

function holidaySection(hol) {
  const st = holidayStatus(hol);
  if (!st) return null;
  const evs = upcomingHolidayEvents(hol);
  return h("section", { class: "card pk-holiday" },
    h("div", { class: "pk-hol-head" },
      h("span", { class: "pk-hol-icon", "aria-hidden": "true" }, "🎄"),
      h("div", {}, h("h3", {}, hol.title), h("p", { class: "sub" }, `Celebration of Lights · ${hol.place} · ${shortDate(hol.start)}–${shortDate(hol.end)}`)),
      h("span", { class: `pk-status big ${st.open ? "open" : ""}` }, st.open ? "● " : "○ ", st.label)),
    h("p", {}, hol.summary),
    h("ul", { class: "pk-rules" },
      h("li", {}, hol.free),
      h("li", {}, `Hours: ${hol.hours["sun-thu"]} Sunday–Thursday; ${hol.hours["fri-sat"]} Friday & Saturday. Closed Thanksgiving, Christmas Eve and Christmas Day.`),
      h("li", {}, hol.tickets.note),
      h("li", {}, hol.weather)),
    h("div", { class: "pk-links" },
      h("a", { class: "btn-primary", href: hol.tickets.url, target: "_blank", rel: "noopener" }, `🚂 ${hol.tickets.label} ↗`),
      ...hol.maps.map((m) => h("a", { href: m.url, target: "_blank", rel: "noopener" }, `${m.title} ↗`))),
    evs.length ? h("div", {}, h("div", { class: "mini-head" }, "Coming up"),
      h("ul", { class: "pk-hol-events", role: "list" }, evs.map((e) => h("li", {},
        h("span", { class: "mini-date" }, `${shortDate(e.date)}${e.time ? ` · ${fmtT(e.time)}` : ""}`),
        h("span", {}, h("b", {}, e.title), e.where ? ` · ${e.where}` : "", e.note ? h("small", {}, e.note) : null),
        e.url ? h("a", { href: e.url, target: "_blank", rel: "noopener" }, `${e.action || "More"} ↗`) : h("span", {}))))) : null);
}

export const allTags = (pr) => [...new Set(pr.parks.flatMap((p) => p.tags))];

let tagFilter = null;

export function renderParks(pr) {
  const root = document.getElementById("parks-body");
  const tags = allTags(pr);
  const chips = h("div", { class: "chips", role: "group", "aria-label": "What do you want to do?" });
  const list = h("div", { class: "pk-list" });
  const near = h("p", { class: "kfd-nearest-out", role: "status", "aria-live": "polite" });
  const mapBox = h("div", { class: "map kfd-map", id: "pk-map", role: "img", "aria-label": "Map of Kannapolis parks" });
  let markers = [];

  const draw = () => {
    chips.replaceChildren(...[null, ...tags].map((tg) => h("button", { class: "chip", type: "button", "aria-pressed": String(tagFilter === tg),
      onclick: () => { tagFilter = tg; draw(); } }, tg ?? "All parks")));
    const shown = pr.parks.filter((p) => !tagFilter || p.tags.includes(tagFilter));
    list.replaceChildren(...shown.map((p) => h("article", { class: "card pk-park" },
      h("div", { class: "pk-head" }, h("h4", {}, p.name), p.size ? h("span", { class: "pk-size" }, p.size) : null),
      h("div", { class: "pk-meta" }, `${p.address} · ${p.hours}`),
      h("ul", { class: "pk-tags", "aria-label": "Amenities" }, p.tags.map((t) => h("li", { class: t === tagFilter ? "hit" : null }, t))),
      h("p", {}, p.about),
      h("div", { class: "pk-links" },
        h("a", { href: directions(p), target: "_blank", rel: "noopener" }, "Directions ↗"),
        p.shelters ? h("a", { href: pr.actions.reserve, target: "_blank", rel: "noopener" }, "Reserve a shelter ↗") : null,
        p.map ? h("a", { href: p.map, target: "_blank", rel: "noopener" }, p.shelters ? "Shelter map ↗" : "Map ↗") : null,
        p.link ? h("a", { href: p.link, target: "_blank", rel: "noopener" }, `${p.link_label || "More"} ↗`) : null))));
    markers.forEach((m) => m.getElement().classList.toggle("dim", !!tagFilter && !shown.some((p) => p.name === m.getElement().title)));
  };

  const findBtn = h("button", { class: "btn-primary", type: "button" }, "📍 Find my nearest park");
  findBtn.addEventListener("click", () => {
    if (!navigator.geolocation) { near.textContent = "Your browser can't share its location."; return; }
    near.textContent = "Finding you…";
    navigator.geolocation.getCurrentPosition((pos) => {
      const me = { lat: pos.coords.latitude, lon: pos.coords.longitude };
      const pool = pr.parks.filter((p) => p.lat && (!tagFilter || p.tags.includes(tagFilter)));
      const best = pool.map((p) => ({ ...p, mi: miles(me, p) })).sort((a, b) => a.mi - b.mi)[0];
      near.replaceChildren(h("b", {}, best.name), `${tagFilter ? ` (has ${tagFilter.toLowerCase()})` : ""} is about ${best.mi.toFixed(1)} miles away, at ${best.address}. `,
        h("a", { href: directions(best), target: "_blank", rel: "noopener" }, "Directions ↗"));
    }, () => { near.textContent = "Location not available. Check that location is allowed for this page."; }, { timeout: 10000, maximumAge: 600000 });
  });

  const card = (x) => h("div", { class: "card ub-way" }, h("b", {}, x.title), h("p", {}, x.text),
    h("a", { href: x.url, ...ext(x.url) }, x.action, arrow(x.url)));

  root.replaceChildren(
    parkButtons(pr),
    h("div", { class: "kpd-contact card" },
      h("div", {}, h("b", {}, "Parks office"), " · ", h("a", { href: tel(pr.phone) }, pr.phone), " · ", h("a", { href: `mailto:${pr.email}` }, pr.email),
        h("p", { class: "muted" }, `${pr.office_hours}, for reservations and registration payments. Offices: ${pr.offices.join(" and ")}.`)),
      h("div", {}, h("b", {}, "Game cancelled for weather?"), " ", h("a", { href: tel(pr.weather_hotline) }, pr.weather_hotline),
        h("p", { class: "muted" }, "Inclement weather hotline: updated after 4 p.m. on weekdays and after 8 a.m. on Saturdays."))),

    holidaySection(pr.holiday),

    h("h3", { class: "about-h" }, "Find a park"),
    h("p", { class: "about-sub" }, "What do you want to do? Pick one to see the parks that have it."),
    chips,
    h("div", { class: "card pk-top" },
      h("div", { class: "pk-find" }, findBtn, h("span", { class: "tile-meta" }, "Your location stays on your device."), near),
      mapBox),
    list,

    h("h3", { class: "about-h" }, "Seasonal at Village Park"),
    h("div", { class: "ub-ways" }, pr.seasonal.map((s) => { const st = seasonStatus(s); return h("div", { class: "card ub-way" },
      h("b", {}, s.what), h("span", { class: `pk-status ${st.open ? "open" : ""}` }, st.open ? "● " : "○ ", st.label),
      h("p", {}, `${st.season.label ? `${st.season.label}: ` : ""}${st.season.price}. ${st.season.note}.`)); })),

    h("h3", { class: "about-h" }, "Greenways: walk & bike"),
    h("div", { class: "ub-ways" }, pr.greenways.map((g) => h("div", { class: "card ub-way" },
      h("b", {}, g.name), h("span", { class: "pk-size" }, g.length), h("p", {}, g.route), h("p", {}, h("b", {}, "Parking: "), g.parking)))),
    h("p", { class: "pk-inline-links" }, pr.greenway_links.map((l) => h("a", { href: l.url, target: "_blank", rel: "noopener" }, `${l.title} ↗`))),

    h("h3", { class: "about-h" }, "Sports & programs"),
    h("div", { class: "ub-ways" }, pr.programs.map(card)),

    h("h3", { class: "about-h" }, "Reserve & rent"),
    h("div", { class: "ub-ways" }, pr.rent.map(card)),
    h("p", { class: "pk-inline-links" }, h("a", { href: pr.actions.reserve_help, target: "_blank", rel: "noopener" }, "How to reserve online (PDF) ↗")),

    h("div", { class: "grid" },
      h("section", { class: "card" }, h("h3", {}, "Park rules in brief"),
        h("ul", { class: "pk-rules" }, pr.rules.map((r) => h("li", {}, r))),
        h("a", { href: pr.rules_link, target: "_blank", rel: "noopener" }, "All rules & ordinances ↗")),
      h("section", { class: "card" }, h("h3", {}, "Get involved"),
        h("ul", { class: "pk-rules" }, pr.involved.map((x) => h("li", {}, h("a", { href: x.url, target: "_blank", rel: "noopener" }, `${x.title} ↗`)))))),

    h("div", { class: "card kpd-chief" },
      h("div", {}, h("b", {}, pr.director.name), h("span", {}, `${pr.director.title} · ${pr.accreditation}`)),
      contactButtons(pr.director, `${pr.director.name}, ${pr.director.title}`)));

  draw();
  const pts = pr.parks.filter((p) => p.lat);
  const lats = pts.map((p) => p.lat), lons = pts.map((p) => p.lon);
  makeMap(mapBox, { bounds: [[Math.min(...lons) - 0.012, Math.min(...lats) - 0.01], [Math.max(...lons) + 0.012, Math.max(...lats) + 0.01]] }).then((map) => {
    markers = pts.map((p) => new maplibregl.Marker({ element: h("div", { class: "pk-marker", title: p.name }, "🌳") })
      .setLngLat([p.lon, p.lat]).setPopup(new maplibregl.Popup({ offset: 14 }).setHTML(`<b>${p.name}</b><br>${p.address}`)).addTo(map));
    draw();
  });
}
