"""Provider connectivity check.

A provider is a webhook target - "testing" it means sending one real HTTP
POST and reporting exactly what came back, the same honesty standard as
summarizer.py/assistant.py's LLM calls (stdlib urllib, no fake success
response if the request never actually went anywhere).
"""

from __future__ import annotations

import json
import urllib.error
import urllib.request


def _post(url: str, payload: dict) -> dict:
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        headers={
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0 (compatible; AlertLens-Backend/1.0)",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=6) as resp:
            return {
                "status": "success",
                "http_status": resp.status,
                "detail": f"Webhook responded with HTTP {resp.status}.",
            }
    except urllib.error.HTTPError as e:
        return {
            "status": "failed",
            "http_status": e.code,
            "detail": f"HTTP {e.code}: {e.reason}",
        }
    except Exception as e:
        return {"status": "failed", "http_status": None, "detail": str(e)}


def test_webhook(url: str) -> dict:
    return _post(url, {
        "event": "alertlens.test",
        "message": "Test notification from AlertLens - if you see this, the webhook works.",
    })


def notify_webhook(url: str, payload: dict) -> dict:
    """Same real-POST mechanics as test_webhook, but with a caller-supplied
    payload - used by the workflow engine to notify on a real incident."""
    return _post(url, payload)
