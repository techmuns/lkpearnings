"""BSE Financial-Results reader.

Reads BSE's public announcements JSON API filtered to the Result category /
Financial Results subcategory, one day at a time (BSE rejects wide ranges),
paging within each day. Uses a three-link fetcher chain — direct `requests`
(free, works from most IPs) -> Scrape.do (residential proxy) -> Firecrawl
(in-browser) — and logs which link produced rows.

Also builds the result-PDF URL from ATTACHMENTNAME (AttachLive, with an AttachHis
fallback), derives the base dedup key, and filters out non-result noise.
"""

from __future__ import annotations

import hashlib
import json
import re
from collections import Counter
from datetime import datetime, timedelta, timezone
from typing import Any, Callable
from urllib.parse import urlencode

import requests

API_BASE = "https://api.bseindia.com/BseIndiaAPI/api/AnnSubCategoryGetData/w"
ATTACH_LIVE = "https://www.bseindia.com/xml-data/corpfiling/AttachLive/"
ATTACH_HIS = "https://www.bseindia.com/xml-data/corpfiling/AttachHis/"
IST = timezone(timedelta(hours=5, minutes=30))

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://www.bseindia.com/corporates/comp_resultsnew.aspx",
    "Origin": "https://www.bseindia.com",
    "X-Requested-With": "XMLHttpRequest",
}

# Headline signals that mark a row as non-result noise (only dropped when the
# row doesn't otherwise look like a result).
_NOISE = (
    "newspaper publication",
    "newspaper advertisement",
    "investor presentation",
    "earnings call",
    "conference call",
    "analyst meet",
    "transcript",
    "press release",
)

_PER_DAY_PAGE_CAP = 25


# --------------------------------------------------------------------------- #
# URLs, keys, dates
# --------------------------------------------------------------------------- #
def build_api_url(date_yyyymmdd: str, page: int) -> str:
    params = {
        "pageno": page,
        "strCat": "Result",
        "strPrevDate": date_yyyymmdd,
        "strToDate": date_yyyymmdd,
        "strScrip": "",
        "strSearch": "P",
        "strType": "C",
        "subcategory": "Financial Results",
    }
    return f"{API_BASE}?{urlencode(params)}"


def build_pdf_url(attachment_name: str, historical: bool = False) -> str:
    base = ATTACH_HIS if historical else ATTACH_LIVE
    return base + attachment_name.strip()


def base_dedup_key(row: dict[str, Any]) -> str:
    """Stable base key for a filing (NEWSID, else a sha1 of identity fields).
    The earnings ``dedup_key`` is this base plus ``|<result_type>``."""
    newsid = row.get("newsid")
    if newsid:
        return str(newsid)
    raw = f"{row.get('bse_scrip_code')}|{row.get('filed_at')}|{row.get('headline')}"
    return "sha1-" + hashlib.sha1(raw.encode("utf-8")).hexdigest()[:20]


def _clean(value: Any) -> str:
    """Trim and treat BSE's literal 'None'/'null' strings as empty."""
    s = str(value or "").strip()
    if s.lower() in ("none", "null"):
        return ""
    return s


def _norm_dt(value: Any) -> str | None:
    s = _clean(value)
    if not s:
        return None
    m = re.search(r"/Date\((\d+)", s)  # ASP.NET epoch-ms form, just in case
    if m:
        try:
            dt = datetime.fromtimestamp(int(m.group(1)) / 1000, tz=timezone.utc).astimezone(IST)
            return dt.strftime("%Y-%m-%dT%H:%M:%S")
        except (ValueError, OverflowError):
            return None
    s = s.replace(" ", "T").split(".")[0]
    return s[:19]


def _to_date(value: str) -> "datetime":
    v = value.strip().replace("-", "")
    return datetime.strptime(v[:8], "%Y%m%d")


def date_window(cfg: Any) -> list[str]:
    """Newest-first list of YYYYMMDD dates to query."""
    if cfg.ingest_from_date and cfg.ingest_to_date:
        start = _to_date(cfg.ingest_from_date)
        end = _to_date(cfg.ingest_to_date)
    else:
        today = datetime.now(IST)
        end = today
        start = today - timedelta(days=max(0, cfg.ingest_days - 1))
    days: list[str] = []
    d = end
    while d.date() >= start.date():
        days.append(d.strftime("%Y%m%d"))
        d -= timedelta(days=1)
    return days


