"""lkpearnings ingestion entrypoint.

Two phases:
  Phase 1 — fetch new BSE Financial-Results filings for the date window and
            insert stub rows (company, scrip, headline, PDF url, filed_at).
  Phase 2 — for rows not yet pdf_checked (capped by INGEST_LIMIT), read the
            result PDF -> LLM extract verbatim numbers -> financials.py derive
            EBITDA/margins/YoY/QoQ in code -> upsert one row per result_type.

Safety:
  * Prints a readiness check (presence only, never secret values).
  * Runs in DRY-RUN (no writes) when the D1 secrets are absent.
  * Never lets one bad PDF crash the run; migrations self-apply idempotently.
"""

from __future__ import annotations

import glob
import os
import sys
import traceback
from typing import Any

import bse_client
from config import Config, load_config
from d1_client import D1Client
from financials import derive_result
from llm_provider import get_llm_client

MIGRATIONS_DIR = os.path.join(os.path.dirname(__file__), "..", "db", "migrations")

# Static columns carried from a stub into each derived result row.
_STUB_CARRY = (
    "company_name", "bse_scrip_code", "nse_symbol", "exchange", "category",
    "headline", "attachment_url", "source_label", "filed_at", "bse_announcement_id",
)


def log(msg: str = "") -> None:
    print(msg, flush=True)


# --------------------------------------------------------------------------- #
def print_readiness(cfg: Config) -> None:
    log("=" * 66)
    log("  lkpearnings ingestion — BSE Financial Results")
    log("=" * 66)
    log(f"  LLM provider      : {cfg.llm_provider}")
    log(f"  Ingest window     : {cfg.ingest_days} day(s)  (from/to overrides: "
        f"{'set' if cfg.ingest_from_date or cfg.ingest_to_date else 'none'})")
    log(f"  PDF read limit    : {cfg.ingest_limit}   max pages/run: {cfg.ingest_max_pages}")
    log("  Environment readiness (presence only — values are never printed):")
    for name, present, required in cfg.readiness():
        tag = "required" if required else "optional"
        mark = "OK " if present else ("MISSING" if required else "—  ")
        log(f"    [{mark}] {name}  ({tag})")
    if cfg.dry_run:
        log("")
        log("  >> DRY-RUN: D1 credentials absent — will fetch & log but NOT write.")
    log("=" * 66)


def apply_migrations(d1: D1Client) -> None:
    files = sorted(glob.glob(os.path.join(MIGRATIONS_DIR, "*.sql")))
    if not files:
        log("  (no migration files found)")
        return
    for path in files:
        with open(path, "r", encoding="utf-8") as fh:
            sql = fh.read()
        d1.apply_migration_sql(sql)
        log(f"  applied migration: {os.path.basename(path)}")


def build_stub(filing: dict[str, Any]) -> dict[str, Any]:
    base = bse_client.base_dedup_key(filing)
    return {
        "company_name": filing["company_name"],
        "bse_scrip_code": filing.get("bse_scrip_code"),
        "nse_symbol": None,
        "exchange": "BSE",
        "category": filing.get("category") or "Result",
        "headline": filing.get("headline"),
        "attachment_url": filing.get("attachment_url"),
        "source_label": "BSE Filing",
        "filed_at": filing.get("filed_at"),
        "bse_announcement_id": filing.get("newsid"),
        "result_type": None,
        "dedup_key": f"{base}|pending",
        "pdf_checked": 0,
    }


def _read_pdf_text(firecrawl: Any, url: str) -> str | None:
    """Try AttachLive, then AttachHis, for the PDF -> markdown."""
    text = firecrawl.scrape_pdf(url)
    if text:
        return text
    if "AttachLive" in url:
        text = firecrawl.scrape_pdf(url.replace("AttachLive", "AttachHis"))
    return text or None


def process_stub(stub: dict[str, Any], d1: D1Client, firecrawl: Any, llm: Any) -> str:
    key = stub["dedup_key"]
    url = stub.get("attachment_url")
    if not url:
        d1.update_earnings(key, {"pdf_checked": 1, "extraction_confidence": 0.0})
        return "no-url"

    text = _read_pdf_text(firecrawl, url)
    if not text:
        d1.update_earnings(key, {"pdf_checked": 1, "extraction_confidence": 0.0})
        return "no-pdf"

    raw_text = text[:20000]
    extraction = llm.extract(text)
    if not extraction.results:
        d1.update_earnings(
            key,
            {
                "pdf_checked": 1,
                "raw_text": raw_text,
                "extraction_model": extraction.model,
                "extraction_confidence": 0.0,
            },
        )
        return f"no-extract ({extraction.error})"

    base = key.rsplit("|", 1)[0]
    static = {k: stub.get(k) for k in _STUB_CARRY}
    produced: list[str] = []
    for result in extraction.results:
        derived = derive_result(result)
        rtype = derived.get("result_type") or "unknown"
        final_key = f"{base}|{rtype}"
        row = {
            **static,
            **derived,
            "dedup_key": final_key,
            "raw_text": raw_text,
            "extraction_model": extraction.model,
            "pdf_checked": 1,
        }
        d1.upsert_earnings(row)
        produced.append(final_key)

    # Remove the now-superseded pending stub (unless a result reused its key).
    if key not in produced:
        d1.delete_by_dedup_key(key)
    return "ok -> " + ", ".join(p.rsplit("|", 1)[-1] for p in produced)


