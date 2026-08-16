"""Pure numeric derivation for BSE financial results.

Philosophy (identical to the order-book app): the LLM only *reads* numbers that
literally appear in the PDF. Every derived quantity — unit conversion, EBITDA,
margins, YoY, QoQ, the quarter label — is computed HERE, in plain Python, from
those verbatim numbers. We never store a figure the model invented.

All functions are small, pure and defensively guarded: unreadable inputs become
``None`` (rendered as "—" in the UI), never a guess.
"""

from __future__ import annotations

import re
from typing import Any

# Rupees represented by one unit of the reported figure. crore = raw * X / 1e7.
UNIT_TO_RUPEES: dict[str, float] = {
    "crore": 1e7,
    "million": 1e6,
    "lakh": 1e5,
    "thousand": 1e3,
    "rupee": 1.0,
}

_NULLISH = {
    "", "not specified", "na", "n/a", "n.a.", "-", "--", "—", "–",
    "nil", "null", "none", "nm", "n.m.",
}

_PERIOD_KEYS = (
    "revenue_from_operations",
    "other_income",
    "total_expenses",
    "finance_costs",
    "depreciation",
    "profit_before_tax",
    "net_profit",
)

_MONTHS = {
    "jan": 1, "january": 1,
    "feb": 2, "february": 2,
    "mar": 3, "march": 3,
    "apr": 4, "april": 4,
    "may": 5,
    "jun": 6, "june": 6,
    "jul": 7, "july": 7,
    "aug": 8, "august": 8,
    "sep": 9, "sept": 9, "september": 9,
    "oct": 10, "october": 10,
    "nov": 11, "november": 11,
    "dec": 12, "december": 12,
}


# --------------------------------------------------------------------------- #
# Number & unit parsing
# --------------------------------------------------------------------------- #
def parse_number(raw: Any) -> float | None:
    """Parse a verbatim figure to float.

    - Strips commas, whitespace and currency marks (₹, Rs, INR).
    - Parentheses denote a negative value: ``(1,234)`` -> ``-1234.0``.
    - Nullish / non-numeric text -> ``None`` (never a guess).
    """
    if raw is None:
        return None
    s = str(raw).strip()
    if s.lower() in _NULLISH:
        return None

    negative = False
    if s.startswith("(") and s.endswith(")"):
        negative = True
        s = s[1:-1]

    s = (
        s.replace(",", "")
        .replace("₹", "")
        .replace("INR", "")
        .replace("inr", "")
        .replace("Rs.", "")
        .replace("Rs", "")
        .replace("rs", "")
        .strip()
    )

    m = re.search(r"-?\d+(?:\.\d+)?", s)
    if not m:
        return None
    try:
        value = float(m.group(0))
    except ValueError:
        return None
    if negative:
        value = -abs(value)
    return value


def unit_to_crore_factor(unit: str | None) -> float | None:
    """Return the multiplier that converts a raw figure to Rs crore.

    Reads the verbatim reporting unit (e.g. "Rs. in Lakhs", "INR Million").
    Returns ``None`` when the unit can't be identified — callers must then leave
    numbers null and lower confidence rather than assume a scale.
    """
    if not unit:
        return None
    u = unit.lower()

    key: str | None = None
    if "crore" in u or re.search(r"\bcr\.?\b", u):
        key = "crore"
    elif "million" in u or re.search(r"\bmn\b", u) or re.search(r"\bmln\b", u):
        key = "million"
    elif "lakh" in u or "lac" in u:
        key = "lakh"
    elif "thousand" in u or "'000" in u or "`000" in u or "000s" in u:
        key = "thousand"
    elif "rupee" in u or u.strip(" .:()") in {"rs", "inr", "₹", "rs.", "rupees"}:
        key = "rupee"

    if key is None:
        return None
    return UNIT_TO_RUPEES[key] / 1e7


def to_crore(raw: Any, factor: float | None) -> float | None:
    value = parse_number(raw)
    if value is None or factor is None:
        return None
    return value * factor


# --------------------------------------------------------------------------- #
# Derived quantities
# --------------------------------------------------------------------------- #
def compute_ebitda(period_cr: dict[str, float | None]) -> float | None:
    """Operating EBITDA in the same unit as the inputs (we pass crore).

    Primary:  revenue_from_operations - (total_expenses - finance_costs - depreciation)
    Fallback: profit_before_tax + finance_costs + depreciation - other_income

    Both exclude other income -> *operating* EBITDA. Missing add-backs are
    treated as 0 ("use whichever inputs are present"). Returns ``None`` when
    neither formula has enough inputs.
    """
    rev = period_cr.get("revenue_from_operations")
    total_exp = period_cr.get("total_expenses")
    finance = period_cr.get("finance_costs") or 0.0
    depr = period_cr.get("depreciation") or 0.0
    other_income = period_cr.get("other_income") or 0.0
    pbt = period_cr.get("profit_before_tax")

    if rev is not None and total_exp is not None:
        return rev - (total_exp - finance - depr)
    if pbt is not None:
        return pbt + finance + depr - other_income
    return None


