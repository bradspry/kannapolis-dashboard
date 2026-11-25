// Small stroke icons (24×24, drawn for this dashboard). icon(name) returns an <svg>.
const PATHS = {
  people: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8"/><path d="M18 14.3c2.1.7 3.5 2.8 3.5 5.7"/>',
  growth: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
  land: '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z"/><path d="M9 4v14M15 6v14"/>',
  budget: '<path d="M3 21h18M4 10h16M12 3l8 5H4l8-5z"/><path d="M6 10v8M10 10v8M14 10v8M18 10v8"/>',
  debt: '<ellipse cx="9" cy="6.5" rx="6" ry="2.8"/><path d="M3 6.5v4.5c0 1.6 2.7 2.8 6 2.8s6-1.2 6-2.8V6.5"/><path d="M9 13.8v2.7c0 1.6 2.7 2.8 6 2.8s6-1.2 6-2.8V12c0-1.6-2.7-2.8-6-2.8"/>',
  news: '<rect x="3" y="4" width="14" height="16" rx="2"/><path d="M17 8h3a1 1 0 0 1 1 1v9a2 2 0 0 1-4 0"/><path d="M7 8h6M7 12h6M7 16h4"/>',
  meetings: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  council: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  org: '<rect x="9" y="3" width="6" height="5" rx="1"/><rect x="3" y="16" width="6" height="5" rx="1"/><rect x="15" y="16" width="6" height="5" rx="1"/><path d="M12 8v4M6 16v-2a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2"/>',
  about: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  gauge: '<path d="M4 18a8 8 0 1 1 16 0"/><path d="m12 18 4-6"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  expand: '<path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7"/>',
  parade: '<path d="M6 3v10"/><path d="M6 3h9l-2 3 2 3H6"/><rect x="3" y="13" width="18" height="4" rx="1.5"/><circle cx="7" cy="19.5" r="1.5"/><circle cx="17" cy="19.5" r="1.5"/>',
  events: '<path d="M12 3l2.4 5.1 5.6.7-4.1 3.9 1 5.5L12 15.6 7.1 18.2l1-5.5L4 8.8l5.6-.7L12 3z"/>',
  weather: '<path d="M7 18h10a4 4 0 0 0 .5-7.97A6 6 0 0 0 6.1 11.3 3.5 3.5 0 0 0 7 18z"/><path d="M12 2v1.5M4.9 4.9l1 1M2 12h1.5"/>',
  police: '<path d="M12 3l7 3v5c0 4.5-3 8.3-7 9.7C8 19.3 5 15.5 5 11V6l7-3z"/><path d="M12 8.2l1.2 2.4 2.6.4-1.9 1.8.5 2.6-2.4-1.3-2.4 1.3.5-2.6-1.9-1.8 2.6-.4z"/>',
  fire: '<path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2.4 1.3-3.8 2.4-5 .2 1.6 1 2.6 2.1 3 .2-3.2-.3-5.6.5-8z"/>',
  baseball: '<circle cx="12" cy="12" r="9"/><path d="M7.5 4.2c1.6 2.2 1.6 13.4 0 15.6M16.5 4.2c-1.6 2.2-1.6 13.4 0 15.6"/><path d="M6.2 8h2.4M6.2 12h2.6M6.2 16h2.4M15.4 8h2.4M15.2 12h2.6M15.4 16h2.4"/>',
  bill: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3z"/><path d="M12 7.5c-1.4 1.8-2.2 3-2.2 4a2.2 2.2 0 0 0 4.4 0c0-1-.8-2.2-2.2-4z"/><path d="M9 16h6"/>',
  pin: '<path d="M9 4h6l-1 5 3 3v2H7v-2l3-3z"/><path d="M12 14v6"/>',
  toTop: '<path d="M5 4h14"/><path d="M12 20V9"/><path d="m7 13 5-5 5 5"/>',
  tree: '<path d="M12 3l5 7h-3l4 6H6l4-6H7l5-7z"/><path d="M12 16v5"/>',
  film: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 5v14M17 5v14M3 9h4M3 15h4M17 9h4M17 15h4"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7"/>',
  mug: '<path d="M5 8h10v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V8z"/><path d="M15 11h2a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-2"/><path d="M5 8c0-2 1.5-3 3-3 .5-1.2 1.7-2 3-2s2.5.8 3 2c.6 0 1 .4 1 1v2"/><path d="M8.5 12v5M11.5 12v5"/>',
  book: '<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v15H5.5A1.5 1.5 0 0 0 4 20.5v-15z"/><path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13v15h5.5a1.5 1.5 0 0 1 1.5 1.5v-15z"/><path d="M4 20.5A1.5 1.5 0 0 1 5.5 19H11M20 20.5a1.5 1.5 0 0 0-1.5-1.5H13"/>',
  burger: '<path d="M4 11a8 6 0 0 1 16 0H4z"/><path d="M3.5 14.5h17"/><path d="M4 17.5h16a0 0 0 0 1 0 0 2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5z"/><path d="M9 7.5h.01M12 6.5h.01M15 7.5h.01"/>',
  video: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m10 9 5 3-5 3V9z"/>',
  trash: '<path d="M4 7h16"/><path d="M9 7V4.5h6V7"/><path d="M6 7l1 13h10l1-13"/><path d="M10 11v6M14 11v6"/>',
  fuel: '<path d="M4 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M2.5 21h13M4 10h10"/><path d="M14 8h1.5a2 2 0 0 1 2 2v6.5a1.5 1.5 0 0 0 3 0V9.5L18 7"/>',
  cone: '<path d="M10.2 4h3.6l4.7 15H5.5z"/><path d="M8.3 10h7.4M7 14.5h10"/><path d="M3 19h18"/>',
  road: '<path d="M9 3 5 21M15 3l4 18"/><path d="M12 4v2.5M12 10.5v3M12 17.5V20"/>',
  school: '<path d="M3 10.5 12 5l9 5.5"/><path d="M5 9.5V20h14V9.5"/><path d="M10 20v-5h4v5"/><path d="M12 5V2.5h3"/>',
  waves: '<path d="M2.5 8c1.6 0 1.6-1.5 3.2-1.5S7.3 8 8.9 8s1.6-1.5 3.1-1.5S13.6 8 15.2 8s1.6-1.5 3.1-1.5S19.9 8 21.5 8"/><path d="M2.5 13c1.6 0 1.6-1.5 3.2-1.5S7.3 13 8.9 13s1.6-1.5 3.1-1.5 1.6 1.5 3.2 1.5 1.6-1.5 3.1-1.5 1.6 1.5 3.2 1.5"/><path d="M2.5 18c1.6 0 1.6-1.5 3.2-1.5S7.3 18 8.9 18s1.6-1.5 3.1-1.5 1.6 1.5 3.2 1.5 1.6-1.5 3.1-1.5 1.6 1.5 3.2 1.5"/>',
  chart: '<path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 6-7"/>',
  drop: '<path d="M12 3.5c3 3.9 6 7.4 6 10.6a6 6 0 0 1-12 0c0-3.2 3-6.7 6-10.6z"/><path d="M9.2 14.6a2.9 2.9 0 0 0 2.9 2.7"/>',
  bus: '<rect x="4.5" y="3.5" width="15" height="14" rx="3"/><path d="M4.5 10.5h15"/><path d="M8 14h.01M16 14h.01"/><path d="M7 17.5V20M17 17.5V20"/><path d="M9 6.5h6"/>',
  accessible: '<circle cx="12" cy="4.5" r="1.7"/><path d="M12 7.5v6h5l2 5"/><path d="M12 10.5h4.5"/><path d="M9.2 10.3a5.5 5.5 0 1 0 7.3 7.4"/>',
  shuttle: '<path d="M3.5 15.5V9a3 3 0 0 1 3-3h9.4a3 3 0 0 1 2.6 1.5l2 3.5v4.5z"/><path d="M3.5 11h17"/><path d="M8 6v5M13 6v5"/><circle cx="7.5" cy="16.5" r="1.8"/><circle cx="16.5" cy="16.5" r="1.8"/>',
  briefcase: '<rect x="3" y="7" width="18" height="13" rx="2.5"/><path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7"/><path d="M3 12.5h18"/><path d="M11 12.5h2v2h-2z"/>',
  plane: '<path d="M10.2 13.8 6 18l-2.5-.8 2.6-3.2-3.1-2.1 1-1 3.9.9 3.4-3.4L4.5 5l1.3-1.3 9.8 2.6 3-3a1.8 1.8 0 0 1 2.5 2.5l-3 3 2.6 9.8-1.3 1.3-3.4-6.8z"/>',
  train: '<rect x="6" y="3" width="12" height="14" rx="3"/><path d="M6 10h12"/><path d="M10 6.5h4"/><path d="M9 13.5h.01M15 13.5h.01"/><path d="m8.5 17-2.5 4M15.5 17l2.5 4M7.3 19.5h9.4"/>',
  library: '<path d="M4 20h16"/><rect x="5" y="5" width="3" height="15" rx=".5"/><rect x="9" y="7" width="3" height="13" rx=".5"/><path d="m13.5 8.2 2.9-.8 3.3 12.1-2.9.8z"/>',
  grip: '<circle cx="9" cy="6" r="1.4"/><circle cx="15" cy="6" r="1.4"/><circle cx="9" cy="12" r="1.4"/><circle cx="15" cy="12" r="1.4"/><circle cx="9" cy="18" r="1.4"/><circle cx="15" cy="18" r="1.4"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
};

export function icon(name, size = 20) {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", size);
  svg.setAttribute("height", size);
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.8");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.innerHTML = PATHS[name] || PATHS.grid;
  return svg;
}
