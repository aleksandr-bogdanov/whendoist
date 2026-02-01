"""
Passkey (WebAuthn) Tests.

Comprehensive tests for the passkey-based E2E encryption unlock in Whendoist.
Tests cover the service layer, multitenancy isolation, and JavaScript module contracts.

Test Category: Unit (async, uses in-memory SQLite) + Contract (JS verification)
Related Code:
- app/services/passkey_service.py (WebAuthn credential management)
- app/routers/passkeys.py (passkey API endpoints)
- app/models.py (UserPasskey model)
- static/js/passkey.js (client-side WebAuthn + PRF)

Architecture Overview (Key Wrapping):
- Master key: The actual AES-256-GCM encryption key (from passphrase or first passkey)
- Wrapping key: PRF-derived key used to wrap/unwrap the master key
- Each passkey stores: wrapped_key = encrypt(wrapping_key, master_key)
- All passkeys unwrap to the SAME master key

Flow:
- Registration: User unlocks with passphrase → PRF derives wrapping key → wrap master key → store
- Authentication: PRF derives wrapping key → unwrap to get master key → verify against test value

Security Guarantees Tested:
1. Multitenancy isolation - User A cannot access User B's passkeys
2. Credential lookup requires user_id match
3. Delete operations respect ownership
4. Wrapped key architecture ensures all passkeys unlock same data

See tests/README.md for full test architecture.
"""

from pathlib import Path

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User, UserPasskey, UserPreferences
from app.services.passkey_service import PasskeyService
from app.services.preferences_service import PreferencesService

JS_DIR = Path(__file__).parent.parent / "static" / "js"


# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
async def test_user(db_session: AsyncSession) -> User:
    """Create a test user."""
    user = User(email="test@example.com")
    db_session.add(user)
    await db_session.flush()
    return user


@pytest.fixture
async def test_user_2(db_session: AsyncSession) -> User:
    """Create a second test user for multitenancy tests."""
    user = User(email="other@example.com")
    db_session.add(user)
    await db_session.flush()
    return user


@pytest.fixture
async def user_with_encryption(db_session: AsyncSession, test_user: User) -> User:
    """Create a user with encryption enabled."""
    service = PreferencesService(db_session, test_user.id)
    await service.setup_encryption(salt="dGVzdC1zYWx0LWJhc2U2NC1lbmNvZGVk", test_value="encrypted-test-value-here")
    await db_session.commit()
    return test_user


@pytest.fixture
async def test_passkey(db_session: AsyncSession, user_with_encryption: User) -> UserPasskey:
    """Create a test passkey for the user."""
    passkey = UserPasskey(
        user_id=user_with_encryption.id,
        credential_id=b"test-credential-id-bytes",
        public_key=b"test-public-key-bytes",
        sign_count=0,
        transports=["internal"],
        name="Test Passkey",
        prf_salt="dGVzdC1wcmYtc2FsdA",
        wrapped_key="dGVzdC13cmFwcGVkLWtleS1kYXRh",
    )
    db_session.add(passkey)
    await db_session.flush()
    return passkey


@pytest.fixture
async def multiple_passkeys(db_session: AsyncSession, user_with_encryption: User) -> list[UserPasskey]:
    """Create multiple passkeys for testing multi-passkey scenarios."""
    passkeys = []
    for i in range(3):
        passkey = UserPasskey(
            user_id=user_with_encryption.id,
            credential_id=f"credential-{i}".encode(),
            public_key=f"public-key-{i}".encode(),
            sign_count=i,
            transports=["internal", "usb"] if i % 2 == 0 else ["internal"],
            name=f"Passkey {i + 1}",
            prf_salt=f"salt-{i}",
            wrapped_key=f"wrapped-key-{i}",
        )
        db_session.add(passkey)
        passkeys.append(passkey)
    await db_session.flush()
    return passkeys


# =============================================================================
# PasskeyService Unit Tests
# =============================================================================


