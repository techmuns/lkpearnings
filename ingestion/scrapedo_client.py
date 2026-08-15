"""Scrape.do proxied GET — residential proxy, India geo.

Used as the middle link in the BSE fetcher chain (direct -> scrape.do ->
Firecrawl). Returns the response body text, or ``None`` on any failure so the
caller can fall through to the next fetcher.
"""

from __future__ import annotations

import requests


class ScrapeDoClient:
    ENDPOINT = "https://api.scrape.do"

    def __init__(self, token: str) -> None:
        self.token = token
        self.session = requests.Session()

    def get(self, url: str, timeout: int = 60) -> str | None:
        params = {
            "token": self.token,
            "url": url,
            "super": "true",     # residential super proxy
            "geoCode": "in",     # exit from India
            "render": "false",   # plain HTTP GET, this is a JSON API
        }
        try:
            r = self.session.get(self.ENDPOINT, params=params, timeout=timeout)
        except requests.RequestException:
            return None
        if r.status_code != 200:
            return None
        return r.text
