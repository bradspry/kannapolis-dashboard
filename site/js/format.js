const nf = new Intl.NumberFormat("en-US");
const usd0 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export const num = (v) => (v == null ? "—" : nf.format(Math.round(v)));
export const usd = (v) => (v == null ? "—" : usd0.format(v));
export const pct = (v, d = 1) => (v == null ? "—" : `${v.toFixed(d)}%`);

/** Compact money: $1.3B, $134.7M, $73.8K */
export function usdCompact(v, digits = 1) {
  if (v == null) return "—";
  const a = Math.abs(v);
  const s = v < 0 ? "-" : "";
  if (a >= 1e9) return `${s}$${(a / 1e9).toFixed(digits)}B`;
  if (a >= 1e6) return `${s}$${(a / 1e6).toFixed(digits)}M`;
  if (a >= 1e4) return `${s}$${(a / 1e3).toFixed(0)}K`;
  return `${s}$${nf.format(Math.round(a))}`;
}

/** Axis ticks: full under 10,000, compact above. */
export function tickCompact(v) {
  const a = Math.abs(v);
  if (a >= 1e9) return `${+(v / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `${+(v / 1e6).toFixed(1)}M`;
  if (a >= 1e4) return `${+(v / 1e3).toFixed(0)}K`;
  return nf.format(v);
}
export const tickUsd = (v) => (v < 0 ? "-$" : "$") + tickCompact(Math.abs(v));

export const fy = (y) => `FY${String(y).slice(2)}`;
export const signedPct = (v, d = 0) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(d)}%`;
