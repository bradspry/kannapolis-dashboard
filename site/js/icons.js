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
  events: '<path d="M12 3l2.4 5.1 5.6.7-4.1 3.9 1 5.5L12 15.6 7.1 18.2l1-5.5L4 8.8l5.6-.7L12 3z"/>',
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