class TestPasskeyServiceBasics:
    """Test basic PasskeyService operations."""

    async def test_service_initialization(self, db_session: AsyncSession, test_user: User):
        """Service initializes with correct user context."""
        service = PasskeyService(db_session, test_user.id)
        assert service.user_id == test_user.id
        assert service.db == db_session

    async def test_has_passkeys_false_when_none(self, db_session: AsyncSession, test_user: User):
        """has_passkeys returns False when user has no passkeys."""
        service = PasskeyService(db_session, test_user.id)
        result = await service.has_passkeys()
        assert result is False

    async def test_has_passkeys_true_when_exists(
        self, db_session: AsyncSession, user_with_encryption: User, test_passkey: UserPasskey
    ):
        """has_passkeys returns True when user has passkeys."""
        service = PasskeyService(db_session, user_with_encryption.id)
        result = await service.has_passkeys()
        assert result is True

    async def test_get_passkey_count_zero(self, db_session: AsyncSession, test_user: User):
        """get_passkey_count returns 0 when user has no passkeys."""
        service = PasskeyService(db_session, test_user.id)
        count = await service.get_passkey_count()
        assert count == 0

    async def test_get_passkey_count_accurate(
        self, db_session: AsyncSession, user_with_encryption: User, multiple_passkeys: list[UserPasskey]
    ):
        """get_passkey_count returns accurate count."""
        service = PasskeyService(db_session, user_with_encryption.id)
        count = await service.get_passkey_count()
        assert count == 3


class TestPasskeyServiceList:
    """Test passkey listing operations."""

    async def test_list_passkeys_empty(self, db_session: AsyncSession, test_user: User):
        """list_passkeys returns empty list when none exist."""
        service = PasskeyService(db_session, test_user.id)
        passkeys = await service.list_passkeys()
        assert passkeys == []

    async def test_list_passkeys_returns_all(
        self, db_session: AsyncSession, user_with_encryption: User, multiple_passkeys: list[UserPasskey]
    ):
        """list_passkeys returns all passkeys for user."""
        service = PasskeyService(db_session, user_with_encryption.id)
        passkeys = await service.list_passkeys()
        assert len(passkeys) == 3

    async def test_list_passkeys_returns_correct_names(
        self, db_session: AsyncSession, user_with_encryption: User, multiple_passkeys: list[UserPasskey]
    ):
        """list_passkeys returns passkeys with correct data."""
        service = PasskeyService(db_session, user_with_encryption.id)
        passkeys = await service.list_passkeys()
        # All three passkeys should be returned
        names = {p.name for p in passkeys}
        assert names == {"Passkey 1", "Passkey 2", "Passkey 3"}


class TestPasskeyServiceGet:
    """Test passkey retrieval operations."""

    async def test_get_passkey_returns_owned(
        self, db_session: AsyncSession, user_with_encryption: User, test_passkey: UserPasskey
    ):
        """get_passkey returns passkey when user owns it."""
        service = PasskeyService(db_session, user_with_encryption.id)
        passkey = await service.get_passkey(test_passkey.id)
        assert passkey is not None
        assert passkey.id == test_passkey.id
        assert passkey.name == "Test Passkey"

    async def test_get_passkey_returns_none_for_nonexistent(self, db_session: AsyncSession, test_user: User):
        """get_passkey returns None for non-existent ID."""
        service = PasskeyService(db_session, test_user.id)
        passkey = await service.get_passkey(99999)
        assert passkey is None


class TestPasskeyServiceDelete:
    """Test passkey deletion operations."""

    async def test_delete_passkey_success(
        self, db_session: AsyncSession, user_with_encryption: User, test_passkey: UserPasskey
    ):
        """delete_passkey removes passkey and returns True."""
        service = PasskeyService(db_session, user_with_encryption.id)
        result = await service.delete_passkey(test_passkey.id)
        assert result is True

        # Verify deleted
        count = await service.get_passkey_count()
        assert count == 0

    async def test_delete_passkey_returns_false_for_nonexistent(self, db_session: AsyncSession, test_user: User):
        """delete_passkey returns False for non-existent ID."""
        service = PasskeyService(db_session, test_user.id)
        result = await service.delete_passkey(99999)
        assert result is False

    async def test_delete_passkey_updates_unlock_method_when_last(
        self, db_session: AsyncSession, user_with_encryption: User, test_passkey: UserPasskey
    ):
        """Deleting last passkey updates unlock_method to passphrase."""
        # First set unlock method to 'both'
        prefs_result = await db_session.execute(
            select(UserPreferences).where(UserPreferences.user_id == user_with_encryption.id)
        )
        prefs = prefs_result.scalar_one()
        prefs.encryption_unlock_method = "both"
        await db_session.flush()

        # Delete the only passkey
        service = PasskeyService(db_session, user_with_encryption.id)
        await service.delete_passkey(test_passkey.id)

        # Verify unlock method changed
        prefs_result = await db_session.execute(
            select(UserPreferences).where(UserPreferences.user_id == user_with_encryption.id)
        )
        prefs = prefs_result.scalar_one()
        assert prefs.encryption_unlock_method == "passphrase"


