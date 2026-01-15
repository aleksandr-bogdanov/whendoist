"""
Hotfix v0.8.8 Tests - Double Encryption Prevention.

These tests verify the fix for:
- Items created before enabling encryption being double-encrypted after import

Test Category: Contract
Related Issue:
- User creates item → enables encryption → item encrypted → imports Todoist →
  encryptAllData() encrypts AGAIN → content becomes gibberish

See tests/README.md for full test architecture.
"""

from pathlib import Path

# =============================================================================
# Double Encryption Prevention Contract Tests
# =============================================================================


class TestDoubleEncryptionPrevention:
    """
    Verify encryptAllData() skips already-encrypted values.

    Bug Fix: encryptAllData() was encrypting ALL data regardless of whether
    it was already encrypted, causing double-encryption of pre-existing items.
    """

    def test_has_looks_encrypted_helper(self):
        """
        crypto.js MUST have looksEncrypted() helper function.
        """
        crypto_file = Path(__file__).parent.parent / "static" / "js" / "crypto.js"
        source = crypto_file.read_text()

        assert "function looksEncrypted(value)" in source, (
            "crypto.js must have looksEncrypted() helper function. "
            "Without this, encryptAllData() cannot detect already-encrypted data."
        )

    def test_looks_encrypted_checks_length(self):
        """
        looksEncrypted() MUST check minimum length (38 chars for AES-GCM).
        """
        crypto_file = Path(__file__).parent.parent / "static" / "js" / "crypto.js"
        source = crypto_file.read_text()

        # Find the looksEncrypted function
        assert "looksEncrypted" in source, "crypto.js must have looksEncrypted function"

        # Should check for minimum length (38 chars = 12 bytes IV + 16 bytes tag encoded)
        assert "value.length < 38" in source or "length < 38" in source, (
            "looksEncrypted() must check minimum length. "
            "AES-256-GCM minimum: 12 bytes IV + 16 bytes tag = 28 bytes = ~38 base64 chars."
        )

    def test_looks_encrypted_checks_base64_pattern(self):
        """
        looksEncrypted() MUST validate base64 pattern.
        """
        crypto_file = Path(__file__).parent.parent / "static" / "js" / "crypto.js"
        source = crypto_file.read_text()

        # Should check for base64 pattern
        assert "[A-Za-z0-9+/]" in source, (
            "looksEncrypted() must validate base64 pattern. Encrypted data is always base64-encoded."
        )

    def test_encrypt_all_data_uses_looks_encrypted_for_tasks(self):
        """
        encryptAllData() MUST check looksEncrypted() before encrypting task titles.
        """
        crypto_file = Path(__file__).parent.parent / "static" / "js" / "crypto.js"
        source = crypto_file.read_text()

        # Find the encryptAllData function
        assert "async function encryptAllData" in source, "crypto.js must have encryptAllData function"

        # Extract the function body
        encrypt_section = source.split("async function encryptAllData")[1]
        # Find the end of the function (next function definition or end of module)
        if "async function decryptAllData" in encrypt_section:
            encrypt_section = encrypt_section.split("async function decryptAllData")[0]

        # Should check looksEncrypted for task.title
        assert "looksEncrypted(task.title)" in encrypt_section, (
            "encryptAllData() must check looksEncrypted(task.title) before encrypting. "
            "Without this check, already-encrypted titles get double-encrypted."
        )

    def test_encrypt_all_data_uses_looks_encrypted_for_descriptions(self):
        """
        encryptAllData() MUST check looksEncrypted() for task descriptions.
        """
        crypto_file = Path(__file__).parent.parent / "static" / "js" / "crypto.js"
        source = crypto_file.read_text()

        encrypt_section = source.split("async function encryptAllData")[1]
        if "async function decryptAllData" in encrypt_section:
            encrypt_section = encrypt_section.split("async function decryptAllData")[0]

        # Should check looksEncrypted for task.description
        assert "looksEncrypted(task.description)" in encrypt_section, (
            "encryptAllData() must check looksEncrypted(task.description) before encrypting. "
            "Without this check, already-encrypted descriptions get double-encrypted."
        )

    def test_encrypt_all_data_uses_looks_encrypted_for_domains(self):
        """
        encryptAllData() MUST check looksEncrypted() for domain names.
        """
        crypto_file = Path(__file__).parent.parent / "static" / "js" / "crypto.js"
        source = crypto_file.read_text()

        encrypt_section = source.split("async function encryptAllData")[1]
        if "async function decryptAllData" in encrypt_section:
            encrypt_section = encrypt_section.split("async function decryptAllData")[0]

        # Should check looksEncrypted for domain.name
        assert "looksEncrypted(domain.name)" in encrypt_section, (
            "encryptAllData() must check looksEncrypted(domain.name) before encrypting. "
            "Without this check, already-encrypted domain names get double-encrypted."
        )

    def test_encrypt_all_data_skips_encrypted_values(self):
        """
        encryptAllData() MUST skip encryption when value looks encrypted.
        """
        crypto_file = Path(__file__).parent.parent / "static" / "js" / "crypto.js"
        source = crypto_file.read_text()

        encrypt_section = source.split("async function encryptAllData")[1]
        if "async function decryptAllData" in encrypt_section:
            encrypt_section = encrypt_section.split("async function decryptAllData")[0]

        # Should have conditional that returns original value when encrypted
        # Pattern: looksEncrypted(x) ? x : encrypt(key, x)
        assert "looksEncrypted" in encrypt_section and "?" in encrypt_section, (
            "encryptAllData() must use ternary to skip already-encrypted values. "
            "Pattern: looksEncrypted(x) ? x : await encrypt(key, x)"
        )

    def test_has_skip_comment(self):
        """
        encryptAllData() SHOULD have comments explaining skip logic.
        """
        crypto_file = Path(__file__).parent.parent / "static" / "js" / "crypto.js"
        source = crypto_file.read_text()

        encrypt_section = source.split("async function encryptAllData")[1]
        if "async function decryptAllData" in encrypt_section:
            encrypt_section = encrypt_section.split("async function decryptAllData")[0]

        # Should have a comment about skipping encrypted values
        assert "skip" in encrypt_section.lower() or "already encrypted" in encrypt_section.lower(), (
            "encryptAllData() should have comments explaining why it skips encrypted values. "
            "This helps future developers understand the double-encryption prevention."
        )