# --------------------------------------------------------------------------- #
def run() -> int:
    cfg = load_config()
    print_readiness(cfg)

    scrapedo = None
    if cfg.scrapedo_api_key:
        from scrapedo_client import ScrapeDoClient

        scrapedo = ScrapeDoClient(cfg.scrapedo_api_key)
    firecrawl = None
    if cfg.has_firecrawl:
        from firecrawl_client import FirecrawlClient

        firecrawl = FirecrawlClient(cfg.firecrawl_api_key)  # type: ignore[arg-type]

    d1 = None
    if cfg.has_d1:
        d1 = D1Client(cfg.cf_account_id, cfg.cf_d1_database_id, cfg.cf_api_token)  # type: ignore[arg-type]
        log("\n[migrate] applying D1 migrations…")
        try:
            apply_migrations(d1)
        except Exception as exc:  # a broken schema is fatal
            log(f"  ERROR applying migrations: {exc}")
            return 1

    # ---- Phase 1: fetch filings + insert stubs ----
    log("\n[phase 1] fetching BSE Financial-Results filings…")
    try:
        filings, stats = bse_client.fetch_new_filings(cfg, scrapedo, firecrawl, log=log)
    except Exception as exc:
        log(f"  ERROR during fetch: {exc}")
        filings, stats = [], {"error": str(exc)}
    log(f"  fetch stats: {stats}")

    inserted = 0
    if d1 is not None:
        try:
            base_keys = d1.existing_base_keys()
        except Exception as exc:
            log(f"  ERROR reading existing keys: {exc}")
            base_keys = set()
        for filing in filings:
            try:
                if d1.insert_stub_if_absent(base_keys, build_stub(filing)):
                    base_keys.add(bse_client.base_dedup_key(filing))
                    inserted += 1
            except Exception as exc:
                log(f"  ! stub insert failed for {filing.get('company_name')}: {exc}")
        log(f"  inserted {inserted} new stub row(s); {len(filings) - inserted} already known")
    else:
        log(f"  DRY-RUN: would insert up to {len(filings)} stub row(s). Sample:")
        for filing in filings[:5]:
            log(f"    - {filing['company_name']} [{filing.get('bse_scrip_code')}] "
                f"{filing.get('filed_at')}  {(filing.get('headline') or '')[:70]}")

    # ---- Phase 2: read PDFs -> extract -> derive -> upsert ----
    log("\n[phase 2] reading result PDFs + extracting…")
    if d1 is None:
        log("  DRY-RUN: skipping PDF reads / writes.")
    elif not cfg.can_read_pdfs:
        missing = []
        if not cfg.has_firecrawl:
            missing.append("FIRECRAWL_API_KEY")
        if not cfg.has_llm:
            missing.append(f"LLM key [{cfg.llm_provider}]")
        log(f"  skipping — missing {', '.join(missing)} (need Firecrawl + an LLM key).")
    else:
        llm = get_llm_client(cfg)
        try:
            todo = d1.rows_needing_pdf(cfg.ingest_limit)
        except Exception as exc:
            log(f"  ERROR selecting rows: {exc}")
            todo = []
        log(f"  {len(todo)} row(s) need a PDF read (limit {cfg.ingest_limit}).")
        done = 0
        for stub in todo:
            name = stub.get("company_name", "?")
            try:
                outcome = process_stub(stub, d1, firecrawl, llm)
                done += 1
                log(f"    [{done}/{len(todo)}] {name}: {outcome}")
            except Exception as exc:
                log(f"    ! {name}: unexpected error: {exc}")
                traceback.print_exc()
                try:  # ensure we don't re-pay for this PDF next run
                    d1.update_earnings(stub["dedup_key"], {"pdf_checked": 1})
                except Exception:
                    pass

    # ---- Summary ----
    log("\n[done]")
    if d1 is not None:
        try:
            log(f"  earnings rows in D1: {d1.count_rows()}")
        except Exception:
            pass
    else:
        log("  DRY-RUN complete — no writes performed.")
    return 0


def main() -> int:
    try:
        return run()
    except KeyboardInterrupt:
        return 130
    except Exception as exc:  # never crash hard; log and exit non-zero for CI
        log(f"FATAL: {exc}")
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(main())