# =============================================================================
# Multitenancy Isolation Tests (CRITICAL)
# =============================================================================


class TestPasskeyMultitenancy:
    """
    Test multitenancy isolation for passkeys.

    CRITICAL: These tests ensure User A cannot access User B's passkeys.
    Any failure here is a security vulnerability.
    """

    async def test_list_passkeys_only_returns_own(
        self,
        db_session: AsyncSession,
        user_with_encryption: User,
        test_user_2: User,
        test_passkey: UserPasskey,
    ):
        """list_passkeys only returns passkeys owned by the requesting user."""
        # User 2 should see no passkeys
        service = PasskeyService(db_session, test_user_2.id)
        passkeys = await service.list_passkeys()
        assert len(passkeys) == 0

        # User 1 should see their passkey
        service = PasskeyService(db_session, user_with_encryption.id)
        passkeys = await service.list_passkeys()
        assert len(passkeys) == 1

    async def test_get_passkey_requires_ownership(
        self,
        db_session: AsyncSession,
        user_with_encryption: User,
        test_user_2: User,
        test_passkey: UserPasskey,
    ):
        """get_passkey returns None when user doesn't own the passkey."""
        # User 2 tries to get User 1's passkey
        service = PasskeyService(db_session, test_user_2.id)
        passkey = await service.get_passkey(test_passkey.id)
        assert passkey is None

    async def test_delete_passkey_requires_ownership(
        self,
        db_session: AsyncSession,
        user_with_encryption: User,
        test_user_2: User,
        test_passkey: UserPasskey,
    ):
        """delete_passkey returns False when user doesn't own the passkey."""
        # User 2 tries to delete User 1's passkey
        service = PasskeyService(db_session, test_user_2.id)
        result = await service.delete_passkey(test_passkey.id)
        assert result is False

        # Verify passkey still exists
        service = PasskeyService(db_session, user_with_encryption.id)
        count = await service.get_passkey_count()
        assert count == 1

    async def test_get_passkey_for_credential_requires_ownership(
        self,
        db_session: AsyncSession,
        user_with_encryption: User,
        test_user_2: User,
        test_passkey: UserPasskey,
    ):
        """get_passkey_for_credential returns None for other user's credential."""
        from webauthn.helpers import bytes_to_base64url

        credential_id_b64 = bytes_to_base64url(test_passkey.credential_id)

        # User 2 tries to look up User 1's credential
        service = PasskeyService(db_session, test_user_2.id)
        passkey = await service.get_passkey_for_credential(credential_id_b64)
        assert passkey is None

        # User 1 can look up their own credential
        service = PasskeyService(db_session, user_with_encryption.id)
        passkey = await service.get_passkey_for_credential(credential_id_b64)
        assert passkey is not None

    async def test_has_passkeys_scoped_to_user(
        self,
        db_session: AsyncSession,
        user_with_encryption: User,
        test_user_2: User,
        test_passkey: UserPasskey,
    ):
        """has_passkeys only considers the requesting user's passkeys."""
        # User 1 has passkeys
        service = PasskeyService(db_session, user_with_encryption.id)
        assert await service.has_passkeys() is True

        # User 2 does not
        service = PasskeyService(db_session, test_user_2.id)
        assert await service.has_passkeys() is False

    async def test_get_passkey_count_scoped_to_user(
        self,
        db_session: AsyncSession,
        user_with_encryption: User,
        test_user_2: User,
        multiple_passkeys: list[UserPasskey],
    ):
        """get_passkey_count only counts the requesting user's passkeys."""
        # User 1 has 3 passkeys
        service = PasskeyService(db_session, user_with_encryption.id)
        assert await service.get_passkey_count() == 3

        # User 2 has 0
        service = PasskeyService(db_session, test_user_2.id)
        assert await service.get_passkey_count() == 0


