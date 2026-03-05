"""
Tests for PushService — FCM and APNs payload construction and error handling.

Tests use mocked httpx to verify:
- Correct payload structure for FCM and APNs
- Token invalidation on 404 (FCM) and 410 (APNs)
- Graceful handling of network errors
- No-op when services are not configured

@pytest.mark.unit — no external deps, all HTTP mocked.
"""

from unittest.mock import AsyncMock, patch

import pytest

from app.services.push_service import PushResult, PushService


@pytest.fixture
def unconfigured_service():
    """PushService with no FCM/APNs configured."""
    with patch("app.services.push_service.get_settings") as mock_settings:
        settings = mock_settings.return_value
        settings.fcm_project_id = ""
        settings.fcm_service_account_json = ""
        settings.apns_key_id = ""
        settings.apns_team_id = ""
        settings.apns_key_path = ""
        settings.apns_bundle_id = "com.whendoist.app"
        settings.apns_use_sandbox = True
        yield PushService()


def _make_configured_service(*, fcm: bool = False, apns: bool = False) -> PushService:
    """Create a PushService with mocked settings."""
    with patch("app.services.push_service.get_settings") as mock_settings:
        settings = mock_settings.return_value
        settings.fcm_project_id = "test-project" if fcm else ""
        settings.fcm_service_account_json = '{"type":"service_account"}' if fcm else ""
        settings.apns_key_id = "KEY123" if apns else ""
        settings.apns_team_id = "TEAM123" if apns else ""
        settings.apns_key_path = "/fake/key.p8" if apns else ""
        settings.apns_bundle_id = "com.whendoist.app"
        settings.apns_use_sandbox = True
        return PushService()


@pytest.mark.unit
class TestPushServiceUnconfigured:
    """When FCM/APNs credentials are not set, service should no-op gracefully."""

    async def test_fcm_not_configured(self, unconfigured_service: PushService):
        """FCM push should fail gracefully when not configured."""
        result = await unconfigured_service.send_silent_push(
            token="some-token", platform="android", task_id=1, title="Test"
        )
        assert isinstance(result, PushResult)
        assert result.success is False
        assert result.token_invalid is False

    async def test_apns_not_configured(self, unconfigured_service: PushService):
        """APNs push should fail gracefully when not configured."""
        result = await unconfigured_service.send_silent_push(
            token="some-token", platform="ios", task_id=1, title="Test"
        )
        assert isinstance(result, PushResult)
        assert result.success is False
        assert result.token_invalid is False

    async def test_unknown_platform(self, unconfigured_service: PushService):
        """Unknown platform should return failure."""
        result = await unconfigured_service.send_silent_push(token="some-token", platform="windows", task_id=1)
        assert result.success is False


@pytest.mark.unit
class TestPushResult:
    """Test PushResult dataclass."""

    def test_default_values(self):
        result = PushResult(success=True)
        assert result.success is True
        assert result.token_invalid is False

    def test_invalid_token(self):
        result = PushResult(success=False, token_invalid=True)
        assert result.success is False
        assert result.token_invalid is True


@pytest.mark.unit
class TestFCMPayload:
    """Test FCM-specific behavior with mocked HTTP."""

    async def test_fcm_success(self):
        """Successful FCM push returns success=True."""
        service = _make_configured_service(fcm=True)

        mock_response = AsyncMock()
        mock_response.status_code = 200

        mock_client = AsyncMock()
        mock_client.post.return_value = mock_response

        with patch.object(service, "_get_fcm_bearer", return_value="mock-bearer"):
            service._fcm_client = mock_client

            result = await service._send_fcm("test-token", {"task_id": "1", "title": "Test"})

            assert result.success is True
            assert result.token_invalid is False

            # Verify payload structure
            call_args = mock_client.post.call_args
            payload = call_args.kwargs.get("json") or call_args[1].get("json")
            assert "message" in payload
            assert payload["message"]["token"] == "test-token"
            assert payload["message"]["data"]["task_id"] == "1"
            assert payload["message"]["android"]["priority"] == "high"

    async def test_fcm_404_marks_token_invalid(self):
        """FCM 404 response should mark token as invalid."""
        service = _make_configured_service(fcm=True)

        mock_response = AsyncMock()
        mock_response.status_code = 404
        mock_response.text = "Not Found"

        mock_client = AsyncMock()
        mock_client.post.return_value = mock_response

        with patch.object(service, "_get_fcm_bearer", return_value="mock-bearer"):
            service._fcm_client = mock_client

            result = await service._send_fcm("stale-token", {"task_id": "1"})

            assert result.success is False
            assert result.token_invalid is True


@pytest.mark.unit
class TestAPNSPayload:
    """Test APNs-specific behavior with mocked HTTP."""

    async def test_apns_success(self):
        """Successful APNs push returns success=True."""
        service = _make_configured_service(apns=True)

        mock_response = AsyncMock()
        mock_response.status_code = 200

        mock_client = AsyncMock()
        mock_client.post.return_value = mock_response

        with patch.object(service, "_create_apns_jwt", return_value="mock-jwt"):
            service._apns_client = mock_client

            result = await service._send_apns("device-token", {"task_id": "1", "title": "Test"})

            assert result.success is True

            # Verify payload structure: silent push with content-available
            call_args = mock_client.post.call_args
            payload = call_args.kwargs.get("json") or call_args[1].get("json")
            assert payload["aps"]["content-available"] == 1
            assert payload["task_id"] == "1"

            # Verify headers
            headers = call_args.kwargs.get("headers") or call_args[1].get("headers")
            assert headers["apns-push-type"] == "background"
            assert headers["apns-priority"] == "5"
            assert headers["apns-topic"] == "com.whendoist.app"

    async def test_apns_410_marks_token_invalid(self):
        """APNs 410 Gone should mark token as invalid."""
        service = _make_configured_service(apns=True)

        mock_response = AsyncMock()
        mock_response.status_code = 410
        mock_response.text = "Gone"

        mock_client = AsyncMock()
        mock_client.post.return_value = mock_response

        with patch.object(service, "_create_apns_jwt", return_value="mock-jwt"):
            service._apns_client = mock_client

            result = await service._send_apns("expired-token", {"task_id": "1"})

            assert result.success is False
            assert result.token_invalid is True

    async def test_apns_network_error_graceful(self):
        """Network errors should return failure without token_invalid."""
        service = _make_configured_service(apns=True)

        mock_client = AsyncMock()
        mock_client.post.side_effect = ConnectionError("Network down")

        with patch.object(service, "_create_apns_jwt", return_value="mock-jwt"):
            service._apns_client = mock_client

            result = await service._send_apns("token", {"task_id": "1"})

            assert result.success is False
            assert result.token_invalid is False
