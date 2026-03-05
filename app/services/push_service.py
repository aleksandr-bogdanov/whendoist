"""
Push notification delivery service for FCM (Android) and APNs (iOS).

Pure delivery layer — no DB access. Returns result objects that callers
use to decide token cleanup. Uses httpx with HTTP/2 for APNs.

FCM: Google OAuth2 service account JWT → bearer token → POST to FCM v1 API
APNs: ES256 JWT from .p8 key → HTTP/2 POST to APNs

Both tokens are cached in-memory with expiry. Graceful no-op when not configured.
HTTP clients are created lazily and reused across pushes (critical for HTTP/2
connection reuse with APNs).
"""

import base64
import json
import logging
import time
from dataclasses import dataclass
from pathlib import Path

import httpx
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric import padding as rsa_padding
from cryptography.hazmat.primitives.asymmetric import utils as asym_utils

from app.config import get_settings
from app.constants import (
    APNS_PROD_HOST,
    APNS_SANDBOX_HOST,
    FCM_OAUTH_SCOPE,
    FCM_SEND_URL,
    FCM_TOKEN_URL,
)

logger = logging.getLogger("whendoist.push")


def _b64url(data: bytes) -> str:
    """URL-safe base64 encoding without padding (for JWT segments)."""
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


@dataclass
class PushResult:
    """Result of a push delivery attempt."""

    success: bool
    token_invalid: bool = False  # True → caller should delete this device token


