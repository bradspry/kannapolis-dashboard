// K-Town Connection (Entertainment tab): the Kannapolis show's newest episodes, on YouTube and as a podcast.
// Episodes come from the channel's YouTube feed and the Podbean podcast feed, matched by episode number.
// The window plays the newest episode in place (privacy-enhanced YouTube embed, only after you press play).
import { h, fill } from "../ui.js";

const ext = (href, label, cls) => h("a", { href, target: "_blank", rel: "noopener", class: cls }, label);
const day = (s, o = { month: "short", day: "numeric" }) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d).toLocaleDateString("en-US", o); };
export const epLabel = (e) => (e.ep ? `EP ${e.ep}` : "New episode");
export const minutes = (s) => (s ? (s >= 3600 ? `${Math.floor(s / 3600)} hr ${Math.round((s % 3600) / 60)} min` : `${Math.round(s / 60)} min`) : null);
const isNew = (e) => (Date.now() - new Date(e.published + "T12:00:00")) / 864e5 <= 7;

export const latest = (k) => k.episodes[0];

export function logo(k, cls = "kt-logo") {
  return h("span", { class: cls }, h("img", { src: k.logo, alt: "K-Town Connection" }));
}

export function meta(e) {
  return [epLabel(e), day(e.published), e.video?.views != null ? `${e.video.views.toLocaleString("en-US")} views` : null, minutes(e.audio?.seconds)].filter(Boolean).join(" · ");
}

export function thumb(e, cls = "") {
  return e.video ? h("span", { class: `kt-thumb ${cls}` }, h("img", { src: e.video.thumb, alt: "", loading: "lazy", referrerpolicy: "no-referrer" }), h("span", { class: "kt-play", "aria-hidden": "true" }, "▶"))
    : h("span", { class: `kt-thumb audio ${cls}` }, h("span", { "aria-hidden": "true" }, "🎙"));
}

export function buttons(e, { compact = false } = {}) {
  return h("div", { class: "kt-actions" },
    e.video ? ext(e.video.url, compact ? "▶ Watch ↗" : "▶ Watch on YouTube ↗", `btn-primary kt-btn${compact ? " compact" : ""}`) : null,
    e.audio ? ext(e.audio.page || e.audio.url, compact ? "🎧 Listen ↗" : "🎧 Listen to the podcast ↗", `pill-btn kt-btn${compact ? " compact" : ""}`) : null);
}

/** Compact list of earlier episodes for tiles. */
export function list(k, from, n) {
  return h("ul", { class: "ub-mini kt-mini" }, k.episodes.slice(from, from + n).map((e) =>
    h("li", {}, h("b", {}, e.ep ? `EP ${e.ep}` : day(e.published)), h("span", {}, e.title))));
}

export function renderKtown(k) {
  const root = document.getElementById("ktown-body"), e = latest(k);
  const player = h("div", { class: "kt-player" });
  const showThumb = () => fill(player, e.video
    ? h("button", { class: "kt-player-btn", type: "button", "aria-label": `Play ${epLabel(e)}: ${e.title}`, onclick: () => fill(player,
      h("iframe", { src: `https://www.youtube-nocookie.com/embed/${e.video.id}?autoplay=1&rel=0`, title: e.full_title, allow: "autoplay; encrypted-media; picture-in-picture; fullscreen", allowfullscreen: "", referrerpolicy: "strict-origin-when-cross-origin" })) },
      h("img", { src: e.video.thumb.replace("hqdefault", "maxresdefault"), alt: "", onerror: (ev) => { ev.target.src = e.video.thumb; } }), h("span", { class: "kt-play big", "aria-hidden": "true" }, "▶"))
    : thumb(e, "big"));
  showThumb();
  const L = k.links;
  fill(root,
    h("section", { class: "card kt-hero" },
      logo(k, "kt-hero-logo"),
      h("div", { class: "kt-hero-text" },
        h("div", { class: "bb-next-label" }, "Kannapolis podcast · video and audio"),
        h("p", { class: "gem-p" }, k.about),
        h("div", { class: "kt-actions" }, ext(L.subscribe, "▶ Subscribe on YouTube ↗", "btn-primary kt-btn"), ext(L.apple, "🎙 Apple Podcasts ↗", "pill-btn kt-btn"), ext(L.podbean, "🎧 Podbean ↗", "pill-btn kt-btn")),
        h("div", { class: "pk-links" }, ext(L.website, "ktownconnection.com ↗"), ext(L.facebook, "Facebook ↗"), ext(L.instagram, "Instagram ↗"), ext(L.shop, "Merch shop ↗")))),
    h("section", { class: "card kt-latest" },
      h("div", { class: "kt-latest-grid" }, player,
        h("div", { class: "kt-latest-text" },
          h("div", { class: "bb-next-label" }, isNew(e) ? `New · ${epLabel(e)}` : `Latest · ${epLabel(e)}`),
          h("h3", {}, e.title),
          h("p", { class: "tile-meta" }, meta(e)),
          e.summary ? h("p", { class: "gem-p kt-summary" }, e.summary) : null,
          e.audio?.url ? h("audio", { class: "kt-audio", controls: "", preload: "none", src: e.audio.url, "aria-label": `Listen to ${epLabel(e)}` }) : null,
          buttons(e)))),
    h("h3", { class: "about-h" }, "Recent episodes"),
    h("div", { class: "kt-grid" }, k.episodes.slice(1).map((x) => h("article", { class: "card kt-ep" },
      x.video ? h("a", { href: x.video.url, target: "_blank", rel: "noopener", "aria-label": `Watch ${epLabel(x)} on YouTube` }, thumb(x)) : thumb(x),
      h("div", { class: "kt-ep-text" }, h("small", { class: "tile-meta" }, meta(x)), h("b", {}, x.title), buttons(x, { compact: true }))))),
    h("p", { class: "note" }, "Episodes from the show's YouTube channel feed and its podcast feed on Podbean (the same feed Apple Podcasts uses), read daily and matched by episode number. Video plays from YouTube's privacy-enhanced player only after you press play."));
}