# =============================================================================
# Data Model Tests
# =============================================================================


class TestPasskeyDataModel:
    """Test the UserPasskey data model structure."""

    async def test_passkey_stores_wrapped_key_not_test_value(
        self, db_session: AsyncSession, user_with_encryption: User, test_passkey: UserPasskey
    ):
        """
        UserPasskey must store wrapped_key, not encryption_test_value.

        This is the correct architecture for multi-passkey support.
        Each passkey wraps the same master key.
        """
        # Verify the model has wrapped_key attribute
        assert hasattr(test_passkey, "wrapped_key")
        assert test_passkey.wrapped_key is not None

        # Verify the old broken attribute doesn't exist
        assert not hasattr(test_passkey, "encryption_test_value")

    async def test_passkey_has_required_webauthn_fields(
        self, db_session: AsyncSession, user_with_encryption: User, test_passkey: UserPasskey
    ):
        """UserPasskey has all required WebAuthn fields."""
        assert test_passkey.credential_id is not None
        assert test_passkey.public_key is not None
        assert test_passkey.sign_count is not None
        assert test_passkey.prf_salt is not None

    async def test_passkey_has_user_friendly_metadata(
        self, db_session: AsyncSession, user_with_encryption: User, test_passkey: UserPasskey
    ):
        """UserPasskey stores user-friendly metadata."""
        assert test_passkey.name is not None
        assert test_passkey.created_at is not None
        # last_used_at can be None initially
        assert hasattr(test_passkey, "last_used_at")


# =============================================================================
# Passkey.js Contract Tests (Architecture Verification)
# =============================================================================


class TestPasskeyJSModuleAPI:
    """Verify passkey.js exports the required public API."""

    @pytest.fixture
    def passkey_js(self) -> str:
        return (JS_DIR / "passkey.js").read_text()

    def test_exports_support_detection(self, passkey_js: str):
        """Must export browser support detection functions."""
        assert "isSupported" in passkey_js
        assert "isPrfLikelySupported" in passkey_js

    def test_exports_registration_function(self, passkey_js: str):
        """Must export registerPasskey for creating new passkeys."""
        assert "async function registerPasskey" in passkey_js

    def test_exports_authentication_function(self, passkey_js: str):
        """Must export unlockWithPasskey for authenticating."""
        assert "async function unlockWithPasskey" in passkey_js


class TestPasskeyJSKeyWrapping:
    """
    Verify passkey.js implements correct key wrapping architecture.

    This is CRITICAL for multi-passkey support. Without key wrapping,
    each passkey would derive its own independent key.
    """

    @pytest.fixture
    def passkey_js(self) -> str:
        return (JS_DIR / "passkey.js").read_text()

    def test_has_wrap_function(self, passkey_js: str):
        """Must have wrapMasterKey function."""
        assert "async function wrapMasterKey" in passkey_js

    def test_has_unwrap_function(self, passkey_js: str):
        """Must have unwrapMasterKey function."""
        assert "async function unwrapMasterKey" in passkey_js

    def test_wrap_uses_aes_gcm(self, passkey_js: str):
        """Key wrapping must use AES-GCM."""
        # Check for AES-GCM usage in wrap/unwrap context
        assert "AES-GCM" in passkey_js

    def test_wrap_exports_master_key(self, passkey_js: str):
        """wrapMasterKey must export the master key to raw bytes."""
        assert "exportKey" in passkey_js
        assert "'raw'" in passkey_js

    def test_unwrap_imports_master_key(self, passkey_js: str):
        """unwrapMasterKey must import the decrypted key as CryptoKey."""
        assert "importKey" in passkey_js


class TestPasskeyJSRegistrationFlow:
    """Verify passkey.js registration flow is correct."""

    @pytest.fixture
    def passkey_js(self) -> str:
        return (JS_DIR / "passkey.js").read_text()

    def test_checks_unlock_state(self, passkey_js: str):
        """Registration must verify encryption is unlocked."""
        assert "Crypto.hasStoredKey()" in passkey_js

    def test_retrieves_master_key(self, passkey_js: str):
        """Registration must get the current master key."""
        assert "Crypto.getStoredKey()" in passkey_js

    def test_calls_wrap_master_key(self, passkey_js: str):
        """Registration must wrap the master key."""
        assert "wrapMasterKey" in passkey_js

    def test_sends_wrapped_key_to_server(self, passkey_js: str):
        """Registration must send wrapped_key (not encryption_test_value)."""
        assert "wrapped_key:" in passkey_js or 'wrapped_key":' in passkey_js


