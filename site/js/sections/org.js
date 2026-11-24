import { h, contactButtons, fill } from "../ui.js";

const initials = (name) => (name || "").split(/\s+/).filter((w) => /^[A-Z]/.test(w)).map((w) => w[0]).join("").slice(0, 2);

function face(p, size) {
  const fallback = () => h("span", { class: `org-face org-face-${size} placeholder`, "aria-hidden": "true" }, p.vacant ? "?" : initials(p.name));
  if (!p.photo) return fallback();
  const img = h("img", { class: `org-face org-face-${size}`, src: p.photo, alt: "", width: "56", height: "56", loading: "lazy", decoding: "async" });
  img.addEventListener("error", () => img.replaceWith(fallback()), { once: true });
  return img;
}

function emailLink(p) {
  return p.email ? h("a", { class: "org-email", href: `mailto:${p.email}`, "aria-label": `Email ${p.name}, ${p.title}` }, p.email) : null;
}

function phoneLink(p) {
  return p.phone ? h("a", { class: "org-phone", href: `tel:${p.phone.replace(/[^0-9]/g, "")}`, "aria-label": `Call ${p.name}, ${p.title}` }, p.phone) : null;
}

/** A person card. size: "lg" for leadership, "sm" for department heads. */
function personCard(p, size = "lg", extra = null) {
  const search = `${p.title} ${p.name || ""}`.toLowerCase();
  return h("div", { class: `org-card org-${size}${p.vacant ? " vacant" : ""}${p.dotted ? " dotted" : ""}`, "data-search": search },
    face(p, size),
    h("div", { class: "org-text" },
      h("div", { class: "org-title" }, p.title),
      h("div", { class: "org-name" }, p.vacant ? "Position vacant" : p.name),
      p.note ? h("div", { class: "org-note" }, p.note) : null,
      extra,
      emailLink(p),
      phoneLink(p),
      p.vacant ? null : contactButtons(p, `${p.name}, ${p.title}`)));
}

const relation = (label) => h("span", { class: "org-rel" }, label);

export function renderOrg(org) {
  const root = document.getElementById("org-body");
  const byId = Object.fromEntries(org.people.map((p) => [p.id, p]));
  const kids = (id) => org.people.filter((p) => p.reports_to === id);
  const manager = byId.melton ? byId.melton : kids("council").find((p) => p.title === "City Manager");
  const underManager = kids(manager.id);
  const safety = underManager.filter((p) => p.group === "Public safety");
  const leaders = underManager.filter((p) => p.group === "Leadership");
  const managerStaff = underManager.filter((p) => !p.group);
  const council = byId.council;
  const councilDirect = kids("council").filter((p) => p.id !== manager.id);

  const search = h("input", { type: "search", class: "org-search", placeholder: "Find a department or person (e.g. water, parks, finance)",
    "aria-label": "Find a department or person", "aria-describedby": "org-search-status" });
  const status = h("span", { id: "org-search-status", class: "org-search-status", "aria-live": "polite" });

  const top = h("div", { class: "org-level" },
    h("div", { class: "org-card org-council" },
      h("div", { class: "org-text" }, h("div", { class: "org-name" }, council.title), h("div", { class: "org-title" }, council.name))));

  const tier2 = h("div", { class: "org-level org-tier2" },
    ...councilDirect.map((p) => personCard(p, "lg", p.dotted_to === manager.id ? relation("Appointed by Council · works with City Manager") : null)),
    personCard(manager, "lg", relation("Appointed by Council · runs day-to-day operations")),
    ...managerStaff.map((p) => personCard(p, "lg", p.dotted_to === "council" ? relation("Works for the City Manager and Council") : null)));
  // Keep City Manager centered: attorney left, manager middle, clerk right.
  const order = [...councilDirect.map((p) => p.id), manager.id, ...managerStaff.map((p) => p.id)];
  const mgrCard = tier2.children[order.indexOf(manager.id)];
  mgrCard.classList.add("org-manager");
  if (tier2.children.length === 3 && order.indexOf(manager.id) !== 1) tier2.insertBefore(mgrCard, tier2.children[1]);

  const safetyRow = h("div", { class: "org-level org-safety" },
    h("div", { class: "org-group-label" }, "Public safety · report to the City Manager"),
    h("div", { class: "org-row" }, safety.map((p) => personCard(p, "lg"))));

  const cols = h("div", { class: "org-cols" },
    leaders.map((l) => {
      const depts = kids(l.id);
      return h("div", { class: "org-col" },
        personCard(l, "lg", depts.length ? relation(`${depts.length} departments`) : null),
        depts.length
          ? h("ul", { class: "org-depts", role: "list" }, depts.map((d) => h("li", {}, personCard(d, "sm"))))
          : null);
    }));

  const chart = h("div", { class: "org-chart" }, top, h("div", { class: "org-stem" }), tier2, h("div", { class: "org-stem" }),
    safetyRow, h("div", { class: "org-stem" }), cols);

  search.addEventListener("input", () => {
    const q = search.value.trim().toLowerCase();
    const cards = chart.querySelectorAll(".org-card[data-search]");
    let hits = 0;
    cards.forEach((c) => {
      const match = q && c.dataset.search.includes(q);
      c.classList.toggle("match", !!match);
      c.classList.toggle("dim", !!q && !match);
      if (match) hits++;
    });
    chart.classList.toggle("searching", !!q);
    status.textContent = q ? (hits ? `${hits} match${hits > 1 ? "es" : ""}` : "No matches") : "";
    if (q && hits) chart.querySelector(".org-card.match")?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  });

  fill(root, 
    h("div", { class: "org-search-row" }, search, status),
    chart,
    h("p", { class: "note org-footnote" },
      ...org.notes.map((n) => `${n} `),
      "Source: ", h("a", { href: org.source }, "City of Kannapolis organizational chart"), ". Photos: City of Kannapolis."));
}
