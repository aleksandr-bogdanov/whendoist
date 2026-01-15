"""
Passkey (WebAuthn) service for E2E encryption unlock.

Provides registration and authentication operations for WebAuthn passkeys
that use the PRF extension for encryption key derivation.
"""

from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from webauthn import (
    generate_authentication_options,
    generate_registration_options,
    options_to_json,
    verify_authentication_response,
    verify_registration_response,
)
from webauthn.helpers import base64url_to_bytes
from webauthn.helpers.structs import (
    AuthenticatorSelectionCriteria,
    AuthenticatorTransport,
    PublicKeyCredentialDescriptor,
    ResidentKeyRequirement,
    UserVerificationRequirement,
)

from app.config import get_settings
from app.models import User, UserPasskey, UserPreferences


def _str_to_transport(transport_str: str) -> AuthenticatorTransport | None:
    """Convert a transport string to AuthenticatorTransport enum."""
    try:
        return AuthenticatorTransport(transport_str)
    except ValueError:
        return None


def _transports_to_enum(transports: list[str] | None) -> list[AuthenticatorTransport] | None:
    """Convert list of transport strings to AuthenticatorTransport enums."""
    if not transports:
        return None
    result = [_str_to_transport(t) for t in transports]
    return [t for t in result if t is not None] or None


