"""
Hotfix v0.8.6 Tests - Plaintext Display with Encryption Enabled.

These tests verify the fix for showing lock icons (🔒) instead of actual
content when encryption is enabled but data is still plaintext.

Bug: When encryption_enabled=true but data hasn't been encrypted yet
(e.g., after Todoist import), the decryption JS would:
1. Try to decrypt plaintext data
2. Get back the same value (decryptField returns original for plaintext)
3. Skip the UI update because decryptedValue === originalValue
4. Leave the 🔒 placeholder visible

Fix: Added looksEncrypted() helper that checks if data is actually
encrypted (base64 format, min 38 chars for AES-GCM). If not encrypted,
display the plaintext directly without attempting decryption.

Test Category: Contract
Related Issues:
- Task list shows 🔒 for plaintext tasks after import
- Domain names show 🔒 for plaintext domains after import

See tests/README.md for full test architecture.
"""

from pathlib import Path

# =============================================================================
# Dashboard Decryption Contract Tests
# =============================================================================


class TestDashboardDecryptionContract:
    """
    Verify dashboard.html handles plaintext data when encryption is enabled.

    Bug Fix: Previously, decryption would skip UI update when decrypted === original,
    leaving 🔒 visible for plaintext data.
    """

    def test_has_looks_encrypted_helper(self):
        """
        Dashboard MUST have looksEncrypted() helper to detect encrypted data.

        This helper prevents trying to decrypt plaintext data, which would
        result in the same value and skip the UI update.
        """
        dashboard_file = Path(__file__).parent.parent / "app" / "templates" / "dashboard.html"
        source = dashboard_file.read_text()

        assert "function looksEncrypted(value)" in source, (
            "Dashboard must have looksEncrypted() helper function. Without this, plaintext data shows as 🔒."
        )

    def test_checks_if_encrypted_before_decrypt(self):
        """
        Dashboard MUST check if data looks encrypted before decrypting.

        Contract: The decryption code should call looksEncrypted() and
        only decrypt if data appears to be encrypted.
        """
        dashboard_file = Path(__file__).parent.parent / "app" / "templates" / "dashboard.html"
        source = dashboard_file.read_text()

        # Find the decryptEncryptedContent function
        assert "async function decryptEncryptedContent()" in source, "decryptEncryptedContent function must exist"

        # Extract the decryption section
        decrypt_section = source.split("async function decryptEncryptedContent()")[1]
        decrypt_section = decrypt_section.split("})();")[0]

        # Should use looksEncrypted() to check before decrypting
        assert "looksEncrypted(title)" in decrypt_section, (
            "Dashboard must check looksEncrypted(title) before decrypting tasks. "
            "Without this check, plaintext data causes UI update to be skipped."
        )

    def test_no_equality_skip_for_task_titles(self):
        """
        Dashboard must NOT skip update when decrypted === encrypted.

        Bug: Old code had `if (decryptedTitle === encryptedTitle) continue;`
        which skipped update for plaintext data.
        """
        dashboard_file = Path(__file__).parent.parent / "app" / "templates" / "dashboard.html"
        source = dashboard_file.read_text()

        decrypt_section = source.split("async function decryptEncryptedContent()")[1]
        decrypt_section = decrypt_section.split("})();")[0]

        # Should NOT have the buggy equality check
        assert "decryptedTitle === encryptedTitle" not in decrypt_section, (
            "Dashboard must NOT skip update when decryptedTitle === encryptedTitle. "
            "This condition causes plaintext data to show as 🔒."
        )

    def test_displays_plaintext_on_error(self):
        """
        Dashboard MUST display original value on decryption error.

        If decryption fails (e.g., wrong key, corrupted data), the UI
        should fall back to showing the original value.
        """
        dashboard_file = Path(__file__).parent.parent / "app" / "templates" / "dashboard.html"
        source = dashboard_file.read_text()

        decrypt_section = source.split("async function decryptEncryptedContent()")[1]
        decrypt_section = decrypt_section.split("})();")[0]

        # Should have catch block that displays original
        assert "catch" in decrypt_section, "Dashboard must have error handling for decryption"
        assert "taskText.textContent = title" in decrypt_section, (
            "Dashboard must display original title on decryption error. "
            "Without this, failed decryption leaves 🔒 visible."
        )


# =============================================================================
# Settings Decryption Contract Tests
# =============================================================================


