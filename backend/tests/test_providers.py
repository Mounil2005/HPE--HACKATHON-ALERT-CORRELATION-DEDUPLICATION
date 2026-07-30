"""providers.py does one real HTTP POST — urllib.request.urlopen is mocked
here so tests are deterministic and don't depend on network access."""

import io
import urllib.error
from unittest.mock import patch

from app import providers as providers_module


class _FakeResponse:
    def __init__(self, status=200):
        self.status = status

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def read(self):
        return b"{}"


class TestWebhookSuccess:
    @patch("app.providers.urllib.request.urlopen")
    def test_test_webhook_success(self, mock_urlopen):
        mock_urlopen.return_value = _FakeResponse(status=200)
        result = providers_module.test_webhook("https://example.com/hook")
        assert result["status"] == "success"
        assert result["http_status"] == 200

    @patch("app.providers.urllib.request.urlopen")
    def test_notify_webhook_sends_caller_payload(self, mock_urlopen):
        mock_urlopen.return_value = _FakeResponse(status=200)
        result = providers_module.notify_webhook("https://example.com/hook", {"event": "custom"})
        assert result["status"] == "success"
        sent_body = mock_urlopen.call_args[0][0].data
        assert b"custom" in sent_body


class TestWebhookFailure:
    @patch("app.providers.urllib.request.urlopen")
    def test_http_error_reported_honestly(self, mock_urlopen):
        mock_urlopen.side_effect = urllib.error.HTTPError(
            url="https://example.com/hook", code=404, msg="Not Found",
            hdrs=None, fp=io.BytesIO(b""),
        )
        result = providers_module.test_webhook("https://example.com/hook")
        assert result["status"] == "failed"
        assert result["http_status"] == 404

    @patch("app.providers.urllib.request.urlopen")
    def test_connection_error_reported_as_failed_not_raised(self, mock_urlopen):
        mock_urlopen.side_effect = urllib.error.URLError("connection refused")
        result = providers_module.test_webhook("https://unreachable.invalid/hook")
        assert result["status"] == "failed"
        assert result["http_status"] is None
        assert "detail" in result
