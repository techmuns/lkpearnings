-- Local-only demo rows for `npm run db:seed:local`.
-- Idempotent: INSERT OR IGNORE keyed on the UNIQUE dedup_key.
-- These mirror the real extraction output so the live D1 path can be exercised
-- locally without running the Python ingestion.

INSERT OR IGNORE INTO earnings (
  company_name, bse_scrip_code, nse_symbol, result_type, quarter_label,
  period_end, prev_quarter_end, year_ago_quarter_end, reporting_unit,
  revenue_cr, revenue_yoy_pct, revenue_qoq_pct,
  net_profit_cr, net_profit_yoy_pct, net_profit_qoq_pct, net_profit_swing,
  ebitda_cr, ebitda_yoy_pct, ebitda_qoq_pct,
  ebitda_margin_pct, ebitda_margin_yoy_pct, ebitda_margin_qoq_pct,
  revenue_cur_cr, revenue_prevq_cr, revenue_yrago_cr,
  net_profit_cur_cr, net_profit_prevq_cr, net_profit_yrago_cr,
  ebitda_cur_cr, ebitda_prevq_cr, ebitda_yrago_cr,
  exchange, category, headline, attachment_url, source_label,
  extraction_confidence, extraction_model, bse_announcement_id, dedup_key,
  filed_at, pdf_checked
) VALUES
(
  'Davangere Sugar Company Ltd', '531055', 'DAVANGERE', 'standalone', 'Q1 FY27',
  '2026-06-30', '2026-03-31', '2025-06-30', 'Rs. in Lakhs',
  34.72, 44.2, -58.6,
  0.94, -28.0, -51.9, NULL,
  11.16, -2.0, 32.1,
  32.14, 47.30, 10.08,
  34.72, 83.86, 24.08,
  0.94, 1.95, 1.31,
  11.16, 8.45, 11.39,
  'BSE', 'Result', 'Financial Results for the Quarter ended June 30, 2026',
  'https://www.bseindia.com/xml-data/corpfiling/AttachLive/demo-davangere.pdf', 'BSE Filing',
  0.92, 'demo-seed', 'SEED0001', 'SEED0001|standalone',
  '2026-07-28T18:42:00', 1
),
(
  'Meridian Software Services Ltd', '532819', 'MERIDSOFT', 'consolidated', 'Q1 FY27',
  '2026-06-30', '2026-03-31', '2025-06-30', 'Rs in Crore',
  1284.50, 12.6, 3.4,
  212.30, 18.9, 5.1, NULL,
  305.80, 15.2, 4.8,
  23.81, 23.27, 23.50,
  1284.50, 1242.30, 1140.80,
  212.30, 201.90, 178.60,
  305.80, 291.70, 265.40,
  'BSE', 'Result', 'Consolidated Financial Results for the Quarter ended June 30, 2026',
  'https://www.bseindia.com/xml-data/corpfiling/AttachLive/demo-meridian.pdf', 'BSE Filing',
  0.95, 'demo-seed', 'SEED0002', 'SEED0002|consolidated',
  '2026-07-27T19:15:00', 1
),
(
  'Konark Infra Projects Ltd', '533308', 'KONARKINFRA', 'standalone', 'Q1 FY27',
  '2026-06-30', '2026-03-31', '2025-06-30', 'INR Million',
  148.92, 61.4, 9.2,
  6.35, NULL, NULL, 'loss->profit',
  18.74, 84.5, 21.7,
  12.58, 11.02, 11.29,
  148.92, 136.35, 92.27,
  6.35, -4.12, -2.88,
  18.74, 15.40, 10.16,
  'BSE', 'Result', 'Un-audited Financial Results for the Quarter ended 30th June 2026',
  'https://www.bseindia.com/xml-data/corpfiling/AttachLive/demo-konark.pdf', 'BSE Filing',
  0.88, 'demo-seed', 'SEED0003', 'SEED0003|standalone',
  '2026-07-26T17:05:00', 1
);
