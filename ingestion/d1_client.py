"""Cloudflare D1 HTTP client (no SDK — plain `requests` against the REST API).

Endpoint: POST /accounts/{account}/d1/database/{db}/query with {"sql", "params"}.
Retries on 429 / 5xx with exponential backoff. Exposes the handful of operations
the ingestion needs: migrations, dedup lookups, stub-row selection, and
insert-or-update upserts keyed on the UNIQUE ``dedup_key``.
"""

from __future__ import annotations

import time
from typing import Any, Iterable

import requests

# Columns the ingestion is allowed to write (everything except id/created_at/
# updated_at, which are managed by the schema / the upsert itself).
WRITABLE_COLUMNS: tuple[str, ...] = (
    "company_name", "bse_scrip_code", "nse_symbol", "result_type", "quarter_label",
    "period_end", "prev_quarter_end", "year_ago_quarter_end", "reporting_unit",
    "revenue_cr", "revenue_yoy_pct", "revenue_qoq_pct",
    "net_profit_cr", "net_profit_yoy_pct", "net_profit_qoq_pct", "net_profit_swing",
    "ebitda_cr", "ebitda_yoy_pct", "ebitda_qoq_pct",
    "ebitda_margin_pct", "ebitda_margin_yoy_pct", "ebitda_margin_qoq_pct",
    "revenue_cur_cr", "revenue_prevq_cr", "revenue_yrago_cr",
    "net_profit_cur_cr", "net_profit_prevq_cr", "net_profit_yrago_cr",
    "ebitda_cur_cr", "ebitda_prevq_cr", "ebitda_yrago_cr",
    "exchange", "category", "headline", "attachment_url", "source_label",
    "raw_text", "extraction_confidence", "extraction_model", "bse_announcement_id",
    "dedup_key", "filed_at", "pdf_checked",
)

_IGNORABLE = ("already exists", "duplicate column")


class D1Client:
    def __init__(self, account_id: str, database_id: str, api_token: str) -> None:
        self.url = (
            f"https://api.cloudflare.com/client/v4/accounts/{account_id}"
            f"/d1/database/{database_id}/query"
        )
        self.session = requests.Session()
        self.headers = {
            "Authorization": f"Bearer {api_token}",
            "Content-Type": "application/json",
        }

    # ---- low-level ---------------------------------------------------------
    def _post(self, sql: str, params: list[Any] | None) -> dict[str, Any]:
        payload: dict[str, Any] = {"sql": sql}
        if params is not None:
            payload["params"] = params
        last_err: Exception | None = None
        for attempt in range(5):
            try:
                r = self.session.post(self.url, json=payload, headers=self.headers, timeout=45)
            except requests.RequestException as exc:
                last_err = exc
                time.sleep(min(2 ** attempt, 16))
                continue
            if r.status_code == 429 or r.status_code >= 500:
                last_err = RuntimeError(f"D1 HTTP {r.status_code}")
                time.sleep(min(2 ** attempt, 16))
                continue
            try:
                return r.json()
            except ValueError as exc:
                raise RuntimeError(f"D1 returned non-JSON (HTTP {r.status_code})") from exc
        raise RuntimeError(f"D1 request failed after retries: {last_err}")

    def query(self, sql: str, params: list[Any] | None = None) -> list[dict[str, Any]]:
        data = self._post(sql, params)
        if not data.get("success", False):
            raise RuntimeError(f"D1 error: {data.get('errors')}")
        result = data.get("result") or []
        if result and isinstance(result, list):
            return result[0].get("results") or []
        return []

    # ---- migrations --------------------------------------------------------
    def apply_migration_sql(self, sql_text: str) -> None:
        """Run each statement in a migration file idempotently.

        Comment lines (full-line and trailing ``-- …``) are stripped FIRST so a
        leading comment block can't get glued to — and swallow — the statement
        that follows it. `CREATE TABLE/INDEX IF NOT EXISTS` never errors; for
        future migrations that ADD COLUMN, "already exists" / "duplicate column"
        errors are swallowed so the DB self-migrates with no manual step.
        """
        code_lines: list[str] = []
        for line in sql_text.splitlines():
            code = line.split("--", 1)[0]  # migrations contain no '--' inside literals
            if code.strip():
                code_lines.append(code)
        cleaned = "\n".join(code_lines)

        for raw in cleaned.split(";"):
            stmt = raw.strip()
            if not stmt:
                continue
            data = self._post(stmt, None)
            if data.get("success", False):
                continue
            msg = str(data.get("errors") or "").lower()
            if any(tok in msg for tok in _IGNORABLE):
                continue
            raise RuntimeError(f"D1 migration statement failed: {data.get('errors')}")

    # ---- reads -------------------------------------------------------------
    def existing_dedup_keys(self) -> set[str]:
        rows = self.query("SELECT dedup_key FROM earnings")
        return {r["dedup_key"] for r in rows if r.get("dedup_key")}

    def existing_base_keys(self) -> set[str]:
        """Base keys (the ``<NEWSID>`` before ``|<result_type>``) so Phase 1 can
        skip filings we've already inserted a stub or final rows for."""
        return {k.rsplit("|", 1)[0] for k in self.existing_dedup_keys()}

    def rows_needing_pdf(self, limit: int) -> list[dict[str, Any]]:
        return self.query(
            "SELECT * FROM earnings WHERE pdf_checked = 0 "
            "ORDER BY (filed_at IS NULL) ASC, filed_at DESC, id DESC LIMIT ?",
            [int(limit)],
        )

    # ---- writes ------------------------------------------------------------
    def upsert_earnings(self, row: dict[str, Any]) -> None:
        cols = [c for c in WRITABLE_COLUMNS if c in row]
        if "dedup_key" not in cols:
            raise ValueError("upsert_earnings requires a dedup_key")
        placeholders = ", ".join("?" for _ in cols)
        col_sql = ", ".join(cols)
        updates = ", ".join(f"{c}=excluded.{c}" for c in cols if c != "dedup_key")
        sql = (
            f"INSERT INTO earnings ({col_sql}) VALUES ({placeholders}) "
            f"ON CONFLICT(dedup_key) DO UPDATE SET {updates}, updated_at=datetime('now')"
        )
        self.query(sql, [row[c] for c in cols])

    def update_earnings(self, dedup_key: str, fields: dict[str, Any]) -> None:
        cols = [c for c in WRITABLE_COLUMNS if c in fields and c != "dedup_key"]
        if not cols:
            return
        set_sql = ", ".join(f"{c}=?" for c in cols)
        sql = f"UPDATE earnings SET {set_sql}, updated_at=datetime('now') WHERE dedup_key=?"
        self.query(sql, [fields[c] for c in cols] + [dedup_key])

    def delete_by_dedup_key(self, dedup_key: str) -> None:
        self.query("DELETE FROM earnings WHERE dedup_key=?", [dedup_key])

    def count_rows(self) -> int:
        rows = self.query("SELECT COUNT(*) AS n FROM earnings")
        return int(rows[0]["n"]) if rows else 0

    def insert_stub_if_absent(self, base_keys: Iterable[str], row: dict[str, Any]) -> bool:
        """Insert a Phase-1 stub row unless a row for this base key already
        exists. Returns True if a stub was inserted."""
        base = str(row["dedup_key"]).rsplit("|", 1)[0]
        if base in set(base_keys):
            return False
        self.upsert_earnings(row)
        return True
