"""summarize() calls out to Cerebras/Groq. Real network calls are never made
here — `_configured_providers` and `_call_chat_api` are monkeypatched so
these tests exercise the real fallback/retry orchestration deterministically,
independent of whatever real keys happen to be in the repo's .env."""

import urllib.error

import pytest

from app import summarizer


def _alerts():
    return [
        {"service": "postgres-primary", "severity": "critical", "message": "pool exhausted"},
        {"service": "api-gateway", "severity": "high", "message": "upstream timeout"},
    ]


def _root():
    return {"alertname": "DBConnectionPoolExhausted", "service": "postgres-primary"}


class TestTemplateSummary:
    def test_includes_root_cause_and_service_count(self):
        text = summarizer._template_summary(_alerts(), _root())
        assert "DBConnectionPoolExhausted" in text
        assert "postgres-primary" in text
        assert "2 related alerts" in text

    def test_includes_dna_match_when_present(self):
        dna = {"incident_id": "INC-0389", "similarity_pct": 87.0, "resolution": "restarted pool", "resolution_minutes": 12}
        text = summarizer._template_summary(_alerts(), _root(), dna)
        assert "INC-0389" in text
        assert "restarted pool" in text

    def test_omits_dna_section_when_absent(self):
        text = summarizer._template_summary(_alerts(), _root(), None)
        assert "Resembles" not in text


class TestBuildPrompt:
    def test_prompt_includes_root_cause_and_sample_messages(self):
        prompt = summarizer._build_prompt(_alerts(), _root(), None)
        assert "DBConnectionPoolExhausted" in prompt
        assert "pool exhausted" in prompt

    def test_prompt_includes_dna_when_present(self):
        dna = {"incident_id": "INC-0389", "similarity_pct": 87.0, "resolution": "restarted pool", "resolution_minutes": 12}
        prompt = summarizer._build_prompt(_alerts(), _root(), dna)
        assert "INC-0389" in prompt


class TestSummarize:
    def test_no_providers_configured_uses_template(self, monkeypatch):
        monkeypatch.setattr(summarizer, "_configured_providers", lambda: [])
        result = summarizer.summarize(_alerts(), _root(), None)
        assert result == summarizer._template_summary(_alerts(), _root(), None)

    def test_first_provider_success_used_directly(self, monkeypatch):
        monkeypatch.setattr(
            summarizer, "_configured_providers",
            lambda: [("cerebras", "fake-key", "https://fake", "fake-model")],
        )
        monkeypatch.setattr(summarizer, "_call_chat_api", lambda *a, **k: "Real LLM summary text.")
        result = summarizer.summarize(_alerts(), _root(), None)
        assert result == "Real LLM summary text."

    def test_first_provider_fails_second_succeeds(self, monkeypatch):
        calls = []

        def fake_call(api_key, url, model, prompt):
            calls.append(model)
            if model == "model-a":
                # URLError is what urlopen actually raises on a real
                # connection failure — one of the exception types
                # _llm_summary's except tuple explicitly catches.
                raise urllib.error.URLError("blocked")
            return "Groq answered instead."

        monkeypatch.setattr(
            summarizer, "_configured_providers",
            lambda: [
                ("cerebras", "k1", "https://a", "model-a"),
                ("groq", "k2", "https://b", "model-b"),
            ],
        )
        monkeypatch.setattr(summarizer, "_call_chat_api", fake_call)
        result = summarizer.summarize(_alerts(), _root(), None)
        assert result == "Groq answered instead."
        assert calls == ["model-a", "model-b"]

    def test_all_providers_fail_falls_back_to_template(self, monkeypatch, capsys):
        monkeypatch.setattr(
            summarizer, "_configured_providers",
            lambda: [("cerebras", "k1", "https://a", "model-a")],
        )

        def always_fail(*a, **k):
            raise TimeoutError("no response")

        monkeypatch.setattr(summarizer, "_call_chat_api", always_fail)
        result = summarizer.summarize(_alerts(), _root(), None)
        assert result == summarizer._template_summary(_alerts(), _root(), None)

    def test_empty_llm_response_falls_back_to_template(self, monkeypatch):
        monkeypatch.setattr(
            summarizer, "_configured_providers",
            lambda: [("cerebras", "k1", "https://a", "model-a")],
        )
        monkeypatch.setattr(summarizer, "_call_chat_api", lambda *a, **k: "")
        result = summarizer.summarize(_alerts(), _root(), None)
        assert result == summarizer._template_summary(_alerts(), _root(), None)

    def test_exception_type_outside_the_caught_tuple_propagates(self, monkeypatch):
        """Documents actual current behavior, not desired behavior:
        _llm_summary only catches (URLError, HTTPError, KeyError, IndexError,
        TimeoutError, ValueError) — narrower than assistant.py's equivalent
        loop, which catches broad Exception. Anything else _call_chat_api
        might raise crashes summarize() instead of falling back to the
        template. Flagging the asymmetry, not fixing it here."""
        monkeypatch.setattr(
            summarizer, "_configured_providers",
            lambda: [("cerebras", "k1", "https://a", "model-a")],
        )

        def raises_uncaught_type(*a, **k):
            raise ConnectionError("not in the except tuple")

        monkeypatch.setattr(summarizer, "_call_chat_api", raises_uncaught_type)
        with pytest.raises(ConnectionError):
            summarizer.summarize(_alerts(), _root(), None)
