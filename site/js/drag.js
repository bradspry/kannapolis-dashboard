// Drag-to-rearrange for the home grid (Pointer Events: mouse, touch and pen).
// Mouse can grab anywhere on a tile; touch grabs the grip handle so the page still scrolls.
// Other tiles glide to their new spots (FLIP). Auto-scrolls near the top/bottom edges.
const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Move `tile` among its siblings, animating everyone else from old to new position. */
function flipMove(container, mutate, skip) {
  const tiles = [...container.children];
  const first = new Map(tiles.map((t) => [t, t.getBoundingClientRect()]));
  mutate();
  if (reducedMotion()) return;
  for (const t of tiles) {
    if (t === skip) continue;
    const a = first.get(t), b = t.getBoundingClientRect();
    const dx = a.left - b.left, dy = a.top - b.top;
    if (dx || dy) t.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], { duration: 220, easing: "cubic-bezier(.2,.8,.2,1)" });
  }
}

const idsOf = (container) => [...container.children].map((t) => t.dataset.tile);

/** Keyboard move: shift a tile by `step` places. */
export function moveBy(tile, step, done) {
  const container = tile.parentElement;
  const tiles = [...container.children];
  const i = tiles.indexOf(tile), j = Math.max(0, Math.min(tiles.length - 1, i + step));
  if (i === j) return;
  flipMove(container, () => (step > 0 ? tiles[j].after(tile) : tiles[j].before(tile)), null);
  tile.querySelector(".tile-grip")?.focus();
  done(idsOf(container), j + 1);
}

export function enableDrag(container, { active, onDrop }) {
  let s = null; // drag state

  const place = () => {
    const { tile, grabX, grabY, baseX, baseY, x, y } = s;
    tile.style.transform = `translate(${x - grabX - (baseX - scrollX)}px, ${y - grabY - (baseY - scrollY)}px) scale(1.04)`;
  };
  const measureBase = () => {
    const prev = s.tile.style.transform;
    s.tile.style.transform = "none";
    const r = s.tile.getBoundingClientRect();
    s.tile.style.transform = prev;
    s.baseX = r.left + scrollX; s.baseY = r.top + scrollY;
  };

  const hitTest = () => {
    if (performance.now() < s.lockUntil) return;
    const el = document.elementFromPoint(s.x, s.y)?.closest(".tile-w");
    if (!el || el === s.tile || el.parentElement !== container) return;
    const tiles = [...container.children];
    const from = tiles.indexOf(s.tile), to = tiles.indexOf(el);
    flipMove(container, () => (from < to ? el.after(s.tile) : el.before(s.tile)), s.tile);
    measureBase();
    place();
    s.lockUntil = performance.now() + 160; // let tiles settle before the next swap
  };

  const autoScroll = () => {
    if (!s?.started) return;
    const edge = 90, bottomEdge = innerHeight - 130; // keep clear of the dock
    const v = s.y < edge ? -(edge - s.y) / 5 : s.y > bottomEdge ? (s.y - bottomEdge) / 5 : 0;
    if (v) { scrollBy(0, Math.max(-18, Math.min(18, v))); place(); hitTest(); }
    s.raf = requestAnimationFrame(autoScroll);
  };

  container.addEventListener("pointerdown", (e) => {
    if (!active() || s || e.button !== 0) return;
    const tile = e.target.closest(".tile-w");
    if (!tile || e.target.closest(".tile-remove, .tile-top, .size-picker, a")) return;
    if (e.pointerType !== "mouse" && !e.target.closest(".tile-grip")) return;
    s = { tile, id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, started: false, lockUntil: 0 };
    container.setPointerCapture(e.pointerId);
    if (e.pointerType !== "mouse") e.preventDefault();
  });

  container.addEventListener("pointermove", (e) => {
    if (!s || e.pointerId !== s.id) return;
    s.x = e.clientX; s.y = e.clientY;
    if (!s.started) {
      if (Math.hypot(s.x - s.x0, s.y - s.y0) < 6) return;
      s.started = true;
      const r = s.tile.getBoundingClientRect();
      s.grabX = s.x0 - r.left; s.grabY = s.y0 - r.top;
      s.tile.classList.add("dragging");
      document.body.classList.add("is-dragging");
      measureBase();
      s.raf = requestAnimationFrame(autoScroll);
    }
    place();
    hitTest();
  });

  const end = (e) => {
    if (!s || e.pointerId !== s.id) return;
    const { tile, started, raf } = s;
    cancelAnimationFrame(raf);
    s = null;
    if (!started) return;
    document.body.classList.remove("is-dragging");
    const settle = () => { tile.classList.remove("dragging", "settling"); tile.style.transform = ""; };
    if (reducedMotion()) settle();
    else {
      tile.classList.add("settling");
      tile.style.transform = "none";
      setTimeout(settle, 220);
    }
    onDrop(idsOf(container));
  };
  container.addEventListener("pointerup", end);
  container.addEventListener("pointercancel", end);
}
