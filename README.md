# Earnings Tracker — LKP Securities

Automated **BSE quarterly financial-results** dashboard. Every time an Indian
listed company files a quarterly result on BSE, we detect it automatically, read
the result PDF, extract the key numbers, and show each company as a row —
**Revenue, Net Profit, EBITDA and EBITDA Margin**, each with **YoY and QoQ**
change, newest first. Refreshed **twice a day**. Every number links back to the
original BSE filing (source- and evidence-backed, never a black box).

It mirrors the WhatsApp earnings-snapshot format the client already uses:

> **DAVANGERE SUGAR COMPANY — Q1**
> ST Net Profit: Rs 0.94 Cr down 28.0% YoY, down 51.9% QoQ
> Revenue: Rs 34.72 Cr up 44.2% YoY, down 58.6% QoQ
> EBITDA: Rs 11.16 Cr down 2.0% YoY, up 32.1% QoQ
> Margins: 32.1% vs 47.3% YoY, 10.1% QoQ

---

## How it works

```
                 ┌────────────────────── GitHub Actions (twice daily) ──────────────────────┐
                 │                                                                            │
   BSE public    │   bse_client         firecrawl          llm_provider        financials    │      Cloudflare D1
   announcements ├─▶ fetch Result   ─▶  scrape_pdf()   ─▶   extract verbatim ─▶ derive in ───▶│─────▶  (earnings table)
   JSON API      │   filings (PDF)      PDF → markdown      numbers (JSON)      code (crore,   │            ▲
                 │   direct→proxy→                          Claude/OpenAI       EBITDA, YoY…)  │            │  DB binding
                 │   firecrawl                                                                 │            │  (read-only)
                 └────────────────────────────────────────────────────────────────────────────┘            │
                                                                                                     Next.js dashboard
                                                                                              (Cloudflare Workers / OpenNext)
```

### The extract-then-compute-in-code philosophy (important)

The LLM **only reads numbers that literally appear in the PDF**. Every derived
quantity — unit conversion, EBITDA, margins, YoY, QoQ, the quarter label — is
computed in **plain Python** (`ingestion/financials.py`) from those verbatim
numbers. **We never store a number the model invented.** If the reporting unit
or a period is unreadable, we store nulls / low confidence and the UI shows
`—`; we never guess.

- **EBITDA (operating):** `revenue_from_operations − (total_expenses − finance_costs − depreciation)`, with the equivalent fallback `profit_before_tax + finance_costs + depreciation − other_income`. Both exclude other income.
- **EBITDA margin:** `EBITDA / revenue × 100` (null when revenue ≤ 0, e.g. banks/NBFCs).
- **YoY / QoQ:** `(current − base) / |base| × 100`; a net-profit sign flip is flagged (`loss→profit` / `profit→loss`) so the UI shows a turnaround label instead of a misleading %.
- **Quarter label:** derived from the current period-end (Apr–Jun = Q1 … Jan–Mar = Q4; `2026-06-30 → Q1 FY27`).

Both a **Standalone** and a **Consolidated** statement are extracted when both
are present. Each filing yields up to two rows (one per `result_type`), and the
dashboard defaults to **Standalone** to match the client's "ST" format, with
**Consolidated** one click away.

---

## Tech stack

| Part | Stack |
| --- | --- |
| `web/` | Next.js 16 (App Router, TS, Tailwind v4) → Cloudflare Workers via OpenNext (`@opennextjs/cloudflare`). Reads D1 through the `DB` binding. |
| `ingestion/` | Python 3.11 on GitHub Actions. `requests` only — calls BSE, Firecrawl, the LLM, and the D1 REST API directly (no SDKs). |
| `db/` | Shared D1 (SQLite) schema + migrations + local seed. |

The dashboard is **light, colorful and visual-heavy** (not a dark terminal
look): gradient header, LKP logo chip, KPI stat tiles, a colored table with a
per-row accent, Cards/Table toggle, a click-through detail modal, client-side
filters, and a dependency-free **Excel export**.

### Repo layout

```
.
├── web/                      # Next.js 16 + OpenNext dashboard (reads D1)
│   ├── app/                  # layout, page (force-dynamic), globals.css
│   ├── components/           # Card, Badge, StatTile, EarningsTable/Modal/Explorer
│   ├── lib/                  # earnings (D1 read + demo fallback), format, excel, …
│   ├── next.config.ts        # initOpenNextCloudflareForDev()
│   ├── open-next.config.ts   # defineCloudflareConfig()
│   └── wrangler.jsonc        # local dev / migrate / seed  (name: lkpearnings)
├── ingestion/                # Python: BSE → PDF → LLM → derive → D1
│   ├── main.py               # two-phase entrypoint (self-migrates, DRY-RUN safe)
│   ├── bse_client.py         # BSE Result-category reader + fetcher chain
│   ├── firecrawl_client.py   # PDF → markdown + browser JSON fallback
│   ├── scrapedo_client.py    # residential proxy fallback
│   ├── llm_provider.py       # provider toggle + shared prompt / JSON parsing
│   ├── claude_client.py      # Claude via Bedrock Converse REST
│   ├── openai_client.py      # OpenAI Chat Completions
│   ├── financials.py         # ALL the math (pure functions)
│   ├── d1_client.py          # D1 HTTP client (upsert on dedup_key)
│   ├── config.py             # typed env snapshot (never logs values)
│   └── .env.example          # every env var name (no values)
├── db/
│   ├── migrations/0001_init.sql
│   └── seed.sql              # ~3 demo rows for local seeding
├── wrangler.jsonc            # ROOT config — used by Cloudflare Workers Builds
└── .github/workflows/ingest.yml
```

