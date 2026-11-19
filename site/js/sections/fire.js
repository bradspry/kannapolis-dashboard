// Kannapolis Fire: how to reach KFD, free help for residents, after a fire, and the five stations
// (with "find my nearest station", computed on the device; the location is never sent anywhere).
import { h, contactButtons } from "../ui.js";
import { makeMap, maplibregl } from "../maps.js";
import { callButtons } from "./police.js";

const tel = (n) => `tel:${n.replace(/[^0-9]/g, "")}`;
const mapsLink = (s) => `https://www.openstreetmap.org/?mlat=${s.lat}&mlon=${s.lon}#map=16/${s.lat}/${s.lon}`;
const directions = (s) => `https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lon}`;

function milesBetween(a, b) {
  const R = 3958.8, rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

export function freeList(fire, n = 99, { actions = true } = {}) {
  return h("ul", { class: "kfd-free", role: "list" }, fire.free.slice(0, n).map((f) => h("li", {},
    h("b", {}, f.title), actions ? h("a", { href: f.url, target: f.url.startsWith("mailto") ? null : "_blank", rel: "noopener" }, `${f.action} ↗`) : null)));
}

export function stationList(fire, { compact = false } = {}) {
  return h("ol", { class: `kfd-stations${compact ? " compact" : ""}` }, fire.stations.map((s, i) => h("li", {},
    h("span", { class: "kfd-num", "aria-hidden": "true" }, i + 1),
    h("span", {}, h("b", {}, s.name), h("small", {}, s.address)),
    compact ? null : h("a", { href: directions(s), target: "_blank", rel: "noopener", "aria-label": `Directions to ${s.name}` }, "Directions ↗"))));
}

export function renderFire(fire, org) {
  const root = document.getElementById("fire-body");
  const marshal = fire.phones.find((p) => p.kind === "marshal");
  const chief = org?.people?.find((p) => /fire chief/i.test(p.title));
  const f = fire.facts;

  const nearestOut = h("p", { class: "kfd-nearest-out", role: "status", "aria-live": "polite" });
  const findBtn = h("button", { class: "btn-primary", type: "button" }, "📍 Find my nearest fire station");
  findBtn.addEventListener("click", () => {
    if (!navigator.geolocation) { nearestOut.textContent = "Your browser can't share its location."; return; }
    nearestOut.textContent = "Finding you…";
    navigator.geolocation.getCurrentPosition((pos) => {
      const me = { lat: pos.coords.latitude, lon: pos.coords.longitude };
      const best = fire.stations.map((s) => ({ ...s, mi: milesBetween(me, s) })).sort((a, b) => a.mi - b.mi)[0];
      nearestOut.replaceChildren(h("b", {}, best.name), ` is about ${best.mi.toFixed(1)} miles away (straight line), at ${best.address}. `,
        h("a", { href: directions(best), target: "_blank", rel: "noopener" }, "Directions ↗"));
    }, () => { nearestOut.textContent = "Location not available. Check that location is allowed for this page."; },
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 });
  });

  const mapBox = h("div", { class: "map kfd-map", id: "kfd-map", role: "img", "aria-label": "Map of the five Kannapolis fire stations" });

  root.replaceChildren(
    callButtons(fire),
    h("div", { class: "kpd-contact card" },
      h("div", {}, h("b", {}, "Fire code concern?"), " Call the Fire Marshal at ", h("a", { href: tel(marshal.number) }, marshal.number),
        h("p", { class: "muted" }, "Blocked exits, locked fire doors, overcrowding or other unsafe conditions in a building.")),
      h("div", {}, h("b", {}, "Questions or programs"), " · ", h("a", { href: `mailto:${fire.outreach_email}` }, fire.outreach_email),
        h("p", { class: "muted" }, "Smoke alarms, CPR classes, station tours and safety programs."))),

    h("h3", { class: "about-h" }, "Free for residents"),
    h("div", { class: "kfd-free-cards" }, fire.free.map((x) => h("div", { class: "card kfd-free-card" },
      h("b", {}, x.title), h("p", {}, x.text),
      h("a", { class: "kfd-act", href: x.url, target: x.url.startsWith("mailto") ? null : "_blank", rel: "noopener" }, `${x.action} ↗`)))),

    h("h3", { class: "about-h" }, "After a fire & homeowner forms"),
    h("div", { class: "kfd-free-cards" }, fire.after_fire.map((x) => h("div", { class: "card kfd-free-card" },
      h("b", {}, x.title), h("p", {}, x.text), h("a", { class: "kfd-act", href: x.url, target: "_blank", rel: "noopener" }, "Open (PDF) ↗")))),

    h("h3", { class: "about-h" }, "Fire stations"),
    h("div", { class: "kfd-stations-wrap" },
      h("div", { class: "card" }, findBtn, nearestOut, stationList(fire),
        h("p", { class: "note" }, "Your location stays on your device; it's only used to measure the distance.")),
      h("div", { class: "card" }, mapBox)),

    h("h3", { class: "about-h" }, "About KFD"),
    h("div", { class: "card kfd-about" },
      h("div", { class: "kfd-iso" }, h("span", { class: "kfd-iso-badge", "aria-hidden": "true" }, "ISO 1"),
        h("div", {}, h("b", {}, "Top-rated: ISO Class 1"),
          h("p", {}, "The best possible score in the Insurance Services Office's fire-protection rating. It reflects staffing, equipment, 911 dispatch, water supply, prevention and training, and can lower homeowners' insurance premiums."))),
      h("ul", { class: "kfd-facts" },
        h("li", {}, h("b", {}, f.residents), " residents protected"),
        h("li", {}, h("b", {}, f.area_sqmi), " square miles"),
        h("li", {}, h("b", {}, f.personnel), " firefighters and staff"),
        h("li", {}, h("b", {}, String(f.stations)), " stations: ", `${f.engines} engines, ${f.ladders} ladder trucks, ${f.other}`),
        h("li", {}, h("b", {}, f.per_shift), " people on duty around the clock, on 24-hour shifts"))),
    chief ? h("div", { class: "card kpd-chief" },
      chief.photo ? h("img", { src: chief.photo, alt: "" }) : null,
      h("div", {}, h("b", {}, chief.name), h("span", {}, "Fire Chief")),
      contactButtons(chief, `${chief.name}, Fire Chief`)) : null,

    h("details", { class: "card kfd-permits" }, h("summary", {}, "For businesses & events: permits and forms"),
      h("ul", { role: "list" }, fire.permits.map((p) => h("li", {}, h("a", { href: p.url, target: "_blank", rel: "noopener" }, `${p.title} ↗`))))),

    h("p", { class: "note" }, "From the ",
      h("a", { href: fire.page, target: "_blank", rel: "noopener" }, "Kannapolis Fire Department"),
      " website. Station locations mapped with the ", h("a", { href: fire.geocoder, target: "_blank", rel: "noopener" }, "U.S. Census Bureau geocoder"), "."));

  // Stations map (after it's in the DOM so it can size itself).
  const lats = fire.stations.map((s) => s.lat), lons = fire.stations.map((s) => s.lon);
  makeMap(mapBox, { bounds: [[Math.min(...lons) - 0.02, Math.min(...lats) - 0.015], [Math.max(...lons) + 0.02, Math.max(...lats) + 0.015]] }).then((map) => {
    fire.stations.forEach((s, i) => {
      const el = h("div", { class: "kfd-marker", title: s.name }, String(i + 1));
      new maplibregl.Marker({ element: el }).setLngLat([s.lon, s.lat])
        .setPopup(new maplibregl.Popup({ offset: 14 }).setHTML(`<b>${s.name}</b><br>${s.address}`)).addTo(map);
    });
  });
}