class TestPasskeyJSAuthenticationFlow:
    """Verify passkey.js authentication flow is correct."""

    @pytest.fixture
    def passkey_js(self) -> str:
        return (JS_DIR / "passkey.js").read_text()

    def test_calls_unwrap_master_key(self, passkey_js: str):
        """Authentication must unwrap the master key."""
        assert "unwrapMasterKey" in passkey_js

    def test_verifies_against_test_value(self, passkey_js: str):
        """Authentication must verify the unwrapped key."""
        assert "WHENDOIST_ENCRYPTION_TEST" in passkey_js

    def test_stores_master_key(self, passkey_js: str):
        """Authentication must store the master key in session."""
        assert "Crypto.storeKey" in passkey_js

    def test_handles_credential_mismatch(self, passkey_js: str):
        """Authentication must handle when wrong credential is selected."""
        # The retry logic for looking up the correct wrapped_key
        assert "by-credential" in passkey_js


class TestPasskeyJSErrorHandling:
    """Verify passkey.js has proper error handling."""

    @pytest.fixture
    def passkey_js(self) -> str:
        return (JS_DIR / "passkey.js").read_text()

    def test_registration_returns_error_object(self, passkey_js: str):
        """registerPasskey must return { success, error } format."""
        assert "return { success: true }" in passkey_js
        assert "return {" in passkey_js and "success: false" in passkey_js

    def test_authentication_returns_error_object(self, passkey_js: str):
        """unlockWithPasskey must return { success, error } format."""
        # Both functions use same pattern
        assert passkey_js.count("success: true") >= 2
        assert passkey_js.count("success: false") >= 2

    def test_logs_errors_to_console(self, passkey_js: str):
        """Errors must be logged for debugging."""
        assert "console.error" in passkey_js


class TestPasskeyJSDocumentation:
    """Verify passkey.js is properly documented."""

    @pytest.fixture
    def passkey_js(self) -> str:
        return (JS_DIR / "passkey.js").read_text()

    def test_has_module_header(self, passkey_js: str):
        """Module must have architecture documentation."""
        assert "Architecture:" in passkey_js

    def test_documents_master_key_concept(self, passkey_js: str):
        """Must document the master key concept."""
        assert "master key" in passkey_js.lower() or "Master key" in passkey_js

    def test_documents_wrapping_key_concept(self, passkey_js: str):
        """Must document the wrapping key concept."""
        assert "wrapping key" in passkey_js.lower() or "Wrapping key" in passkey_js


# =============================================================================
# Integration Contract Tests (API Paths)
# =============================================================================


class TestPasskeyAPIContract:
    """Verify passkey.js uses correct API endpoints."""

    @pytest.fixture
    def passkey_js(self) -> str:
        return (JS_DIR / "passkey.js").read_text()

    def test_registration_options_endpoint(self, passkey_js: str):
        """/api/v1/passkeys/register/options endpoint."""
        assert "/api/v1/passkeys/register/options" in passkey_js

    def test_registration_verify_endpoint(self, passkey_js: str):
        """/api/v1/passkeys/register/verify endpoint."""
        assert "/api/v1/passkeys/register/verify" in passkey_js

    def test_authentication_options_endpoint(self, passkey_js: str):
        """/api/v1/passkeys/authenticate/options endpoint."""
        assert "/api/v1/passkeys/authenticate/options" in passkey_js

    def test_authentication_verify_endpoint(self, passkey_js: str):
        """/api/v1/passkeys/authenticate/verify endpoint."""
        assert "/api/v1/passkeys/authenticate/verify" in passkey_js

    def test_credential_lookup_endpoint(self, passkey_js: str):
        """/api/v1/passkeys/by-credential/ endpoint for retry logic."""
        assert "/api/v1/passkeys/by-credential/" in passkey_js