def ebitda_margin(ebitda_cr: float | None, revenue_cr: float | None) -> float | None:
    """EBITDA / revenue * 100. Null when revenue is missing or <= 0 (banks/NBFCs)."""
    if ebitda_cr is None or revenue_cr is None or revenue_cr <= 0:
        return None
    return ebitda_cr / revenue_cr * 100.0


def pct_change(current: float | None, base: float | None) -> float | None:
    """(current - base) / |base| * 100. Null when base is missing or zero.

    Using |base| keeps the sign intuitive when the base is negative: a move from
    -10 to +5 reads as a positive change. Sign flips are additionally flagged by
    ``net_profit_swing`` so the UI can show a turnaround label instead.
    """
    if current is None or base is None or base == 0:
        return None
    return (current - base) / abs(base) * 100.0


def net_profit_swing(current: float | None, year_ago: float | None) -> str | None:
    """Flag a YoY sign flip so the UI shows a turnaround label, not a % off a
    negative base (which is easy to misread)."""
    if current is None or year_ago is None:
        return None
    if year_ago < 0 and current > 0:
        return "loss->profit"
    if year_ago > 0 and current < 0:
        return "profit->loss"
    return None


# --------------------------------------------------------------------------- #
# Dates & quarter label
# --------------------------------------------------------------------------- #
def _iso(y: int, mo: int, d: int) -> str | None:
    if y < 100:  # 2-digit year -> 20xx
        y += 2000
    if not (1 <= mo <= 12 and 1 <= d <= 31 and 1990 <= y <= 2100):
        return None
    return f"{y:04d}-{mo:02d}-{d:02d}"


def parse_date_to_iso(raw: str | None) -> str | None:
    """Best-effort parse of a verbatim date heading to ISO ``YYYY-MM-DD``.

    Handles the common Indian formats seen in result columns:
    ``2026-06-30``, ``30.06.2026``, ``30/06/2026``, ``June 30, 2026``,
    ``30th June 2026``, ``Quarter ended June 30, 2026``. Returns ``None`` if
    nothing parseable is found (day-first assumed for ambiguous numerics).
    """
    if not raw:
        return None
    t = str(raw).strip()
    if t.lower() in _NULLISH:
        return None

    m = re.search(r"(\d{4})-(\d{1,2})-(\d{1,2})", t)
    if m:
        return _iso(int(m.group(1)), int(m.group(2)), int(m.group(3)))

    m = re.search(r"\b(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})\b", t)
    if m:
        a, b, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if a > 12 >= b:
            day, mo = a, b
        elif b > 12 >= a:
            day, mo = b, a
        else:
            day, mo = a, b  # Indian filings are day-first
        return _iso(y, mo, day)

    m = re.search(r"([A-Za-z]{3,9})\.?[\s-]+(\d{1,2})(?:st|nd|rd|th)?,?\s*(\d{2,4})", t)
    if m:
        mo = _MONTHS.get(m.group(1).lower())
        if mo:
            return _iso(int(m.group(3)), mo, int(m.group(2)))

    m = re.search(r"(\d{1,2})(?:st|nd|rd|th)?[\s.\/-]+([A-Za-z]{3,9})\.?[\s.,\/-]+(\d{2,4})", t)
    if m:
        mo = _MONTHS.get(m.group(2).lower())
        if mo:
            return _iso(int(m.group(3)), mo, int(m.group(1)))

    return None


def derive_quarter_label(period_end_iso: str | None) -> str | None:
    """Indian-FY quarter label from a period-end ISO date.

    Apr-Jun=Q1, Jul-Sep=Q2, Oct-Dec=Q3, Jan-Mar=Q4. The FY label uses the year
    the fiscal year *ends* in: 2026-06-30 -> "Q1 FY27"; 2026-03-31 -> "Q4 FY26".
    """
    if not period_end_iso:
        return None
    m = re.match(r"(\d{4})-(\d{2})-(\d{2})", period_end_iso)
    if not m:
        return None
    year, month = int(m.group(1)), int(m.group(2))
    if 4 <= month <= 6:
        q, fy_end = 1, year + 1
    elif 7 <= month <= 9:
        q, fy_end = 2, year + 1
    elif 10 <= month <= 12:
        q, fy_end = 3, year + 1
    else:  # Jan-Mar
        q, fy_end = 4, year
    return f"Q{q} FY{fy_end % 100:02d}"


# --------------------------------------------------------------------------- #
# Top-level: one extracted result -> a flat dict of DB columns
# --------------------------------------------------------------------------- #
def _normalize_period(raw_period: Any, factor: float | None) -> dict[str, float | None]:
    out: dict[str, float | None] = {k: None for k in _PERIOD_KEYS}
    if not isinstance(raw_period, dict):
        return out
    for k in _PERIOD_KEYS:
        out[k] = to_crore(raw_period.get(k), factor)
    return out