class TestSettingsDecryptionContract:
    """
    Verify settings.html handles plaintext domain names when encryption is enabled.

    Bug Fix: Previously, domain name decryption would skip UI update when
    decrypted === original, leaving 🔒 visible for plaintext domains.
    """

    def test_has_looks_encrypted_helper(self):
        """
        Settings MUST have looksEncrypted() helper to detect encrypted data.
        """
        settings_file = Path(__file__).parent.parent / "app" / "templates" / "settings.html"
        source = settings_file.read_text()

        # Find the decryptDomainNames function section
        assert "async function decryptDomainNames()" in source, "decryptDomainNames function must exist"

        decrypt_section = source.split("async function decryptDomainNames()")[1]
        decrypt_section = decrypt_section.split("})();")[0]

        assert "function looksEncrypted(value)" in decrypt_section, (
            "Settings must have looksEncrypted() helper function. Without this, plaintext domain names show as 🔒."
        )

    def test_checks_if_encrypted_before_decrypt(self):
        """
        Settings MUST check if domain name looks encrypted before decrypting.
        """
        settings_file = Path(__file__).parent.parent / "app" / "templates" / "settings.html"
        source = settings_file.read_text()

        decrypt_section = source.split("async function decryptDomainNames()")[1]
        decrypt_section = decrypt_section.split("})();")[0]

        assert "looksEncrypted(name)" in decrypt_section, (
            "Settings must check looksEncrypted(name) before decrypting domains. "
            "Without this check, plaintext data causes UI update to be skipped."
        )

    def test_no_equality_skip_for_domain_names(self):
        """
        Settings must NOT skip update when decrypted === encrypted.

        Bug: Old code had `if (decryptedName === encryptedName) continue;`
        which skipped update for plaintext data.
        """
        settings_file = Path(__file__).parent.parent / "app" / "templates" / "settings.html"
        source = settings_file.read_text()

        decrypt_section = source.split("async function decryptDomainNames()")[1]
        decrypt_section = decrypt_section.split("})();")[0]

        assert "decryptedName === encryptedName" not in decrypt_section, (
            "Settings must NOT skip update when decryptedName === encryptedName. "
            "This condition causes plaintext domain names to show as 🔒."
        )

    def test_displays_plaintext_on_error(self):
        """
        Settings MUST display original domain name on decryption error.
        """
        settings_file = Path(__file__).parent.parent / "app" / "templates" / "settings.html"
        source = settings_file.read_text()

        decrypt_section = source.split("async function decryptDomainNames()")[1]
        decrypt_section = decrypt_section.split("})();")[0]

        assert "catch" in decrypt_section, "Settings must have error handling for decryption"
        assert "nameEl.textContent = name" in decrypt_section, (
            "Settings must display original domain name on decryption error. "
            "Without this, failed decryption leaves 🔒 visible."
        )


# =============================================================================
# looksEncrypted() Function Contract Tests
# =============================================================================


class TestLooksEncryptedContract:
    """
    Verify the looksEncrypted() helper function has correct logic.

    The function must detect AES-256-GCM encrypted data format:
    - Base64 encoded
    - Minimum 38 characters (12 bytes IV + 16 bytes tag = 28 bytes = ~38 base64 chars)
    """

    def test_dashboard_checks_minimum_length(self):
        """
        Dashboard looksEncrypted() MUST check minimum length of 38 chars.
        """
        dashboard_file = Path(__file__).parent.parent / "app" / "templates" / "dashboard.html"
        source = dashboard_file.read_text()

        # Find looksEncrypted function in dashboard
        assert "value.length < 38" in source, (
            "Dashboard looksEncrypted() must check minimum length of 38 chars. "
            "AES-GCM overhead (IV + tag) requires at least 38 base64 chars."
        )

    def test_dashboard_checks_base64_format(self):
        """
        Dashboard looksEncrypted() MUST verify base64 character set.
        """
        dashboard_file = Path(__file__).parent.parent / "app" / "templates" / "dashboard.html"
        source = dashboard_file.read_text()

        # Should have base64 regex check
        assert "A-Za-z0-9+/" in source, "Dashboard looksEncrypted() must check for base64 character set."

    def test_settings_checks_minimum_length(self):
        """
        Settings looksEncrypted() MUST check minimum length of 38 chars.
        """
        settings_file = Path(__file__).parent.parent / "app" / "templates" / "settings.html"
        source = settings_file.read_text()

        decrypt_section = source.split("async function decryptDomainNames()")[1]
        decrypt_section = decrypt_section.split("})();")[0]

        assert "value.length < 38" in decrypt_section, (
            "Settings looksEncrypted() must check minimum length of 38 chars."
        )

    def test_settings_checks_base64_format(self):
        """
        Settings looksEncrypted() MUST verify base64 character set.
        """
        settings_file = Path(__file__).parent.parent / "app" / "templates" / "settings.html"
        source = settings_file.read_text()

        decrypt_section = source.split("async function decryptDomainNames()")[1]
        decrypt_section = decrypt_section.split("})();")[0]

        assert "A-Za-z0-9+/" in decrypt_section, "Settings looksEncrypted() must check for base64 character set."
