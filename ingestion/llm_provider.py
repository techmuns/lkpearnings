"""LLM provider toggle + the shared extraction prompt and JSON parsing.

`get_llm_client(cfg)` returns a Claude (Bedrock) or OpenAI client depending on
`LLM_PROVIDER`. Both expose the same interface:

    client.model          -> str
    client.extract(text)  -> Extraction(results: list[dict], model, ok, error)

The model is asked ONLY to read verbatim numbers into a strict JSON shape; every
derivation happens later in financials.py.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from typing import Any

# SEBI result PDFs often lead with a cover letter / board-meeting outcome /
# auditor's report before the actual financial-results table, so a tight cap
# truncates the numbers out of view. Claude on Bedrock has a large context
# window; ~40k chars (~10k tokens) reaches the table on virtually all filings
# while staying cheap. (Live runs showed 12k was cutting tables off.)
MAX_INPUT_CHARS = 40000

SYSTEM_PROMPT = (
    "You are a meticulous financial-data extraction engine for Indian SEBI "
    "(Regulation 33) quarterly result filings. You copy numbers VERBATIM from the "
    "provided filing text and never infer, convert, calculate, or reformat them. "
    "You return ONLY a single JSON object — no prose, no markdown code fences."
)

_USER_TEMPLATE = """From the BSE financial-result filing text below, extract the reported line items for EACH statement present (Standalone and/or Consolidated).

Return a strict JSON object of EXACTLY this shape:
{{
  "results": [
    {{
      "result_type": "standalone" | "consolidated",
      "reporting_unit": "the unit stated near the table, verbatim (e.g. 'Rs. in Lakhs', 'INR Million', 'Rs in Crore', 'in Thousands')",
      "quarter_label": "period label if stated (e.g. 'Quarter ended June 30, 2026'), else 'not specified'",
      "current_quarter_end": "date heading of the current-quarter column (e.g. 'June 30, 2026'), else 'not specified'",
      "previous_quarter_end": "date heading of the preceding-quarter column (QoQ base), else 'not specified'",
      "year_ago_quarter_end": "date heading of the year-ago-quarter column (YoY base), else 'not specified'",
      "periods": {{
        "current":      {{ "revenue_from_operations": "...", "other_income": "...", "total_expenses": "...", "finance_costs": "...", "depreciation": "...", "profit_before_tax": "...", "net_profit": "..." }},
        "prev_quarter": {{ "revenue_from_operations": "...", "other_income": "...", "total_expenses": "...", "finance_costs": "...", "depreciation": "...", "profit_before_tax": "...", "net_profit": "..." }},
        "year_ago":     {{ "revenue_from_operations": "...", "other_income": "...", "total_expenses": "...", "finance_costs": "...", "depreciation": "...", "profit_before_tax": "...", "net_profit": "..." }}
      }},
      "confidence": 0.0
    }}
  ]
}}

RULES:
- The financial-results table may appear AFTER a cover letter, board-meeting outcome, or auditor's report — read the ENTIRE text to locate it before concluding data is absent.
- Copy numbers VERBATIM as strings, keeping signs. A value in parentheses means negative, e.g. "(1,234)". Do NOT strip commas or convert units.
- "net_profit" is the profit/(loss) for the period (after tax).
- "total_expenses" is the total expenses line; "finance_costs" and "depreciation" are the finance costs and depreciation/amortisation lines within it.
- If a PDF contains BOTH Standalone and Consolidated statements, return BOTH as separate array elements. If only one is present, return a single-element array.
- If a field, column, or whole statement is absent, use "not specified" (or omit that array element for an absent statement). NEVER infer, convert, or compute a value.
- "confidence" is your 0..1 confidence that the numbers were read correctly.
- Return ONLY the JSON object.

FILING TEXT:
\"\"\"
{text}
\"\"\"
"""


def build_user_prompt(pdf_text: str) -> str:
    return _USER_TEMPLATE.format(text=pdf_text[:MAX_INPUT_CHARS])


@dataclass
class Extraction:
    results: list[dict[str, Any]] = field(default_factory=list)
    model: str = ""
    ok: bool = True
    error: str | None = None


def _loads(s: str) -> Any:
    try:
        return json.loads(s)
    except ValueError:
        return None


def parse_extraction_json(text: str | None) -> list[dict[str, Any]]:
    """Extract the ``results`` array from a model response, tolerant of code
    fences and stray prose. Returns [] if nothing usable is found."""
    if not text:
        return []
    t = text.strip()
    t = re.sub(r"^```(?:json)?", "", t).strip()
    t = re.sub(r"```$", "", t).strip()

    obj = _loads(t)
    if obj is None:
        m = re.search(r"\{.*\}", t, re.DOTALL)
        if m:
            obj = _loads(m.group(0))
    if not isinstance(obj, dict):
        return []

    results = obj.get("results")
    if isinstance(results, list):
        return [r for r in results if isinstance(r, dict)]
    if "periods" in obj or "result_type" in obj:  # single result returned bare
        return [obj]
    return []


def get_llm_client(cfg: Any):
    if cfg.llm_provider == "openai":
        from openai_client import OpenAIClient

        return OpenAIClient(cfg)
    from claude_client import ClaudeClient

    return ClaudeClient(cfg)
