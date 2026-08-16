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

// --- Quarter label normalization -------------------------------------------
// Many filings store a messy verbatim period ("Quarter ended June 30th,2026",
// "30-Jun-26", "For the Quarter Ended 30.06.2026"). We collapse them all to a
// single clean Indian-FY label (e.g. "Q1 FY27") for display and filtering.
const MONTH_IDX: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9,
  september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

function isoOf(y: number, mo: number, d: number): string | null {
  if (y < 100) y += 2000;
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 1990 || y > 2100) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Best-effort parse of a verbatim date string to ISO (2-digit years -> 20xx). */
export function parseDateToISO(text: string | null | undefined): string | null {
  if (!text) return null;
  const t = String(text);
  let m = /(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
  if (m) return isoOf(+m[1], +m[2], +m[3]);
  m = /\b(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})\b/.exec(t);
  if (m) {
    let a = +m[1], b = +m[2];
    const y = +m[3];
    let day: number, mo: number;
    if (a > 12 && b <= 12) { day = a; mo = b; }
    else if (b > 12 && a <= 12) { day = b; mo = a; }
    else { day = a; mo = b; } // day-first (Indian)
    return isoOf(y, mo, day);
  }
  m = /([A-Za-z]{3,9})\.?[\s-]+(\d{1,2})(?:st|nd|rd|th)?,?\s*(\d{2,4})/.exec(t);
  if (m && MONTH_IDX[m[1].toLowerCase()]) return isoOf(+m[3], MONTH_IDX[m[1].toLowerCase()], +m[2]);
  m = /(\d{1,2})(?:st|nd|rd|th)?[\s.\/-]+([A-Za-z]{3,9})\.?[\s.,\/-]+(\d{2,4})/.exec(t);
  if (m && MONTH_IDX[m[2].toLowerCase()]) return isoOf(+m[3], MONTH_IDX[m[2].toLowerCase()], +m[1]);
  return null;
}

export function deriveQuarterFromISO(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  const year = +m[1];
  const month = +m[2];
  let q: number;
  let fyEnd: number;
  if (month >= 4 && month <= 6) { q = 1; fyEnd = year + 1; }
  else if (month >= 7 && month <= 9) { q = 2; fyEnd = year + 1; }
  else if (month >= 10 && month <= 12) { q = 3; fyEnd = year + 1; }
  else { q = 4; fyEnd = year; }
  return `Q${q} FY${String(fyEnd % 100).padStart(2, "0")}`;
}

/** One clean quarter label for a row: from period_end, else an already-clean
 *  stored label, else parsed out of the messy verbatim label. Null if unknown. */
export function cleanQuarter(
  periodEnd: string | null | undefined,
  rawLabel: string | null | undefined,
): string | null {
  const fromPeriod = deriveQuarterFromISO(periodEnd);
  if (fromPeriod) return fromPeriod;
  if (rawLabel && /^Q[1-4]\s*FY\s*\d{2}$/i.test(rawLabel.trim())) {
    return rawLabel.trim().toUpperCase().replace(/\s+/g, " ");
  }
  return deriveQuarterFromISO(parseDateToISO(rawLabel));
}

/** Sort key so "Q1 FY27" ranks above "Q4 FY26" (by FY, then quarter). */
export function quarterSortKey(label: string): number {
  const m = /^Q([1-4])\s*FY(\d{2})$/i.exec(label.trim());
  if (!m) return -1;
  return +m[2] * 10 + +m[1];
}
