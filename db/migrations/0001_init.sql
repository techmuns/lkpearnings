-- lkpearnings — BSE Financial Results dashboard
-- D1 (SQLite dialect) schema. One row per (filing x result_type), so a filing
-- carrying both a Standalone and a Consolidated statement produces two rows,
-- distinguished by result_type and by a dedup_key that embeds the result_type.

CREATE TABLE IF NOT EXISTS earnings (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  company_name           TEXT NOT NULL,
  bse_scrip_code         TEXT,
  nse_symbol             TEXT,
  result_type            TEXT,                 -- 'standalone' | 'consolidated'
  quarter_label          TEXT,                 -- e.g. 'Q1 FY27'
  period_end             TEXT,                 -- ISO date of current quarter end
  prev_quarter_end       TEXT,
  year_ago_quarter_end   TEXT,
  reporting_unit         TEXT,                 -- verbatim unit read from the PDF
  revenue_cr             REAL,
  revenue_yoy_pct        REAL,
  revenue_qoq_pct        REAL,
  net_profit_cr          REAL,
  net_profit_yoy_pct     REAL,
  net_profit_qoq_pct     REAL,
  net_profit_swing       TEXT,                 -- 'loss->profit' | 'profit->loss' | NULL
  ebitda_cr              REAL,
  ebitda_yoy_pct         REAL,
  ebitda_qoq_pct         REAL,
  ebitda_margin_pct      REAL,
  ebitda_margin_yoy_pct  REAL,
  ebitda_margin_qoq_pct  REAL,
  revenue_cur_cr REAL, revenue_prevq_cr REAL, revenue_yrago_cr REAL,
  net_profit_cur_cr REAL, net_profit_prevq_cr REAL, net_profit_yrago_cr REAL,
  ebitda_cur_cr REAL, ebitda_prevq_cr REAL, ebitda_yrago_cr REAL,
  exchange               TEXT NOT NULL DEFAULT 'BSE',
  category               TEXT,
  headline               TEXT,
  attachment_url         TEXT,
  source_label           TEXT DEFAULT 'BSE Filing',
  raw_text               TEXT,
  extraction_confidence  REAL,
  extraction_model       TEXT,
  bse_announcement_id    TEXT,
  dedup_key              TEXT NOT NULL UNIQUE,
  filed_at               TEXT,
  pdf_checked            INTEGER NOT NULL DEFAULT 0,
  created_at             TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at             TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_earnings_filed_at ON earnings (filed_at DESC);
CREATE INDEX IF NOT EXISTS idx_earnings_scrip    ON earnings (bse_scrip_code);
CREATE INDEX IF NOT EXISTS idx_earnings_period   ON earnings (period_end);