class PasskeyService:
    """Async service for WebAuthn passkey operations."""

    def __init__(self, db: AsyncSession, user_id: int):
        self.db = db
        self.user_id = user_id
        self.settings = get_settings()

    async def _get_user(self) -> User:
        """Get the current user."""
        result = await self.db.execute(select(User).where(User.id == self.user_id))
        user = result.scalar_one_or_none()
        if not user:
            raise ValueError(f"User {self.user_id} not found")
        return user

    async def _get_existing_credentials(self) -> list[PublicKeyCredentialDescriptor]:
        """Get all existing passkey credentials for this user."""
        result = await self.db.execute(select(UserPasskey).where(UserPasskey.user_id == self.user_id))
        passkeys = result.scalars().all()

        return [
            PublicKeyCredentialDescriptor(
                id=passkey.credential_id,
                transports=_transports_to_enum(passkey.transports),
            )
            for passkey in passkeys
        ]

    async def generate_registration_options(self) -> str:
        """
        Generate WebAuthn registration options for creating a new passkey.

        Returns JSON-encoded options for the browser.
        """
        user = await self._get_user()
        exclude_credentials = await self._get_existing_credentials()

        options = generate_registration_options(
            rp_id=self.settings.passkey_rp_id,
            rp_name=self.settings.passkey_rp_name,
            user_name=user.email,
            user_id=str(self.user_id).encode(),
            exclude_credentials=exclude_credentials,
            authenticator_selection=AuthenticatorSelectionCriteria(
                resident_key=ResidentKeyRequirement.PREFERRED,
                user_verification=UserVerificationRequirement.PREFERRED,
            ),
            timeout=60000,  # 60 seconds
        )

        return options_to_json(options)

    async def verify_registration(
        self,
        credential_json: str,
        name: str,
        prf_salt: str,
        wrapped_key: str,
        expected_challenge: bytes,
    ) -> UserPasskey:
        """
        Verify WebAuthn registration response and store the credential.

        Args:
            credential_json: JSON-encoded credential from navigator.credentials.create()
            name: User-provided name for this passkey (e.g., "1Password", "Touch ID")
            prf_salt: Salt used in PRF evaluation for key derivation
            wrapped_key: Master encryption key wrapped with the PRF-derived key
            expected_challenge: The challenge from generate_registration_options

        Returns:
            The created UserPasskey record
        """
        verification = verify_registration_response(
            credential=credential_json,
            expected_challenge=expected_challenge,
            expected_rp_id=self.settings.passkey_rp_id,
            expected_origin=self.settings.passkey_origin,
            require_user_verification=False,  # PRF doesn't require UV
        )

        # Extract transports from the credential response
        import json

        credential_data = json.loads(credential_json)
        transports = credential_data.get("response", {}).get("transports", [])

        # Create the passkey record
        passkey = UserPasskey(
            user_id=self.user_id,
            credential_id=verification.credential_id,
            public_key=verification.credential_public_key,
            sign_count=verification.sign_count,
            transports=transports if transports else None,
            name=name,
            prf_salt=prf_salt,
            wrapped_key=wrapped_key,
        )

        self.db.add(passkey)

        # Update user preferences to indicate passkey unlock is available
        prefs_result = await self.db.execute(select(UserPreferences).where(UserPreferences.user_id == self.user_id))
        prefs = prefs_result.scalar_one_or_none()
        if prefs and prefs.encryption_enabled:
            # If encryption is enabled and this is the first passkey, update unlock method
            if prefs.encryption_unlock_method == "passphrase":
                prefs.encryption_unlock_method = "both"
            elif not prefs.encryption_unlock_method:
                prefs.encryption_unlock_method = "passkey"

        await self.db.flush()
        return passkey

    async def generate_authentication_options(self) -> tuple[str, UserPasskey | None]:
        """
        Generate WebAuthn authentication options for verifying a passkey.

        Returns:
            Tuple of (JSON-encoded options, first passkey for PRF data) or (options, None) if no passkeys
        """
        result = await self.db.execute(select(UserPasskey).where(UserPasskey.user_id == self.user_id))
        passkeys = result.scalars().all()

        if not passkeys:
            # No passkeys registered - return empty options
            options = generate_authentication_options(
                rp_id=self.settings.passkey_rp_id,
                timeout=60000,
                user_verification=UserVerificationRequirement.PREFERRED,
            )
            return options_to_json(options), None

        # Create allow_credentials list from user's passkeys
        allow_credentials = [
            PublicKeyCredentialDescriptor(
                id=passkey.credential_id,
                transports=_transports_to_enum(passkey.transports),
            )
            for passkey in passkeys
        ]

        options = generate_authentication_options(
            rp_id=self.settings.passkey_rp_id,
            timeout=60000,
            allow_credentials=allow_credentials,
            user_verification=UserVerificationRequirement.PREFERRED,
        )

        # Return the first passkey for PRF salt/test value (all should work)
        return options_to_json(options), passkeys[0]

    async def verify_authentication(
        self,
        credential_json: str,
        expected_challenge: bytes,
    ) -> UserPasskey:
        """
        Verify WebAuthn authentication response.

        Args:
            credential_json: JSON-encoded assertion from navigator.credentials.get()
            expected_challenge: The challenge from generate_authentication_options

        Returns:
            The authenticated UserPasskey record

        Raises:
            ValueError: If verification fails or credential not found
        """
        import json

        credential_data = json.loads(credential_json)
        credential_id = base64url_to_bytes(credential_data["id"])

        # Find the passkey by credential ID
        result = await self.db.execute(
            select(UserPasskey).where(
                UserPasskey.user_id == self.user_id,
                UserPasskey.credential_id == credential_id,
            )
        )
        passkey = result.scalar_one_or_none()

        if not passkey:
            raise ValueError("Passkey not found")

        verification = verify_authentication_response(
            credential=credential_json,
            expected_challenge=expected_challenge,
            expected_rp_id=self.settings.passkey_rp_id,
            expected_origin=self.settings.passkey_origin,
            credential_public_key=passkey.public_key,
            credential_current_sign_count=passkey.sign_count,
            require_user_verification=False,
        )

        # Update sign count and last used timestamp
        passkey.sign_count = verification.new_sign_count
        passkey.last_used_at = datetime.now(UTC)

        await self.db.flush()
        return passkey

    async def get_passkey_for_credential(self, credential_id_base64: str) -> UserPasskey | None:
        """
        Get a passkey by its credential ID (base64url encoded).

        Used to look up PRF salt and test value for a specific credential.
        """
        credential_id = base64url_to_bytes(credential_id_base64)
        result = await self.db.execute(
            select(UserPasskey).where(
                UserPasskey.user_id == self.user_id,
                UserPasskey.credential_id == credential_id,
            )
        )
        return result.scalar_one_or_none()

    async def list_passkeys(self) -> list[UserPasskey]:
        """List all passkeys for this user."""
        result = await self.db.execute(
            select(UserPasskey).where(UserPasskey.user_id == self.user_id).order_by(UserPasskey.created_at.desc())
        )
        return list(result.scalars().all())

    async def get_passkey(self, passkey_id: int) -> UserPasskey | None:
        """Get a specific passkey by ID, only if owned by this user."""
        result = await self.db.execute(
            select(UserPasskey).where(
                UserPasskey.id == passkey_id,
                UserPasskey.user_id == self.user_id,
            )
        )
        return result.scalar_one_or_none()

    async def delete_passkey(self, passkey_id: int) -> bool:
        """
        Delete a passkey if owned by this user.

        Returns True if deleted, False if not found.
        """
        passkey = await self.get_passkey(passkey_id)
        if not passkey:
            return False

        await self.db.delete(passkey)

        # Check if this was the last passkey and update unlock method
        count = await self.get_passkey_count()
        if count == 0:
            prefs_result = await self.db.execute(select(UserPreferences).where(UserPreferences.user_id == self.user_id))
            prefs = prefs_result.scalar_one_or_none()
            if prefs and prefs.encryption_unlock_method == "both":
                prefs.encryption_unlock_method = "passphrase"
            elif prefs and prefs.encryption_unlock_method == "passkey":
                # No passkeys and no passphrase - this shouldn't happen normally
                # but reset to passphrase as a safe default
                prefs.encryption_unlock_method = "passphrase"

        await self.db.flush()
        return True

    async def get_passkey_count(self) -> int:
        """Count passkeys for this user."""
        result = await self.db.execute(select(func.count(UserPasskey.id)).where(UserPasskey.user_id == self.user_id))
        return result.scalar() or 0

    async def has_passkeys(self) -> bool:
        """Check if user has any passkeys registered."""
        count = await self.get_passkey_count()
        return count > 0
