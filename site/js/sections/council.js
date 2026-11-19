import { h } from "../ui.js";

const initials = (name) => name.split(/\s+/).filter((w) => /^[A-Z]/.test(w) && !w.endsWith(".")).map((w) => w[0]).join("").slice(0, 2)
  || name[0];

function copyButton(text, label) {
  const btn = h("button", { class: "copy-btn", type: "button", "aria-label": `Copy ${label}` }, "Copy");
  btn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(text);
      btn.textContent = "Copied";
    } catch {
      btn.textContent = "Press Ctrl+C";
      window.getSelection()?.selectAllChildren(btn.previousSibling);
    }
    setTimeout(() => { btn.textContent = "Copy"; }, 1800);
  });
  return btn;
}

function avatar(m) {
  const fallback = () => h("span", { class: `avatar${m.role !== "Council Member" ? " lead" : ""}`, "aria-hidden": "true" }, initials(m.name));
  if (!m.photo) return fallback();
  const img = h("img", { class: `avatar photo${m.role !== "Council Member" ? " lead" : ""}`, src: m.photo,
    alt: `Photo of ${m.name}`, width: "64", height: "64", loading: "lazy", decoding: "async" });
  img.addEventListener("error", () => img.replaceWith(fallback()), { once: true });
  return img;
}

export function renderCouncil(council) {
  const root = document.getElementById("council-body");
  const group = council.group_email;

  const banner = h("div", { class: "council-group card" },
    h("div", {},
      h("h3", {}, "Email the whole Council at once"),
      h("p", { class: "sub" }, council.group_note)),
    h("div", { class: "council-group-actions" },
      h("a", { class: "btn-primary", href: `mailto:${group}` },
        h("span", { "aria-hidden": "true" }, "✉"), " Email all of them"),
      h("span", { class: "email-line" }, h("span", { class: "mono" }, group), copyButton(group, "group email address"))));

  const grid = h("ul", { class: "council-grid", role: "list" },
    council.members.map((m) => h("li", { class: "member card" },
      h("div", { class: "member-head" },
        avatar(m),
        h("div", {},
          h("div", { class: "member-name" }, m.name),
          h("div", { class: "member-role" }, m.role))),
      h("div", { class: "member-links" },
        h("span", { class: "email-line" },
          h("a", { href: `mailto:${m.email}`, "aria-label": `Email ${m.name}` }, m.email),
          copyButton(m.email, `${m.name}'s email address`)),
        m.phone ? h("a", { href: `tel:${m.phone.replace(/[^0-9]/g, "")}`, "aria-label": `Call ${m.name}` }, m.phone) : null))));

  root.replaceChildren(banner, grid,
    h("p", { class: "note council-note" }, "Contact details from the ",
      h("a", { href: council.source }, "City of Kannapolis City Council page"),
      `. Check there for meeting times and public comment sign-up. ${council.photo_credit || ""}`));
}
