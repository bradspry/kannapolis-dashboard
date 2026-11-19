// Pay Utility Bill: the fastest ways to pay, the card fee and due dates (with small calculators),
// and where to get help. Nothing is sent anywhere; the calculators run in the browser.
import { h, contactButtons } from "../ui.js";
import { usd } from "../format.js";

const money = (v) => `$${v.toFixed(2)}`;
export const cardFee = (fee, amount) => (amount > 0 ? Math.max(fee.minimum, Math.round(amount * fee.rate * 100) / 100) : 0);
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const longDay = (d) => d.toLocaleDateString("en-US", { weekday: "short", month: "long", day: "numeric" });
const tel = (n) => `tel:${n.replace(/[^0-9]/g, "")}`;

/** Primary actions: pay online + pay by phone. */
export function payButtons(u, { compact = false } = {}) {
  return h("div", { class: `ub-pay${compact ? " compact" : ""}` },
    h("a", { class: "ub-btn primary", href: u.portal, target: "_blank", rel: "noopener" },
      h("span", { "aria-hidden": "true" }, "💳"), h("span", {}, h("b", {}, "Pay online"), compact ? null : h("small", {}, "billpay.kannapolisnc.gov"))),
    h("a", { class: "ub-btn", href: tel(u.phones.pay_by_phone), "aria-label": `Pay by phone: call ${u.phones.pay_by_phone}` },
      h("span", { "aria-hidden": "true" }, "☎"), h("span", {}, h("b", {}, compact ? "Pay by phone" : u.phones.pay_by_phone), h("small", {}, compact ? u.phones.pay_by_phone : "Automated pay-by-phone line"))));
}

export function feeLine(u) {
  return h("p", { class: "ub-fee-line" }, h("b", {}, "Card: "), `${(u.card_fee.rate * 100).toFixed(2)}% fee (min ${money(u.card_fee.minimum)})`, " · ", h("b", {}, "Bank account: free"));
}

export function renderUtility(u) {
  const root = document.getElementById("utility-body");
  const t = u.terms, fee = u.card_fee;

  // Card-fee calculator
  const amt = h("input", { type: "text", inputmode: "decimal", value: "85.00", "aria-label": "Your bill amount in dollars", class: "ub-input" });
  const feeOut = h("div", { class: "ub-calc-out", role: "status", "aria-live": "polite" });
  const drawFee = () => {
    const a = Number(String(amt.value).replace(/[^0-9.]/g, "")) || 0;
    const f = cardFee(fee, a);
    feeOut.replaceChildren(
      h("div", {}, h("span", {}, "By card"), h("b", {}, money(a + f)), h("small", {}, `includes a ${money(f)} fee`)),
      h("div", { class: "good" }, h("span", {}, "From your bank account"), h("b", {}, money(a)), h("small", {}, a ? `you save ${money(f)}` : "no fee")));
  };
  amt.addEventListener("input", drawFee);

  // Due-date calculator
  const bill = h("input", { type: "date", class: "ub-input", "aria-label": "Your bill date (printed on the bill)" });
  const today = new Date();
  bill.value = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
  const datesOut = h("ol", { class: "ub-timeline", role: "status", "aria-live": "polite" });
  const drawDates = () => {
    if (!bill.value) { datesOut.replaceChildren(); return; }
    const [y, m, d] = bill.value.split("-").map(Number);
    const b = new Date(y, m - 1, d);
    const rows = [
      ["Bill date", b, "Due when you receive it"],
      ["Past due", addDays(b, t.past_due_day), `Day ${t.past_due_day}: pay before this to stay current`],
      ["Late fee", addDays(b, t.late_fee_day), `${t.late_fee_rate * 100}% of current charges, up to ${usd(t.late_fee_max)}`],
      ["Service may be cut off", addDays(b, t.disconnect_day), `Day ${t.disconnect_day}, if anything is still unpaid. Call before then for a payment plan.`],
    ];
    datesOut.replaceChildren(...rows.map(([label, date, note], i) => h("li", { class: i === 3 ? "warn" : null },
      h("b", {}, label), h("span", {}, longDay(date)), h("small", {}, note))));
  };
  bill.addEventListener("input", drawDates);

  root.replaceChildren(
    payButtons(u),
    h("p", { class: "ub-tip" }, h("b", {}, "Tip: "), u.portal_tip),

    h("h3", { class: "about-h" }, "Every way to pay"),
    h("div", { class: "ub-ways" }, u.ways.map((w) => h("div", { class: "card ub-way" },
      h("b", {}, w.how), h("p", {}, w.detail),
      w.action ? h("a", { href: w.action.url, target: w.action.url.startsWith("http") ? "_blank" : null, rel: "noopener" },
        w.action.label, w.action.url.startsWith("http") ? " ↗" : "") : null))),

    h("div", { class: "grid ub-calcs" },
      h("section", { class: "card" },
        h("h3", {}, "What does paying by card cost?"),
        h("p", { class: "sub" }, `Since ${new Date(`${fee.effective}T12:00`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}, card payments carry a ${(fee.rate * 100).toFixed(2)}% fee (at least ${money(fee.minimum)}). ${fee.free_option}`),
        h("label", { class: "ub-label" }, "Your bill amount", h("span", { class: "ub-money" }, "$", amt)),
        feeOut),
      h("section", { class: "card" },
        h("h3", {}, "When is my bill late?"),
        h("p", { class: "sub" }, t.text),
        h("label", { class: "ub-label" }, "Bill date (printed on your bill)", bill),
        datesOut)),

    h("h3", { class: "about-h" }, "Need help?"),
    h("div", { class: "ub-ways" }, u.help.map((x) => h("div", { class: "card ub-way" },
      h("b", {}, x.title), h("p", {}, x.text),
      h("a", { href: x.action.url, target: x.action.url.startsWith("http") ? "_blank" : null, rel: "noopener" }, x.action.label, x.action.url.startsWith("http") ? " ↗" : "")))),

    h("div", { class: "card kpd-chief" },
      h("div", {}, h("b", {}, "Customer Service"), h("span", {}, `${u.phones.main} · ${u.email} · City Hall, 401 Laureate Way`)),
      contactButtons({ name: "Customer Service", phone: u.phones.main, email: u.email }, "City Customer Service")),

    h("p", { class: "note" }, `${u.services}. From the City's `,
      h("a", { href: u.page, target: "_blank", rel: "noopener" }, "Customer Service & Utility Billing page"),
      "; all billing fees are on the ", h("a", { href: u.fees_page, target: "_blank", rel: "noopener" }, "Finance page"),
      ". The calculators run on your device; nothing you type is sent anywhere."));
  drawFee();
  drawDates();
}
