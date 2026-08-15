"""OpenAI extraction via Chat Completions — no SDK, JSON response format.

Alternate provider (LLM_PROVIDER=openai). Exposes the same .extract()/.model
interface as ClaudeClient.
"""

from __future__ import annotations

import time
from typing import Any

import requests

from llm_provider import (
    MAX_INPUT_CHARS,
    SYSTEM_PROMPT,
    Extraction,
    build_user_prompt,
    parse_extraction_json,
)


class OpenAIClient:
    ENDPOINT = "https://api.openai.com/v1/chat/completions"

    def __init__(self, cfg: Any) -> None:
        self.api_key = cfg.openai_api_key
        self.model = cfg.openai_model
        self.session = requests.Session()

    def extract(self, text: str) -> Extraction:
        payload = {
            "model": self.model,
            "temperature": 0.0,
            "response_format": {"type": "json_object"},
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": build_user_prompt(text[:MAX_INPUT_CHARS])},
            ],
        }
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

        last_err = "unknown"
        for attempt in range(4):
            try:
                r = self.session.post(self.ENDPOINT, json=payload, headers=headers, timeout=120)
            except requests.RequestException as exc:
                last_err = str(exc)
                time.sleep(min(2 ** attempt, 12))
                continue
            if r.status_code == 429 or r.status_code >= 500:
                last_err = f"HTTP {r.status_code}"
                time.sleep(min(2 ** attempt, 12))
                continue
            if r.status_code != 200:
                return Extraction([], self.model, ok=False, error=f"HTTP {r.status_code}: {r.text[:200]}")
            try:
                data = r.json()
                out_text = data["choices"][0]["message"]["content"]
            except (ValueError, KeyError, IndexError, TypeError) as exc:
                return Extraction([], self.model, ok=False, error=f"response parse: {exc}")
            results = parse_extraction_json(out_text)
            return Extraction(
                results, self.model, ok=bool(results),
                error=None if results else "no results parsed from model output",
            )
        return Extraction([], self.model, ok=False, error=f"request failed after retries: {last_err}")
