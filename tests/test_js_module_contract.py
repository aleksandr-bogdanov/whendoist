"""
JavaScript Module Contract Tests.

These tests verify JavaScript modules export expected APIs and integrate
correctly with each other - WITHOUT running a browser. They catch integration
bugs by analyzing the source code structure.

Test Category: Unit (fast, no I/O)
Related Modules: static/js/task-sort.js, static/js/task-list-options.js

Regression Coverage:
- Stale preference cache bug: When user changed "Group at bottom" in Options,
  clicking column headers still used old cached values. Fixed by adding
  TaskSort.updatePreference() call in task-list-options.js.

See tests/README.md for full test architecture.
"""

import re
from pathlib import Path

import pytest

JS_DIR = Path(__file__).parent.parent / "static" / "js"


class TestTaskSortExportsAPI:
    """Verify task-sort.js exports the required API."""

    @pytest.fixture
    def task_sort_js(self) -> str:
        return (JS_DIR / "task-sort.js").read_text()

    def test_exports_window_tasksort_object(self, task_sort_js: str):
        """TaskSort must be exposed on window object."""
        assert "window.TaskSort" in task_sort_js

    def test_exports_apply_sort(self, task_sort_js: str):
        """Must export applySort for re-sorting after content changes."""
        assert re.search(r"window\.TaskSort\s*=\s*\{[^}]*applySort", task_sort_js, re.DOTALL)

    def test_exports_update_preference(self, task_sort_js: str):
        """
        Must export updatePreference for preference synchronization.

        THIS IS THE CRITICAL API that was missing before the fix.
        Without this, task-list-options.js cannot notify task-sort.js
        when preferences change, causing the stale cache bug.
        """
        assert re.search(r"window\.TaskSort\s*=\s*\{[^}]*updatePreference", task_sort_js, re.DOTALL), (
            "task-sort.js must export updatePreference() for other modules to update "
            "the cached preferences. Without this, preference changes won't affect "
            "column header sorting."
        )

    def test_has_update_preference_function(self, task_sort_js: str):
        """The updatePreference function must exist and update userPrefs."""
        # Check function is defined
        assert re.search(r"function updatePreference\s*\(", task_sort_js), "updatePreference function must be defined"
        # Check it modifies userPrefs
        assert re.search(r"userPrefs\[key\]\s*=\s*value", task_sort_js), (
            "updatePreference must update the userPrefs cache"
        )


class TestTaskListOptionsCallsTaskSort:
    """Verify task-list-options.js properly integrates with task-sort.js."""

    @pytest.fixture
    def task_list_options_js(self) -> str:
        return (JS_DIR / "task-list-options.js").read_text()

    def test_calls_tasksort_update_preference_after_save(self, task_list_options_js: str):
        """
        After saving a preference, must call TaskSort.updatePreference().

        THIS IS THE FIX for the stale preferences bug.
        Without this call, task-sort.js would use outdated cached values
        when sorting via column headers.
        """
        # Check that TaskSort.updatePreference is called in savePreference function
        assert "TaskSort.updatePreference" in task_list_options_js, (
            "task-list-options.js must call TaskSort.updatePreference() after saving "
            "a preference to keep the sort module's cache in sync. Without this, "
            "clicking column headers after changing preferences will use stale values."
        )

    def test_update_preference_call_is_conditional(self, task_list_options_js: str):
        """The call should check that TaskSort exists before calling."""
        assert re.search(r"window\.TaskSort\s*&&.*TaskSort\.updatePreference", task_list_options_js, re.DOTALL), (
            "TaskSort.updatePreference() call should be guarded with existence check"
        )


class TestPreferenceSyncContract:
    """
    Test the overall contract between preference changes and sorting.

    This documents the expected behavior and verifies the integration
    points exist, without needing to run JavaScript.
    """

    def test_all_sort_relevant_preferences_can_be_synced(self):
        """
        Verify that all preferences affecting sort order are:
        1. Cached in task-sort.js
        2. Updateable via updatePreference()
        """
        task_sort_js = (JS_DIR / "task-sort.js").read_text()

        # These are the preferences that affect sorting behavior
        sort_preferences = [
            "completed_move_to_bottom",
            "completed_sort_by_date",
            "scheduled_move_to_bottom",
            "scheduled_sort_by_date",
        ]

        # Check each is in the userPrefs initialization
        for pref in sort_preferences:
            assert pref in task_sort_js, f"Preference '{pref}' must be in task-sort.js userPrefs cache"

    def test_documented_architecture(self):
        """
        The architecture should be documented in the module header.
        """
        task_sort_js = (JS_DIR / "task-sort.js").read_text()

        # Check for architecture documentation
        assert "single source of truth" in task_sort_js.lower() or "architecture" in task_sort_js.lower(), (
            "task-sort.js should document its architecture to prevent future bugs"
        )


