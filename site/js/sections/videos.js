// City Council meeting videos: the next meeting's live stream and recent recordings, from the
// City's YouTube playlist (read daily). The in-window player loads YouTube only when someone
// presses play (privacy-enhanced youtube-nocookie.com embed); until then it's just a thumbnail.
import { h, fill } from "../ui.js";

const LIVE_HOURS = 4; // a Council meeting stream is treated as "live" from start time for this long
const parseLocal = (s) => { const [d, t = "18:00"] = s.split("T"); const [y, m, dd] = d.split("-").map(Number); const [hh, mm] = t.split(":").map(Number); return new Date(y, m - 1, dd, hh, mm); };
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const dayLabel = (d, o = { weekday: "long", month: "short", day: "numeric" }) => d.toLocaleDateString("en-US", o);
export const timeLabel = (d) => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
const views = (n) => `${n.toLocaleString("en-US")} view${n === 1 ? "" : "s"}`;

/** Split into the next stream (upcoming or live now) and past recordings, newest first. */
export function splitVideos(vd, now = new Date()) {
  const all = vd.videos.map((v) => ({ ...v, _d: parseLocal(v.start) }));
  const isLive = (v) => now >= v._d && now - v._d < LIVE_HOURS * 3600e3;
  const upcoming = all.filter((v) => v._d > now || isLive(v)).sort((a, b) => a._d - b._d);
  const recent = all.filter((v) => !upcoming.includes(v)).sort((a, b) => b._d - a._d);
  const next = upcoming[0] ? { ...upcoming[0], live: isLive(upcoming[0]) } : null;
  return { next, recent };
}

/** "Live now", "Tonight", "Tomorrow", or the weekday. */
export function whenBadge(v, now = new Date()) {
  if (v.live) return "Live now";
  const days = Math.round((startOfDay(v._d) - startOfDay(now)) / 86400000);
  return days === 0 ? "Tonight" : days === 1 ? "Tomorrow" : null;
}

export function thumb(v, size = "md", { play = true } = {}) {
  return h("div", { class: `vd-thumb ${size}` },
    h("img", { src: v.thumb, alt: "", loading: "lazy", referrerpolicy: "no-referrer" }),
    play ? h("span", { class: "vd-play", "aria-hidden": "true" }, v.live ? "●" : "▶") : null);
}

export function watchButton(v, { compact = false } = {}) {
  const label = v.live ? "Watch live now" : v._d > new Date() ? "Watch live on YouTube" : "Watch on YouTube";
  return h("a", { class: `btn-primary vd-watch${compact ? " compact" : ""}${v.live ? " live" : ""}`, href: v.url, target: "_blank", rel: "noopener" }, `${v.live ? "🔴" : "▶"} ${compact ? (v.live ? "Watch live" : v._d > new Date() ? "Watch live" : "Watch") : label} ↗`);
}

const ext = (href, label) => h("a", { href, target: "_blank", rel: "noopener" }, label);
const docLinks = (v) => [v.agenda ? ext(v.agenda, "Agenda ↗") : null, v.minutes ? ext(v.minutes, "Minutes ↗") : null, v.meeting_url ? ext(v.meeting_url, "Meeting files ↗") : null];

let playing = null; // id of the recording loaded in the player

export function renderVideos(vd) {
  const root = document.getElementById("videos-body");
  const { next, recent } = splitVideos(vd);
  if (!playing || !recent.some((v) => v.id === playing)) playing = recent[0]?.id || null;

  const player = h("div", { class: "vd-player" });
  const caption = h("div", { class: "vd-caption" });
  const list = h("ul", { class: "vd-grid", role: "list" });
  const drawPlayer = (autoplay) => {
    const v = recent.find((x) => x.id === playing);
    if (!v) { player.replaceChildren(); caption.replaceChildren(); return; }
    // Thumbnail until someone presses play; then the privacy-enhanced embed (no YouTube cookies until playback).
    player.replaceChildren(autoplay
      ? h("iframe", { src: `https://www.youtube-nocookie.com/embed/${v.id}?autoplay=1&rel=0`, title: v.title, allow: "autoplay; encrypted-media; picture-in-picture; fullscreen", allowfullscreen: "", referrerpolicy: "strict-origin-when-cross-origin" })
      : h("button", { class: "vd-start", type: "button", "aria-label": `Play ${v.title}`, onclick: () => drawPlayer(true) }, thumb(v, "lg")));
    caption.replaceChildren(
      h("div", { class: "bb-next-label" }, "Recorded meeting"),
      h("h3", {}, dayLabel(v._d, { weekday: "long", month: "long", day: "numeric", year: "numeric" })),
      h("div", { class: "tile-meta" }, `${v.title.split("|")[0].trim()} · ${views(v.views)}`),
      h("div", { class: "pk-links" }, ext(v.url, "Open on YouTube ↗"), ...docLinks(v)));
    list.querySelectorAll("li").forEach((li) => li.classList.toggle("on", li.dataset.id === playing));
  };
  list.replaceChildren(...recent.map((v) => h("li", { "data-id": v.id },
    h("button", { type: "button", class: "vd-card", onclick: () => { playing = v.id; drawPlayer(true); player.scrollIntoView({ behavior: "smooth", block: "nearest" }); } },
      thumb(v, "md"),
      h("b", {}, dayLabel(v._d, { month: "short", day: "numeric", year: "numeric" })),
      h("span", {}, views(v.views))))));
  drawPlayer(false);

  fill(root, 
    next ? h("section", { class: `card gem-hero vd-next${next.live ? " live" : ""}` }, thumb(next, "md", { play: false }),
      h("div", { class: "gem-hero-text" },
        h("div", { class: "bb-next-label" }, next.live ? "Streaming now" : "Next Council meeting · streams live"),
        h("h3", {}, `${dayLabel(next._d)} · ${timeLabel(next._d)}`, whenBadge(next) ? h("span", { class: `mtg-badge soon${next.live ? " vd-live-badge" : ""}` }, whenBadge(next)) : null),
        h("p", {}, "The City streams every City Council meeting on YouTube. Open the stream now to set a reminder, then watch live or catch the recording afterward."),
        h("div", { class: "gem-actions" }, watchButton(next), next.agenda ? ext(next.agenda, "Agenda ↗") : h("span", { class: "tile-meta" }, "Agenda not posted yet"), next.meeting_url ? ext(next.meeting_url, "Meeting page ↗") : null))) : null,

    recent.length ? h("section", { class: "card vd-now" }, player, caption) : null,
    h("h3", { class: "about-h" }, `Recent meetings (${recent.length})`),
    list,
    h("div", { class: "pk-links" }, ext(vd.playlist, "All Council meeting videos ↗"), ext(vd.streams, "City of Kannapolis live streams ↗")),
    h("p", { class: "note" }, "From the City of Kannapolis YouTube channel, checked daily (updated ", vd.generated, "). Videos play from YouTube's privacy-enhanced player only after you press play."));
}