# --------------------------------------------------------------------------- #
# Row normalization & filtering
# --------------------------------------------------------------------------- #
def normalize_row(raw: dict[str, Any]) -> dict[str, Any]:
    scrip = _clean(raw.get("SCRIP_CD")) or None
    company = _clean(raw.get("SLONGNAME"))
    headline = _clean(raw.get("HEADLINE")) or _clean(raw.get("NEWSSUB"))
    attachment = _clean(raw.get("ATTACHMENTNAME"))
    # Only treat it as a usable PDF if it's a real filename (guards 'None' etc.).
    if "." not in attachment or len(attachment) < 5:
        attachment = ""
    if not company:
        company = headline[:80] if headline else (f"BSE {scrip}" if scrip else "Unknown Company")
    return {
        "newsid": _clean(raw.get("NEWSID")) or None,
        "bse_scrip_code": scrip,
        "company_name": company,
        "headline": headline,
        "attachment_name": attachment,
        "attachment_url": build_pdf_url(attachment) if attachment else None,
        "subcatname": _clean(raw.get("SUBCATNAME")),
        "category": _clean(raw.get("CATEGORYNAME")) or "Result",
        "filed_at": _norm_dt(raw.get("NEWS_DT") or raw.get("DissemDT")),
        "nsurl": _clean(raw.get("NSURL")) or None,
    }


def is_actual_result(row: dict[str, Any]) -> bool:
    """Keep only rows that are an actual quarterly/annual result with a PDF.

    The PDF is the source of truth: an "intimation" headline with a result PDF
    attached is still processed. Rows with no attachment can't be extracted, so
    they're skipped; obvious presentation/newspaper noise is dropped unless it
    also looks like a result.
    """
    if not row.get("attachment_name"):
        return False
    head = row.get("headline", "").lower()
    sub = row.get("subcatname", "").lower()
    looks_result = (
        "result" in sub or "result" in head or "financial" in head or "financial" in sub
    )
    if any(tok in head for tok in _NOISE) and not looks_result:
        return False
    return True


# --------------------------------------------------------------------------- #
# Fetcher chain
# --------------------------------------------------------------------------- #
def _parse_json(text: str | None) -> dict[str, Any] | None:
    if not text:
        return None
    t = text.strip()
    if not t:
        return None
    if "No Record Found" in t:
        return {"Table": []}
    try:
        obj = json.loads(t)
    except ValueError:
        m = re.search(r"\{.*\}", t, re.DOTALL)
        if not m:
            return None
        try:
            obj = json.loads(m.group(0))
        except ValueError:
            return None
    if isinstance(obj, dict):
        return obj
    if isinstance(obj, list):
        return {"Table": obj}
    if isinstance(obj, str) and "No Record" in obj:
        return {"Table": []}
    return None


def _get_table(data: dict[str, Any] | None) -> list[dict[str, Any]]:
    if not isinstance(data, dict):
        return []
    tbl = data.get("Table")
    if isinstance(tbl, list):
        return [r for r in tbl if isinstance(r, dict)]
    return []


def _direct_get(url: str) -> str | None:
    try:
        r = requests.get(url, headers=HEADERS, timeout=30)
    except requests.RequestException:
        return None
    if r.status_code != 200:
        return None
    return r.text


def _fetch(url: str, scrapedo: Any, firecrawl: Any) -> tuple[dict[str, Any] | None, str]:
    data = _parse_json(_direct_get(url))
    if data is not None:
        return data, "direct"
    if scrapedo is not None:
        data = _parse_json(scrapedo.get(url))
        if data is not None:
            return data, "scrapedo"
    if firecrawl is not None:
        data = _parse_json(firecrawl.fetch_json_via_browser(url))
        if data is not None:
            return data, "firecrawl"
    return None, "none"


def fetch_new_filings(
    cfg: Any,
    scrapedo: Any = None,
    firecrawl: Any = None,
    log: Callable[[str], None] = print,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Fetch de-duplicated Financial-Results filings across the date window.

    Returns (filings, stats). Filings are normalized dicts (newest-first by the
    order BSE returns). Stats records which fetcher produced rows + page counts.
    """
    days = date_window(cfg)
    log(f"  Date window: {days[-1] if days else '-'} .. {days[0] if days else '-'} "
        f"({len(days)} day(s)), max {cfg.ingest_max_pages} pages/run")
    page_budget = cfg.ingest_max_pages
    seen_bases: set[str] = set()
    fetchers: Counter[str] = Counter()
    filings: list[dict[str, Any]] = []

    for date in days:
        page = 1
        while page_budget > 0 and page <= _PER_DAY_PAGE_CAP:
            url = build_api_url(date, page)
            data, fetcher = _fetch(url, scrapedo, firecrawl)
            page_budget -= 1
            if data is None:
                log(f"  {date} p{page}: fetch failed (all fetchers exhausted)")
                break
            table = _get_table(data)
            if not table:
                break
            fetchers[fetcher] += 1
            kept = 0
            for raw in table:
                row = normalize_row(raw)
                if not is_actual_result(row):
                    continue
                base = base_dedup_key(row)
                if base in seen_bases:
                    continue
                seen_bases.add(base)
                filings.append(row)
                kept += 1
            log(f"  {date} p{page}: {len(table)} rows via {fetcher}, {kept} new result(s)")
            if len(table) < 10:  # short page => last page for this day
                break
            page += 1

    stats = {
        "days": len(days),
        "pages_used": cfg.ingest_max_pages - page_budget,
        "fetchers": dict(fetchers),
        "filings": len(filings),
    }
    return filings, stats