class TestPasskeyModuleExportsAPI:
    """
    Verify passkey.js exports the required API for WebAuthn operations.

    The passkey module provides key wrapping/unwrapping for multi-passkey support.
    Each passkey wraps the SAME master key, so all passkeys can unlock the same data.
    """

    @pytest.fixture
    def passkey_js(self) -> str:
        return (JS_DIR / "passkey.js").read_text()

    def test_exports_window_passkey_object(self, passkey_js: str):
        """Passkey must be exposed on window object."""
        assert "window.Passkey" in passkey_js

    def test_exports_is_supported(self, passkey_js: str):
        """Must export isSupported for feature detection."""
        assert re.search(r"return\s*\{[^}]*isSupported", passkey_js, re.DOTALL)

    def test_exports_register_passkey(self, passkey_js: str):
        """Must export registerPasskey for adding new passkeys."""
        assert re.search(r"return\s*\{[^}]*registerPasskey", passkey_js, re.DOTALL)

    def test_exports_unlock_with_passkey(self, passkey_js: str):
        """Must export unlockWithPasskey for authentication."""
        assert re.search(r"return\s*\{[^}]*unlockWithPasskey", passkey_js, re.DOTALL)


class TestPasskeyKeyWrappingArchitecture:
    """
    Verify passkey.js implements the correct key wrapping architecture.

    CRITICAL: Each passkey must wrap the same master key, not derive its own key.
    Without proper key wrapping, multiple passkeys would create incompatible keys.
    """

    @pytest.fixture
    def passkey_js(self) -> str:
        return (JS_DIR / "passkey.js").read_text()

    def test_has_wrap_master_key_function(self, passkey_js: str):
        """
        Must have wrapMasterKey function for registration.

        This wraps the current master key with the PRF-derived wrapping key,
        allowing multiple passkeys to unlock the same data.
        """
        assert "async function wrapMasterKey" in passkey_js, (
            "passkey.js must have wrapMasterKey function to wrap the master key "
            "with the PRF-derived wrapping key during registration"
        )

    def test_has_unwrap_master_key_function(self, passkey_js: str):
        """
        Must have unwrapMasterKey function for authentication.

        This unwraps the stored wrapped_key to get the original master key.
        """
        assert "async function unwrapMasterKey" in passkey_js, (
            "passkey.js must have unwrapMasterKey function to recover the master key "
            "from the wrapped_key during authentication"
        )

    def test_registration_checks_stored_key(self, passkey_js: str):
        """
        Registration must require an existing unlocked session.

        Users must unlock first (via passphrase or another passkey) before
        adding a new passkey, so we have the master key to wrap.
        """
        assert "Crypto.hasStoredKey()" in passkey_js, (
            "registerPasskey must check if encryption is unlocked before proceeding. "
            "Without the master key in session, we can't wrap it for the new passkey."
        )

    def test_registration_gets_master_key(self, passkey_js: str):
        """Registration must get the current master key to wrap it."""
        assert "Crypto.getStoredKey()" in passkey_js, (
            "registerPasskey must retrieve the master key from session to wrap it"
        )

    def test_authentication_verifies_with_test_value(self, passkey_js: str):
        """
        Authentication must verify the unwrapped key against test value.

        The test value (from UserPreferences) was encrypted with the master key.
        If we can decrypt it, we have the correct master key.
        """
        assert "WHENDOIST_ENCRYPTION_TEST" in passkey_js, (
            "unlockWithPasskey must verify the unwrapped key by decrypting the test value"
        )

    def test_uses_wrapped_key_not_test_value(self, passkey_js: str):
        """
        Must use wrapped_key field, not encryption_test_value.

        The old (broken) architecture stored encryption_test_value per passkey.
        The correct architecture stores wrapped_key (the wrapped master key).
        """
        assert "wrapped_key" in passkey_js, "passkey.js must use wrapped_key field for key wrapping"

    def test_documents_architecture(self, passkey_js: str):
        """The key wrapping architecture should be documented."""
        assert "Architecture:" in passkey_js or "architecture" in passkey_js.lower(), (
            "passkey.js should document its key wrapping architecture to prevent "
            "future developers from accidentally breaking multi-passkey support"
        )
