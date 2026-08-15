"""Firecrawl client — server-side PDF->markdown and a browser JSON fallback.

- ``scrape_pdf(url)``  : renders a result PDF to clean markdown (far better
  tables than raw text extraction), used by the extraction step.
- ``fetch_json_via_browser(url)`` : last-resort fetcher for the BSE announcements
  JSON — first tries an in-page ``fetch().then(r => r.text())`` from the BSE
  origin, then falls back to scraping the API URL directly. Returns text; the
  caller extracts the JSON. No credentials are ever sent.

Every method returns ``None`` on failure rather than raising, so callers degrade
gracefully.
"""

from __future__ import annotations

import re
import requests


class FirecrawlClient:
    BASE = "https://api.firecrawl.dev/v1"

    def __init__(self, api_key: str) -> None:
        self.api_key = api_key
        self.session = requests.Session()
        self.headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }

    def _scrape(self, payload: dict, timeout: int = 120) -> dict | None:
        try:
            r = self.session.post(
                f"{self.BASE}/scrape", json=payload, headers=self.headers, timeout=timeout
            )
        except requests.RequestException:
            return None
        if r.status_code != 200:
            return None
        try:
            body = r.json()
        except ValueError:
            return None
        if not body.get("success"):
            return None
        return body.get("data") or {}

    def scrape_pdf(self, url: str) -> str | None:
        """Return the PDF parsed to markdown, or None."""
        data = self._scrape(
            {"url": url, "formats": ["markdown"], "parsePDF": True, "onlyMainContent": False},
            timeout=180,
        )
        if not data:
            return None
        text = data.get("markdown") or data.get("rawHtml") or data.get("html")
        return text or None

    def fetch_json_via_browser(self, url: str, origin: str | None = None) -> str | None:
        """Fetch BSE JSON from within a real browser context.

        Attempt 1: load the BSE corporate-filings page and run an in-page
        ``fetch(url).then(r => r.text())`` (correct Referer/Origin, no creds).
        Attempt 2: scrape the API URL directly and return the rendered text.
        """
        origin = origin or "https://www.bseindia.com/corporates/comp_resultsnew.aspx"
        script = (
            "return fetch(" + _js_str(url) + ", {credentials:'omit',"
            "headers:{'Accept':'application/json, text/plain, */*',"
            "'X-Requested-With':'XMLHttpRequest'}}).then(function(r){return r.text();});"
        )
        data = self._scrape(
            {
                "url": origin,
                "formats": ["markdown"],
                "actions": [{"type": "executeJavascript", "script": script}],
                "waitFor": 1200,
            },
            timeout=120,
        )
        if data:
            text = _extract_js_return(data)
            if text and "Table" in text:
                return text

        # Attempt 2 — scrape the API URL directly.
        data = self._scrape({"url": url, "formats": ["markdown", "rawHtml"]}, timeout=90)
        if data:
            for key in ("markdown", "rawHtml", "html"):
                val = data.get(key)
                if val and "Table" in val:
                    return val
        return None


def _js_str(s: str) -> str:
    return '"' + s.replace("\\", "\\\\").replace('"', '\\"') + '"'


def _extract_js_return(data: dict) -> str | None:
    """Pull the executeJavascript return value out of Firecrawl's response,
    tolerant of shape differences across API versions."""
    actions = data.get("actions")
    if isinstance(actions, dict):
        returns = actions.get("javascriptReturns")
        if isinstance(returns, list) and returns:
            first = returns[0]
            if isinstance(first, dict):
                val = first.get("value")
                if isinstance(val, str):
                    return val
            elif isinstance(first, str):
                return first
    # Some versions surface it in markdown; try to salvage a JSON blob.
    md = data.get("markdown")
    if isinstance(md, str) and "Table" in md:
        m = re.search(r"\{.*\}", md, re.DOTALL)
        if m:
            return m.group(0)
    return None