class PushService:
    """Send silent push notifications via FCM and APNs."""

    def __init__(self) -> None:
        self._settings = get_settings()

        # FCM OAuth2 bearer token cache
        self._fcm_bearer: str | None = None
        self._fcm_bearer_expires: float = 0

        # APNs JWT cache
        self._apns_jwt: str | None = None
        self._apns_jwt_expires: float = 0

        # APNs private key (loaded once)
        self._apns_key: ec.EllipticCurvePrivateKey | None = None

        # FCM service account data (loaded once)
        self._fcm_sa: dict | None = None

        # Reusable HTTP clients (lazy-initialized)
        self._fcm_client: httpx.AsyncClient | None = None
        self._apns_client: httpx.AsyncClient | None = None

        # Track whether we've logged "not configured" warnings
        self._fcm_warned = False
        self._apns_warned = False

    async def _get_fcm_client(self) -> httpx.AsyncClient:
        """Get or create the FCM HTTP client."""
        if self._fcm_client is None:
            self._fcm_client = httpx.AsyncClient(timeout=10)
        return self._fcm_client

    async def _get_apns_client(self) -> httpx.AsyncClient:
        """Get or create the APNs HTTP/2 client."""
        if self._apns_client is None:
            self._apns_client = httpx.AsyncClient(http2=True, timeout=10)
        return self._apns_client

    async def close(self) -> None:
        """Close HTTP clients. Call on shutdown."""
        if self._fcm_client:
            await self._fcm_client.aclose()
            self._fcm_client = None
        if self._apns_client:
            await self._apns_client.aclose()
            self._apns_client = None

    @property
    def fcm_configured(self) -> bool:
        return bool(self._settings.fcm_project_id and self._settings.fcm_service_account_json)

    @property
    def apns_configured(self) -> bool:
        return bool(self._settings.apns_key_id and self._settings.apns_team_id and self._settings.apns_key_path)

    async def send_silent_push(
        self,
        token: str,
        platform: str,
        task_id: int,
        title: str | None = None,
    ) -> PushResult:
        """Send a silent push notification to a device.

        Args:
            token: Device push token (FCM registration token or APNs device token)
            platform: "android" or "ios"
            task_id: Task ID for the reminder
            title: Task title (omitted for encrypted users — Rust falls back to generic)
        """
        data = {"task_id": str(task_id)}
        if title:
            data["title"] = title

        if platform == "android":
            return await self._send_fcm(token, data)
        elif platform == "ios":
            return await self._send_apns(token, data)
        else:
            logger.warning(f"Unknown platform: {platform}")
            return PushResult(success=False)

    # ── FCM (Android) ────────────────────────────────────────────────────

    def _load_fcm_service_account(self) -> dict:
        """Load FCM service account credentials (JSON string or file path)."""
        if self._fcm_sa:
            return self._fcm_sa

        raw = self._settings.fcm_service_account_json
        sa = json.loads(raw) if raw.startswith("{") else json.loads(Path(raw).read_text())
        self._fcm_sa = sa
        return sa

    def _create_fcm_jwt(self) -> str:
        """Create a signed JWT for Google OAuth2 token exchange."""
        sa = self._load_fcm_service_account()
        now = int(time.time())

        header = {"alg": "RS256", "typ": "JWT"}
        payload = {
            "iss": sa["client_email"],
            "scope": FCM_OAUTH_SCOPE,
            "aud": FCM_TOKEN_URL,
            "iat": now,
            "exp": now + 3600,
        }

        header_b64 = _b64url(json.dumps(header).encode())
        payload_b64 = _b64url(json.dumps(payload).encode())
        signing_input = f"{header_b64}.{payload_b64}".encode()

        private_key = serialization.load_pem_private_key(sa["private_key"].encode(), password=None)
        signature = private_key.sign(signing_input, rsa_padding.PKCS1v15(), hashes.SHA256())  # type: ignore[union-attr]

        return f"{header_b64}.{payload_b64}.{_b64url(signature)}"

    async def _get_fcm_bearer(self) -> str:
        """Get a cached FCM OAuth2 bearer token, refreshing if expired."""
        if self._fcm_bearer and time.time() < self._fcm_bearer_expires - 60:
            return self._fcm_bearer

        jwt_token = self._create_fcm_jwt()
        client = await self._get_fcm_client()
        resp = await client.post(
            FCM_TOKEN_URL,
            data={
                "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
                "assertion": jwt_token,
            },
        )
        resp.raise_for_status()
        data = resp.json()
        self._fcm_bearer = data["access_token"]
        self._fcm_bearer_expires = time.time() + data.get("expires_in", 3600)
        return self._fcm_bearer  # type: ignore[return-value]

    async def _send_fcm(self, token: str, data: dict[str, str]) -> PushResult:
        """Send a silent data message via FCM v1 HTTP API."""
        if not self.fcm_configured:
            if not self._fcm_warned:
                logger.warning("FCM not configured — skipping Android push")
                self._fcm_warned = True
            return PushResult(success=False)

        try:
            bearer = await self._get_fcm_bearer()
            url = FCM_SEND_URL.format(project_id=self._settings.fcm_project_id)
            payload = {
                "message": {
                    "token": token,
                    "data": data,
                    "android": {"priority": "high"},
                }
            }

            client = await self._get_fcm_client()
            resp = await client.post(
                url,
                json=payload,
                headers={"Authorization": f"Bearer {bearer}"},
            )

            if resp.status_code == 200:
                return PushResult(success=True)

            # Token no longer valid (uninstalled, rotated)
            if resp.status_code == 404:
                logger.info("FCM token invalid (404), marking for cleanup")
                return PushResult(success=False, token_invalid=True)

            # Also check for UNREGISTERED error in response body
            try:
                error_code = resp.json().get("error", {}).get("details", [{}])[0].get("errorCode", "")
                if error_code == "UNREGISTERED":
                    return PushResult(success=False, token_invalid=True)
            except (ValueError, KeyError, IndexError):
                pass

            logger.warning(f"FCM error {resp.status_code}: {resp.text[:200]}")
            return PushResult(success=False)

        except Exception as e:
            logger.warning(f"FCM delivery failed: {type(e).__name__}: {e}")
            return PushResult(success=False)

    # ── APNs (iOS) ───────────────────────────────────────────────────────

    def _load_apns_key(self) -> ec.EllipticCurvePrivateKey:
        """Load the APNs .p8 private key."""
        if self._apns_key:
            return self._apns_key

        key_data = Path(self._settings.apns_key_path).read_bytes()
        key = serialization.load_pem_private_key(key_data, password=None)
        assert isinstance(key, ec.EllipticCurvePrivateKey)
        self._apns_key = key
        return self._apns_key

    def _create_apns_jwt(self) -> str:
        """Create an ES256 JWT for APNs authentication."""
        now = int(time.time())
        # APNs tokens are valid for 1 hour max
        if self._apns_jwt and now < self._apns_jwt_expires - 60:
            return self._apns_jwt

        header = {
            "alg": "ES256",
            "kid": self._settings.apns_key_id,
        }
        payload = {
            "iss": self._settings.apns_team_id,
            "iat": now,
        }

        header_b64 = _b64url(json.dumps(header).encode())
        payload_b64 = _b64url(json.dumps(payload).encode())
        signing_input = f"{header_b64}.{payload_b64}".encode()

        key = self._load_apns_key()
        der_sig = key.sign(signing_input, ec.ECDSA(hashes.SHA256()))
        # Convert DER signature to raw r||s format for JWT
        r, s = asym_utils.decode_dss_signature(der_sig)
        raw_sig = r.to_bytes(32, "big") + s.to_bytes(32, "big")

        self._apns_jwt = f"{header_b64}.{payload_b64}.{_b64url(raw_sig)}"
        self._apns_jwt_expires = now + 3600
        return self._apns_jwt

    async def _send_apns(self, token: str, data: dict[str, str]) -> PushResult:
        """Send a silent push via APNs HTTP/2."""
        if not self.apns_configured:
            if not self._apns_warned:
                logger.warning("APNs not configured — skipping iOS push")
                self._apns_warned = True
            return PushResult(success=False)

        try:
            jwt_token = self._create_apns_jwt()
            host = APNS_SANDBOX_HOST if self._settings.apns_use_sandbox else APNS_PROD_HOST
            url = f"{host}/3/device/{token}"

            payload = {
                "aps": {"content-available": 1},
                **data,
            }

            client = await self._get_apns_client()
            resp = await client.post(
                url,
                json=payload,
                headers={
                    "authorization": f"bearer {jwt_token}",
                    "apns-topic": self._settings.apns_bundle_id,
                    "apns-push-type": "background",
                    "apns-priority": "5",
                },
            )

            if resp.status_code == 200:
                return PushResult(success=True)

            # 410 Gone = token no longer valid
            if resp.status_code == 410:
                logger.info("APNs token expired (410), marking for cleanup")
                return PushResult(success=False, token_invalid=True)

            # 400 with BadDeviceToken
            if resp.status_code == 400:
                try:
                    reason = resp.json().get("reason", "")
                    if reason == "BadDeviceToken":
                        return PushResult(success=False, token_invalid=True)
                except (ValueError, KeyError):
                    pass

            logger.warning(f"APNs error {resp.status_code}: {resp.text[:200]}")
            return PushResult(success=False)

        except Exception as e:
            logger.warning(f"APNs delivery failed: {type(e).__name__}: {e}")
            return PushResult(success=False)