def derive_result(result: dict[str, Any]) -> dict[str, Any]:
    """Turn one LLM ``results[]`` element into the derived earnings-row fields.

    Returns a flat dict whose keys match the ``earnings`` table columns that this
    stage owns (metrics, changes, margins, per-period evidence, quarter label,
    result type, reporting unit, confidence).
    """
    result_type = str(result.get("result_type") or "").strip().lower() or None
    if result_type not in ("standalone", "consolidated", None):
        result_type = "standalone" if "stand" in result_type else "consolidated"

    reporting_unit = result.get("reporting_unit")
    if isinstance(reporting_unit, str):
        reporting_unit = reporting_unit.strip() or None
    factor = unit_to_crore_factor(reporting_unit if isinstance(reporting_unit, str) else None)

    try:
        base_conf = float(result.get("confidence"))
    except (TypeError, ValueError):
        base_conf = 0.5
    base_conf = max(0.0, min(1.0, base_conf))

    periods = result.get("periods") or {}
    cur = _normalize_period(periods.get("current"), factor)
    prevq = _normalize_period(periods.get("prev_quarter"), factor)
    yrago = _normalize_period(periods.get("year_ago"), factor)

    # Per-period headline figures (Rs crore).
    rev_cur, rev_prevq, rev_yr = (
        cur["revenue_from_operations"],
        prevq["revenue_from_operations"],
        yrago["revenue_from_operations"],
    )
    np_cur, np_prevq, np_yr = cur["net_profit"], prevq["net_profit"], yrago["net_profit"]
    eb_cur = compute_ebitda(cur)
    eb_prevq = compute_ebitda(prevq)
    eb_yr = compute_ebitda(yrago)

    # Margins (levels) per period.
    m_cur = ebitda_margin(eb_cur, rev_cur)
    m_prevq = ebitda_margin(eb_prevq, rev_prevq)
    m_yr = ebitda_margin(eb_yr, rev_yr)

    # Period-end dates + quarter label. Fall back to the verbatim quarter_label
    # for the current-period date when the column heading didn't parse.
    period_end = parse_date_to_iso(result.get("current_quarter_end"))
    if period_end is None:
        period_end = parse_date_to_iso(result.get("quarter_label"))
    prev_quarter_end = parse_date_to_iso(result.get("previous_quarter_end"))
    year_ago_quarter_end = parse_date_to_iso(result.get("year_ago_quarter_end"))
    quarter_label = derive_quarter_label(period_end)
    if not quarter_label:
        ql = result.get("quarter_label")
        quarter_label = ql.strip() if isinstance(ql, str) and ql.strip().lower() not in _NULLISH else None

    # Confidence: if we couldn't identify the unit, everything numeric is null,
    # so cap confidence low to make that explicit.
    confidence = base_conf if factor is not None else min(base_conf, 0.2)

    return {
        "result_type": result_type,
        "reporting_unit": reporting_unit if isinstance(reporting_unit, str) else None,
        "quarter_label": quarter_label,
        "period_end": period_end,
        "prev_quarter_end": prev_quarter_end,
        "year_ago_quarter_end": year_ago_quarter_end,
        # Revenue
        "revenue_cr": rev_cur,
        "revenue_yoy_pct": pct_change(rev_cur, rev_yr),
        "revenue_qoq_pct": pct_change(rev_cur, rev_prevq),
        # Net profit
        "net_profit_cr": np_cur,
        "net_profit_yoy_pct": pct_change(np_cur, np_yr),
        "net_profit_qoq_pct": pct_change(np_cur, np_prevq),
        "net_profit_swing": net_profit_swing(np_cur, np_yr),
        # EBITDA
        "ebitda_cr": eb_cur,
        "ebitda_yoy_pct": pct_change(eb_cur, eb_yr),
        "ebitda_qoq_pct": pct_change(eb_cur, eb_prevq),
        # Margin levels: current / year-ago / prev-quarter
        "ebitda_margin_pct": m_cur,
        "ebitda_margin_yoy_pct": m_yr,
        "ebitda_margin_qoq_pct": m_prevq,
        # Per-period evidence (Rs crore)
        "revenue_cur_cr": rev_cur,
        "revenue_prevq_cr": rev_prevq,
        "revenue_yrago_cr": rev_yr,
        "net_profit_cur_cr": np_cur,
        "net_profit_prevq_cr": np_prevq,
        "net_profit_yrago_cr": np_yr,
        "ebitda_cur_cr": eb_cur,
        "ebitda_prevq_cr": eb_prevq,
        "ebitda_yrago_cr": eb_yr,
        "extraction_confidence": round(confidence, 3),
    }
