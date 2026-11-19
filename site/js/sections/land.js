import { card, dataTable, h, showTip, hideTip } from "../ui.js";
import { tokens } from "../theme.js";
import { makeMap, bboxOf, firstLabelLayer } from "../maps.js";
import { num, pct } from "../format.js";

// Zoning has 9 categories — more than a map can color distinctly. Instead, one category at a
// time is highlighted in the accent color and everything else is neutral (pick with the chips).
let selected = "Residential";

export function renderLand(zoning, zoningGeo) {
  const t = tokens();
  const cats = zoning.categories;
  const top = cats[0];
  const { body, fig } = card("zoning", {
    title: `${pct(top.pct, 0)} of zoned land is set aside for ${top.category.toLowerCase()} use`,
    sub: `Acres in each zoning category across ${num(zoning.total_acres)} zoned acres. Pick a category to see it on the map.`,
    note: `${zoning.coverage_note} Conditional-zoning variants (codes ending in -CZ) are counted with their base district.`,
  });

  const chips = h("div", { class: "chips", role: "group", "aria-label": "Zoning category" });
  const bars = h("div", { style: { display: "grid", gap: "6px", marginBottom: "14px" } });
  const max = Math.max(...cats.map((c) => c.acres));
  const rowEls = [];
  for (const c of cats) {
    const fill = h("div", { style: { height: "12px", width: `${(100 * c.acres) / max}%`, borderRadius: "0 4px 4px 0", minWidth: "2px" } });
    const row = h("div", { style: { display: "grid", gridTemplateColumns: "170px minmax(0,1fr) 92px", gap: "10px", alignItems: "center", fontSize: "13px", cursor: "pointer" },
      onclick: () => select(c.category) },
      h("span", { style: { color: "var(--text-secondary)" } }, c.category),
      h("div", {}, fill),
      h("span", { style: { textAlign: "right", fontVariantNumeric: "tabular-nums" } }, `${num(c.acres)} ac`));
    rowEls.push({ c, fill, row });
    bars.append(row);
    chips.append(h("button", { class: "chip", type: "button", "aria-pressed": String(c.category === selected), "data-cat": c.category,
      onclick: () => select(c.category) }, c.category));
  }
  body.append(chips, bars);
  const el = h("div", { class: "map", id: "zoning-map", role: "img", "aria-label": "Zoning map of Kannapolis" });
  body.append(el);

  let mapRef = null;
  const paint = () => {
    chips.querySelectorAll(".chip").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.cat === selected)));
    rowEls.forEach(({ c, fill, row }) => {
      fill.style.background = c.category === selected ? t.accent : t.mutedFill;
      row.style.fontWeight = c.category === selected ? "600" : "400";
    });
    if (mapRef) {
      mapRef.setPaintProperty("z", "fill-color", ["case", ["==", ["get", "category"], selected], t.accent, t.mutedFill]);
      mapRef.setPaintProperty("z", "fill-opacity", ["case", ["==", ["get", "category"], selected], 0.8, t.dark ? 0.55 : 0.35]);
    }
  };
  function select(cat) { selected = cat; paint(); }
  paint();

  makeMap(el, { bounds: bboxOf(zoningGeo) }).then((map) => {
    mapRef = map;
    map.addSource("z", { type: "geojson", data: zoningGeo });
    map.addLayer({ id: "z", type: "fill", source: "z", paint: { "fill-outline-color": t.surface } }, firstLabelLayer(map));
    paint();
    map.on("mousemove", "z", (e) => {
      const p = e.features[0].properties;
      map.getCanvas().style.cursor = "pointer";
      showTip(e.originalEvent, p.category, [["District code", p.code]]);
    });
    map.on("mouseleave", "z", () => { map.getCanvas().style.cursor = ""; hideTip(); });
    map.on("click", "z", (e) => select(e.features[0].properties.category));
  });

  fig.append(dataTable([
    { key: "code", label: "District" },
    { key: "category", label: "Category" },
    { key: "acres", label: "Acres", num: true, format: num },
  ], zoning.districts, "Show acres by zoning district"));
}
