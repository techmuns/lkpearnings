"""Claude via Amazon Bedrock — Converse REST, no SDK.

Auth uses a Bedrock API key as a bearer token (Authorization: Bearer <key>).
Endpoint: POST bedrock-runtime.{region}.amazonaws.com/model/{modelId}/converse.

NOTE (verify against your AWS account): the default model id
`us.anthropic.claude-sonnet-4-5-20250929-v1:0` is an assumption — confirm the
exact inference-profile / model id enabled in your region.
"""

from __future__ import annotations

import time
from typing import Any
from urllib.parse import quote

import requests

from llm_provider import (
    MAX_INPUT_CHARS,
    SYSTEM_PROMPT,
    Extraction,
    build_user_prompt,
    parse_extraction_json,
)


class ClaudeClient:
    def __init__(self, cfg: Any) -> None:
        self.api_key = cfg.claude_bedrock_api_key
        self.region = cfg.claude_bedrock_region
        self.model = cfg.claude_bedrock_model_id
        self.session = requests.Session()

    def _url(self) -> str:
        return (
            f"https://bedrock-runtime.{self.region}.amazonaws.com"
            f"/model/{quote(self.model, safe='')}/converse"
        )

    def extract(self, text: str) -> Extraction:
        payload = {
            "system": [{"text": SYSTEM_PROMPT}],
            "messages": [
                {"role": "user", "content": [{"text": build_user_prompt(text[:MAX_INPUT_CHARS])}]}
            ],
            "inferenceConfig": {"temperature": 0.0, "maxTokens": 4000},
        }
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

        last_err = "unknown"
        for attempt in range(4):
            try:
                r = self.session.post(self._url(), json=payload, headers=headers, timeout=120)
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
                parts = data["output"]["message"]["content"]
                out_text = "".join(p.get("text", "") for p in parts if isinstance(p, dict))
            except (ValueError, KeyError, TypeError) as exc:
                return Extraction([], self.model, ok=False, error=f"response parse: {exc}")
            results = parse_extraction_json(out_text)
            return Extraction(
                results, self.model, ok=bool(results),
                error=None if results else "no results parsed from model output",
            )
        return Extraction([], self.model, ok=False, error=f"request failed after retries: {last_err}")
