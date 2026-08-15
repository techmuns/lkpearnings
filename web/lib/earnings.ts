import { getCloudflareContext } from "@opennextjs/cloudflare";
import { MOCK_EARNINGS } from "./mockData";

export type ResultType = "standalone" | "consolidated";

/**
 * One dashboard row = one (BSE filing x result_type). A filing that publishes
 * both a Standalone and a Consolidated statement yields two rows. Mirrors the
 * `earnings` D1 table 1:1 (see db/migrations/0001_init.sql).
 */
export interface EarningsRow {
  id: number;
  company_name: string;
  bse_scrip_code: string | null;
  nse_symbol: string | null;
  result_type: ResultType | null;
  quarter_label: string | null;
  period_end: string | null;
  prev_quarter_end: string | null;
  year_ago_quarter_end: string | null;
  reporting_unit: string | null;

  revenue_cr: number | null;
  revenue_yoy_pct: number | null;
  revenue_qoq_pct: number | null;

  net_profit_cr: number | null;
  net_profit_yoy_pct: number | null;
  net_profit_qoq_pct: number | null;
  net_profit_swing: string | null;

  ebitda_cr: number | null;
  ebitda_yoy_pct: number | null;
  ebitda_qoq_pct: number | null;

  // Margin LEVELS for the three periods (not deltas): current / year-ago /
  // prev-quarter — this is what the client's WhatsApp "Margins:" line shows.
  ebitda_margin_pct: number | null;
  ebitda_margin_yoy_pct: number | null;
  ebitda_margin_qoq_pct: number | null;

  // Raw per-period figures (Rs crore) kept as evidence for the detail modal.
  revenue_cur_cr: number | null;
  revenue_prevq_cr: number | null;
  revenue_yrago_cr: number | null;
  net_profit_cur_cr: number | null;
  net_profit_prevq_cr: number | null;
  net_profit_yrago_cr: number | null;
  ebitda_cur_cr: number | null;
  ebitda_prevq_cr: number | null;
  ebitda_yrago_cr: number | null;

  exchange: string;
  category: string | null;
  headline: string | null;
  attachment_url: string | null;
  source_label: string | null;
  raw_text: string | null;
  extraction_confidence: number | null;
  extraction_model: string | null;
  bse_announcement_id: string | null;
  dedup_key: string;
  filed_at: string | null;
  pdf_checked: number;
  created_at: string;
  updated_at: string;
}

export interface EarningsData {
  rows: EarningsRow[];
  live: boolean;
}

// --- Minimal, local D1 shape ------------------------------------------------
// We deliberately DON'T import @cloudflare/workers-types: its global `Response`
// / DOM typings clash with Next's DOM lib. This is all getEarnings() needs.
interface D1Result<T> {
  results?: T[];
}
interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
}
interface D1DatabaseLike {
  prepare(query: string): D1PreparedStatement;
}

const SELECT_SQL = `
  SELECT *
  FROM earnings
  ORDER BY (filed_at IS NULL) ASC, filed_at DESC, id DESC
  LIMIT 2000
`;

/**
 * Reads earnings rows from the bound D1 database (`DB`). If the binding is
 * absent (e.g. local `next dev`) or the read fails for any reason, we fall back
 * to demo data so the dashboard always renders. `live` drives the header badge.
 */
export async function getEarnings(): Promise<EarningsData> {
  try {
    const { env } = await getCloudflareContext({ async: true });
    const db = (env as unknown as { DB?: D1DatabaseLike }).DB;
    if (!db) {
      return { rows: MOCK_EARNINGS, live: false };
    }
    const res = await db.prepare(SELECT_SQL).all<EarningsRow>();
    return { rows: res.results ?? [], live: true };
  } catch {
    return { rows: MOCK_EARNINGS, live: false };
  }
}
