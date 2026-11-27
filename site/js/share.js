// Share a widget: its share page (built by etl/build_site.py, e.g. /gas/) carries a card drawn from today's data,
// so the link previews well on Facebook. On phones the system share sheet (Facebook, Messages…); everywhere a
// copy-link button and Facebook's share dialog (pick "Share to a group" there). No Facebook script is loaded.
import { h } from "./ui.js";

export const SITE_URL = "https://kannapolistalk.com/";

export function shareBar(slug, { title, text } = {}) {
  const url = `${SITE_URL}${slug}/`;
  const msg = h("span", { class: "share-msg", role: "status" });
  const say = (t) => { msg.textContent = t; setTimeout(() => (msg.textContent = ""), 2500); };
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); say("Link copied"); }
    catch { window.prompt("Copy this link:", url); }
  };
  const native = typeof navigator !== "undefined" && navigator.share
    ? h("button", { type: "button", class: "btn-primary share-btn", onclick: async () => { try { await navigator.share({ title, text, url }); } catch { /* closed */ } } }, "↗ Share")
    : null;
  return h("div", { class: "share-bar" },
    native,
    h("a", { class: `${native ? "pill-btn" : "btn-primary"} share-btn`, href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`, target: "_blank", rel: "noopener" }, "Share to Facebook"),
    h("button", { type: "button", class: "pill-btn share-btn", onclick: copy }, "Copy link"),
    msg);
}
