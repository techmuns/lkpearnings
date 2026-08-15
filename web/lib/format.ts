/**
 * Deterministic formatters — no `toLocaleString`, no `new Date()` — so the
 * server-rendered HTML and the client hydration always agree (no locale drift,
 * no hydration mismatch).
 */

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export type Tone = "up" | "down" | "flat" | "none";

function isNum(v: number | null | undefined): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/** International thousands grouping, e.g. 12845.5 -> "12,845.50". */
export function formatNumber(value: number, decimals: number): string {
  const sign = value < 0 ? "-" : "";
  const fixed = Math.abs(value).toFixed(decimals);
  const [intPart, decPart] = fixed.split(".");
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return sign + (decPart ? `${grouped}.${decPart}` : grouped);
}

/** Rupee-crore value. 2 decimals for >=1 Cr, finer for sub-crore amounts. */
export function formatCrore(value: number | null | undefined): string {
  if (!isNum(value)) return "—";
  const abs = Math.abs(value);
  const decimals = abs >= 1 ? 2 : abs >= 0.01 ? 3 : 4;
  return `₹${formatNumber(value, decimals)} Cr`;
}

/** Plain crore number without the unit (for tables / modal grids). */
export function formatCroreBare(value: number | null | undefined): string {
  if (!isNum(value)) return "—";
  const abs = Math.abs(value);
  const decimals = abs >= 1 ? 2 : abs >= 0.01 ? 3 : 4;
  return formatNumber(value, decimals);
}

/** Percentage level, e.g. 32.14 -> "32.1%". */
export function formatPct(value: number | null | undefined, decimals = 1): string {
  if (!isNum(value)) return "—";
  return `${formatNumber(value, decimals)}%`;
}

/** Signed change percent, e.g. -58.6 -> "58.6%" (sign conveyed by arrow/color). */
export function formatChangePct(value: number | null | undefined, decimals = 1): string {
  if (!isNum(value)) return "—";
  return `${formatNumber(Math.abs(value), decimals)}%`;
}

export function toneOf(value: number | null | undefined): Tone {
  if (!isNum(value)) return "none";
  if (value > 0.05) return "up";
  if (value < -0.05) return "down";
  return "flat";
}

/** "2026-06-30" or "2026-06-30T18:42:00" -> "30 Jun 2026". */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const [, y, mo, d] = m;
  const month = MONTHS[parseInt(mo, 10) - 1] ?? mo;
  return `${parseInt(d, 10)} ${month} ${y}`;
}

/** "2026-06-30T18:42:00" -> "30 Jun 2026, 18:42". */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(iso);
  if (!m) return formatDate(iso);
  const [, y, mo, d, hh, mm] = m;
  const month = MONTHS[parseInt(mo, 10) - 1] ?? mo;
  return `${parseInt(d, 10)} ${month} ${y}, ${hh}:${mm}`;
}

/** Milliseconds between an ISO timestamp and a reference "now" ISO string. */
export function daysSince(iso: string | null | undefined, nowIso: string): number | null {
  if (!iso) return null;
  const a = Date.parse(iso);
  const b = Date.parse(nowIso);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.floor((b - a) / 86_400_000);
}

export function titleCaseResultType(rt: string | null | undefined): string {
  if (rt === "standalone") return "Standalone";
  if (rt === "consolidated") return "Consolidated";
  return "—";
}
