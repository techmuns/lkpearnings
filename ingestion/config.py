"""Typed environment snapshot for the ingestion run.

Reads every knob from the environment ONCE and exposes it as a frozen dataclass.
Crucially, this module never logs a secret's *value* — only whether it is present
(see `readiness()` and `main.py`). Load with `load_config()`.
"""

from __future__ import annotations

import os
from dataclasses import dataclass

try:  # optional: local .env support, never required in CI
    from dotenv import load_dotenv

    load_dotenv()
except Exception:  # pragma: no cover - dotenv is optional
    pass


def _get(name: str, default: str | None = None) -> str | None:
    raw = os.environ.get(name)
    if raw is None:
        return default
    raw = raw.strip()
    return raw if raw != "" else default


def _get_int(name: str, default: int) -> int:
    raw = _get(name)
    if raw is None:
        return default
    try:
        return int(raw)
    except ValueError:
        return default


@dataclass(frozen=True)
class Config:
    # --- Cloudflare D1 (writes) ---
    cf_account_id: str | None
    cf_d1_database_id: str | None
    cf_api_token: str | None

    # --- Firecrawl (PDF -> markdown, browser JSON fallback) ---
    firecrawl_api_key: str | None

    # --- LLM extraction ---
    llm_provider: str  # "claude" | "openai"
    claude_bedrock_api_key: str | None
    claude_bedrock_region: str
    claude_bedrock_model_id: str
    openai_api_key: str | None
    openai_model: str

    # --- Optional proxy fallback ---
    scrapedo_api_key: str | None

    # --- Ingestion window / cost caps ---
    ingest_days: int
    ingest_limit: int
    ingest_max_pages: int
    ingest_from_date: str | None  # YYYYMMDD or YYYY-MM-DD override
    ingest_to_date: str | None

    # ---- Derived readiness helpers ----
    @property
    def has_d1(self) -> bool:
        return bool(self.cf_account_id and self.cf_d1_database_id and self.cf_api_token)

    @property
    def active_llm_key(self) -> str | None:
        if self.llm_provider == "openai":
            return self.openai_api_key
        return self.claude_bedrock_api_key

    @property
    def has_llm(self) -> bool:
        return bool(self.active_llm_key)

    @property
    def has_firecrawl(self) -> bool:
        return bool(self.firecrawl_api_key)

    @property
    def can_read_pdfs(self) -> bool:
        """PDF extraction needs both a PDF reader (Firecrawl) and an LLM key."""
        return self.has_firecrawl and self.has_llm

    @property
    def dry_run(self) -> bool:
        """No D1 credentials => never write; just fetch/log and exit 0."""
        return not self.has_d1

    def readiness(self) -> "list[tuple[str, bool, bool]]":
        """(name, present, required) tuples for the startup readiness banner."""
        return [
            ("CF_ACCOUNT_ID", bool(self.cf_account_id), True),
            ("CF_D1_DATABASE_ID", bool(self.cf_d1_database_id), True),
            ("CF_API_TOKEN", bool(self.cf_api_token), True),
            ("FIRECRAWL_API_KEY", bool(self.firecrawl_api_key), True),
            (
                f"LLM key [{self.llm_provider}]",
                bool(self.active_llm_key),
                True,
            ),
            ("SCRAPEDO_API_KEY", bool(self.scrapedo_api_key), False),
        ]


def load_config() -> Config:
    provider = (_get("LLM_PROVIDER", "claude") or "claude").lower()
    if provider not in ("claude", "openai"):
        provider = "claude"
    return Config(
        cf_account_id=_get("CF_ACCOUNT_ID"),
        cf_d1_database_id=_get("CF_D1_DATABASE_ID"),
        cf_api_token=_get("CF_API_TOKEN"),
        firecrawl_api_key=_get("FIRECRAWL_API_KEY"),
        llm_provider=provider,
        claude_bedrock_api_key=_get("CLAUDE_BEDROCK_API_KEY"),
        claude_bedrock_region=_get("CLAUDE_BEDROCK_REGION", "us-east-1") or "us-east-1",
        claude_bedrock_model_id=_get(
            "CLAUDE_BEDROCK_MODEL_ID", "us.anthropic.claude-sonnet-4-5-20250929-v1:0"
        )
        or "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
        openai_api_key=_get("OPENAI_API_KEY"),
        openai_model=_get("OPENAI_MODEL", "gpt-4o-mini") or "gpt-4o-mini",
        scrapedo_api_key=_get("SCRAPEDO_API_KEY"),
        ingest_days=_get_int("INGEST_DAYS", 2),
        ingest_limit=_get_int("INGEST_LIMIT", 15),
        ingest_max_pages=_get_int("INGEST_MAX_PAGES", 60),
        ingest_from_date=_get("INGEST_FROM_DATE"),
        ingest_to_date=_get("INGEST_TO_DATE"),
    )
