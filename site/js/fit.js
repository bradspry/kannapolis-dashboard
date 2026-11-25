// Fit lists to their tile. A tile has a fixed height; on a narrow phone its rows wrap taller, and a long list
// can run out the bottom: the last row cut in half, and anything below the list (an "All openings" button)
// pushed out of sight. This drops rows from the end of the lowest list until the tile's content fits,
// always keeping each list's first row. Rows come back when there's room again (a wider screen).

const HIDDEN = "fitHidden";

/** The lowest bottom edge of the tile's laid-out content, skipping absolutely placed decorations
 *  (snowfall, radar, corner logos) and maps. */
function contentBottom(body) {
  let max = -Infinity;
  const walk = (el) => {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.position === "absolute" || cs.position === "fixed" || el.classList.contains("maplibregl-map")) return;
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) max = Math.max(max, r.bottom);
    for (const c of el.children) walk(c);
  };
  for (const c of body.children) walk(c);
  return max;
}

const rowsOf = (list) => [...list.children].filter((li) => li.tagName === "LI" && li.style.display !== "none");

export function fitTile(tile) {
  const body = tile.querySelector(":scope > .tile-body") || tile.querySelector(".tile-body");
  if (!body) return;
  for (const li of tile.querySelectorAll("[data-fit-hidden]")) { li.style.display = ""; delete li.dataset[HIDDEN]; }
  const box = tile.getBoundingClientRect();
  if (!box.height) return;
  const limit = box.bottom - 4; // content may run into the bottom padding: it's still in view
  const oneLine = (l) => { const r = rowsOf(l); return r.length > 1 && Math.abs(r[0].getBoundingClientRect().top - r[r.length - 1].getBoundingClientRect().top) < 2; };
  const lists = new Set([...body.querySelectorAll("ul, ol")].filter((l) => !l.closest(".maplibregl-map") && !oneLine(l))); // a strip of side-by-side items (a forecast) never gets shorter
  let bottom = contentBottom(body);
  for (let i = 0; i < 60 && bottom > limit; i++) {
    // the list whose last row sits lowest, among lists with a row to spare
    let pick = null, from = null, low = -Infinity;
    for (const l of lists) {
      const rows = rowsOf(l);
      if (rows.length < 2) continue;
      const b = rows[rows.length - 1].getBoundingClientRect().bottom;
      if (b > low) { low = b; pick = rows[rows.length - 1]; from = l; }
    }
    if (!pick) break;
    // Hide rows from the end of that list until the content gets shorter. Wrapping chips may need a few to
    // free a line; a single row of side-by-side items never does, so those rows come back and the list is skipped.
    const tried = [];
    let now = bottom;
    for (let row = pick; row && now >= bottom - 0.5; ) {
      row.style.display = "none"; tried.push(row);
      now = contentBottom(body);
      const rows = rowsOf(from);
      row = rows.length > 1 ? rows[rows.length - 1] : null;
    }
    if (now >= bottom - 0.5) { for (const r of tried) r.style.display = ""; lists.delete(from); continue; }
    for (const r of tried) r.dataset[HIDDEN] = "1";
    bottom = now;
  }
}

export function fitAll(root = document) {
  for (const t of root.querySelectorAll(".tile-w")) fitTile(t);
}

let queued = 0;
/** Fit on the next frame (once, however many times it's asked). */
export function fitSoon(root = document) {
  cancelAnimationFrame(queued);
  queued = requestAnimationFrame(() => fitAll(root));
}

// Rows change height when fonts and images arrive and when the screen changes width.
if (typeof window !== "undefined") {
  let t = 0;
  window.addEventListener("resize", () => { clearTimeout(t); t = setTimeout(() => fitAll(), 150); });
  window.addEventListener("load", () => fitAll());
  document.fonts?.ready.then(() => fitAll());
}
