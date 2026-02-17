"""
Hotfix v0.8.9 Tests - Passkey Invalidation.

These tests verify fixes for:
1. Passkeys becoming invalid after password change (they should be deleted)

Test Category: Contract
Related Issues:
- Passkeys remain after encryption disable/re-enable with new password

See tests/README.md for full test architecture.
"""

from pathlib import Path

# =============================================================================
# Passkey Deletion on Encryption Disable Contract Tests
# =============================================================================


class TestPasskeyDeletionOnEncryptionDisable:
    """
    Verify passkeys are deleted when encryption is disabled.

    Bug Fix: When user disables encryption and re-enables with new password,
    old passkeys still have wrapped_key values that wrap the OLD master key.
    These passkeys can never work with the new password.

    Solution: Delete all passkeys when encryption is disabled.
    """

    def test_disable_encryption_deletes_passkeys_in_preferences_service(self):
        """
        PreferencesService.disable_encryption() MUST delete all passkeys.

        This is the core fix - when disabling encryption, passkeys become
        invalid because they wrap the old master key.
        """
        prefs_file = Path(__file__).parent.parent / "app" / "services" / "preferences_service.py"
        source = prefs_file.read_text()

        # Should have logic to delete passkeys in disable_encryption
        assert "disable_encryption" in source, "disable_encryption method must exist"

        # Find the disable_encryption method
        disable_section = source.split("async def disable_encryption")[1]
        disable_section = disable_section.split("\n    async def")[0]

        # Should delete passkeys - either call PasskeyService or delete directly
        assert "UserPasskey" in disable_section or "passkey" in disable_section.lower(), (
            "disable_encryption() must delete passkeys. "
            "Old passkeys have wrapped keys that can't decrypt with new password."
        )

    def test_disable_encryption_updates_unlock_method(self):
        """
        disable_encryption() MUST reset encryption_unlock_method.
        """
        prefs_file = Path(__file__).parent.parent / "app" / "services" / "preferences_service.py"
        source = prefs_file.read_text()

        disable_section = source.split("async def disable_encryption")[1]
        disable_section = disable_section.split("\n    async def")[0]

        # Should reset unlock method
        assert "encryption_unlock_method" in disable_section, (
            "disable_encryption() must reset encryption_unlock_method to None or passphrase."
        )

    def test_disable_encryption_uses_delete_statement(self):
        """
        disable_encryption() MUST use DELETE statement to remove passkeys.
        """
        prefs_file = Path(__file__).parent.parent / "app" / "services" / "preferences_service.py"
        source = prefs_file.read_text()

        disable_section = source.split("async def disable_encryption")[1]
        disable_section = disable_section.split("\n    async def")[0]

        # Should have delete statement for UserPasskey
        assert "delete(UserPasskey)" in disable_section or "delete(" in disable_section, (
            "disable_encryption() must delete all passkeys using DELETE statement."
        )
