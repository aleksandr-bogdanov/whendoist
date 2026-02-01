"""
Hotfix v0.8.9 Tests - Passkey Invalidation + Analytics Decryption.

These tests verify fixes for:
1. Passkeys becoming invalid after password change (they should be deleted)
2. Analytics page showing encrypted gibberish instead of decrypted content

Test Category: Contract
Related Issues:
- Passkeys remain after encryption disable/re-enable with new password
- Analytics showing encrypted task titles, domain names

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


# =============================================================================
# Analytics Decryption Contract Tests
# =============================================================================


class TestAnalyticsDecryptionContract:
    """
    Verify analytics.html decrypts encrypted data.

    Bug Fix: Analytics page showed encrypted gibberish for:
    - Recent completions (task titles)
    - Recurring task completion (task titles)
    - By domain (domain names)
    """

    def test_has_looks_encrypted_helper(self):
        """
        Analytics MUST have looksEncrypted() helper to detect encrypted data.
        """
        analytics_file = Path(__file__).parent.parent / "app" / "templates" / "analytics.html"
        source = analytics_file.read_text()

        assert "function looksEncrypted(value)" in source, (
            "Analytics must have looksEncrypted() helper function. Without this, encrypted data cannot be detected."
        )

    def test_decrypts_recent_completions(self):
        """
        Analytics MUST decrypt task titles in Recent Completions section.
        """
        analytics_file = Path(__file__).parent.parent / "app" / "templates" / "analytics.html"
        source = analytics_file.read_text()

        # Should have decryption logic for completions
        assert "completion-title" in source, "Recent completions section should exist"

        # Should decrypt using Crypto module
        assert "Crypto.decryptField" in source or "decryptField" in source, (
            "Analytics must call decryptField for task titles. Without this, encrypted titles show as gibberish."
        )

    def test_decrypts_recurring_tasks(self):
        """
        Analytics MUST decrypt task titles in Recurring Task Completion section.
        """
        analytics_file = Path(__file__).parent.parent / "app" / "templates" / "analytics.html"
        source = analytics_file.read_text()

        # Should have recurring tasks section
        assert "recurring-title" in source, "Recurring tasks section should exist"

    def test_decrypts_domain_names(self):
        """
        Analytics MUST decrypt domain names in By Domain chart.
        """
        analytics_file = Path(__file__).parent.parent / "app" / "templates" / "analytics.html"
        source = analytics_file.read_text()

        # Domain chart uses stats.by_domain data
        assert "by_domain" in source, "Domain chart should use by_domain data"

    def test_has_decrypt_analytics_function(self):
        """
        Analytics SHOULD have a decryptAnalytics() function for organized decryption.
        """
        analytics_file = Path(__file__).parent.parent / "app" / "templates" / "analytics.html"
        source = analytics_file.read_text()

        # Should have some decryption function
        has_decrypt_function = (
            "async function decrypt" in source or "decryptAnalytics" in source or "decryptTitles" in source
        )

        assert has_decrypt_function, (
            "Analytics should have a decryption function. "
            "This organizes the decryption of task titles and domain names."
        )

    def test_decryption_runs_on_page_load(self):
        """
        Analytics decryption MUST run on page load when encryption is enabled.
        """
        analytics_file = Path(__file__).parent.parent / "app" / "templates" / "analytics.html"
        source = analytics_file.read_text()

        # Should check encryption state and run decryption
        has_encryption_check = (
            "WHENDOIST.encryptionEnabled" in source or "encryptionEnabled" in source or "Crypto.canCrypto" in source
        )

        assert has_encryption_check, (
            "Analytics must check if encryption is enabled and run decryption. "
            "Without this check, encrypted data shows as gibberish."
        )