---

## One-time setup

### 1. Create the D1 database and paste its id in three places

```bash
cd web
npm install
npx wrangler d1 create lkpearnings
```

Wrangler prints a `database_id`. Paste it (replacing `REPLACE_WITH_D1_DATABASE_ID`) into:

1. **`web/wrangler.jsonc`** → `d1_databases[0].database_id`
2. **`wrangler.jsonc`** (repo root) → `d1_databases[0].database_id`
3. The **`CF_D1_DATABASE_ID`** GitHub Actions secret (below)

Then apply the schema to the remote DB:

```bash
npm run db:migrate:remote      # from web/  (the ingestion also self-migrates)
```

> The **worker name and the D1 database name are both `lkpearnings`**, kept in
> sync across the two wrangler configs.

### 2. Deploy the dashboard (Cloudflare Workers Builds)

Connect the repo in the Cloudflare dashboard (Workers & Pages → Builds / git
integration). The **root `wrangler.jsonc`** drives the build: it runs
`npm ci && opennextjs-cloudflare build` inside `web/` and serves
`web/.open-next/worker.js` with the `DB` binding. No manual deploy step from
your side.

> The dashboard needs **no API keys** — it only *reads* D1 via the `DB` binding.
> All the extraction keys live in GitHub Actions, never in the web app.

### 3. GitHub Actions secrets

Add these under **Settings → Secrets and variables → Actions**:

| Secret | Required | Purpose |
| --- | --- | --- |
| `CF_ACCOUNT_ID` | ✅ | Cloudflare account id (D1 REST writes) |
| `CF_D1_DATABASE_ID` | ✅ | The `lkpearnings` D1 database id |
| `CF_API_TOKEN` | ✅ | Cloudflare API token with **D1 edit** permission |
| `FIRECRAWL_API_KEY` | ✅ | Firecrawl (result PDF → markdown) |
| `CLAUDE_BEDROCK_API_KEY` | ✅ (default provider) | Bedrock API key (bearer) for Claude |
| `CLAUDE_BEDROCK_REGION` | ⬜ | Bedrock region (default `us-east-1`) |
| `CLAUDE_BEDROCK_MODEL_ID` | ⬜ | Model id (default `us.anthropic.claude-sonnet-4-5-20250929-v1:0`) |
| `OPENAI_API_KEY` | ⬜ | Only if you switch `LLM_PROVIDER=openai` |
| `OPENAI_MODEL` | ⬜ | OpenAI model (default `gpt-4o-mini`) |
| `SCRAPEDO_API_KEY` | ⬜ | Optional residential-proxy fallback for the BSE API |

Optional repo **variable**: `INGEST_MAX_PAGES` (default `60`).

> If the D1 secrets are absent the workflow still runs — as a safe **DRY-RUN**
> that fetches and logs but writes nothing.

---

## Automation cadence

`.github/workflows/ingest.yml` runs **twice a day** and on demand:

- `0 16 * * *` — **21:30 IST**, catches the evening post-close results surge.
- `0 3 * * *` — **08:30 IST**, sweeps overnight/late-night filings.

With `INGEST_DAYS=2` the two runs overlap so nothing is missed; dedup on
`dedup_key` keeps re-runs idempotent. `INGEST_LIMIT` (default 15) caps how many
PDFs are read per run as a cost guard.

---

## Local development

### Dashboard (`web/`)

```bash
cd web
npm install
npm run dev            # http://localhost:3000  — shows "Demo data" (mock rows)
```

Without a bound D1, the app renders demo data with a **Demo data** badge. To run
against a real local D1:

```bash
npm run db:migrate:local
npm run db:seed:local   # loads db/seed.sql (~3 rows)
npm run preview         # OpenNext build + local worker with the DB binding -> "Live"
```

Build check (matches CI acceptance):

```bash
npm run build           # clean Next build, no type errors
```

### Ingestion (`ingestion/`)

```bash
cd ingestion
pip install -r requirements.txt
cp .env.example .env    # fill in keys for a real run; leave blank for DRY-RUN
python main.py
```

With no secrets set, `main.py` prints a readiness check, runs a **DRY-RUN** (no
writes), and exits 0. With secrets set it fetches recent BSE Financial-Results
filings, reads each PDF, extracts the numbers, computes everything in code, and
upserts one row per `(filing × result_type)` — idempotent on re-run.

Useful env overrides: `INGEST_DAYS`, `INGEST_LIMIT`, `INGEST_MAX_PAGES`,
`INGEST_FROM_DATE` / `INGEST_TO_DATE` (YYYYMMDD or YYYY-MM-DD), `LLM_PROVIDER`.

---

## Notes & assumptions

- **Bedrock model id** — `us.anthropic.claude-sonnet-4-5-20250929-v1:0` is an
  assumption; confirm the exact inference-profile / model id enabled in your AWS
  account and region, and set `CLAUDE_BEDROCK_MODEL_ID` if it differs.
- **Data source** — BSE's public announcements JSON API, filtered to
  `strCat=Result` / `subcategory=Financial Results`, queried one day at a time
  with browser-like headers. The result PDF is always the source of truth.
- **Not investment advice** — figures are auto-extracted; every row links to its
  source PDF so numbers can be verified against the filing.
