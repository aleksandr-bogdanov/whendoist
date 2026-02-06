"""
JavaScript Module Contract Tests.

These tests verify JavaScript modules export expected APIs and integrate
correctly with each other - WITHOUT running a browser. They catch integration
bugs by analyzing the source code structure.

Test Category: Unit (fast, no I/O)
Related Modules: All static/js/*.js files

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

    def test_hardcoded_section_prefs(self, task_sort_js: str):
        """Section preferences must be hardcoded constants (no API call)."""
        assert "SECTION_PREFS" in task_sort_js, "task-sort.js must have SECTION_PREFS constants"
        assert "loadUserPreferences" not in task_sort_js, "loadUserPreferences should be removed (prefs are hardcoded)"


class TestPreferenceSyncContract:
    """
    Test the overall contract between preference changes and sorting.

    Section ordering preferences are now hardcoded constants in task-sort.js.
    This verifies the constants exist and are all set to true.
    """

    def test_all_sort_relevant_preferences_are_hardcoded(self):
        """
        Verify that all section ordering preferences are present as
        hardcoded constants in SECTION_PREFS.
        """
        task_sort_js = (JS_DIR / "task-sort.js").read_text()

        sort_preferences = [
            "completed_move_to_bottom",
            "completed_sort_by_date",
            "scheduled_move_to_bottom",
            "scheduled_sort_by_date",
        ]

        for pref in sort_preferences:
            assert pref in task_sort_js, f"Preference '{pref}' must be in task-sort.js SECTION_PREFS"

    def test_documented_architecture(self):
        """
        The architecture should be documented in the module header.
        """
        task_sort_js = (JS_DIR / "task-sort.js").read_text()

        assert "architecture" in task_sort_js.lower() or "hardcoded" in task_sort_js.lower(), (
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


class TestCryptoModuleExportsAPI:
    """Verify crypto.js exports the required encryption/decryption API."""

    @pytest.fixture
    def crypto_js(self) -> str:
        return (JS_DIR / "crypto.js").read_text()

    def test_exports_window_crypto_object(self, crypto_js: str):
        """Crypto must be exposed on window object."""
        assert "window.Crypto = Crypto" in crypto_js

    def test_exports_is_encryption_enabled(self, crypto_js: str):
        """Must export isEncryptionEnabled for state checking."""
        assert "isEncryptionEnabled" in crypto_js

    def test_exports_can_crypto(self, crypto_js: str):
        """Must export canCrypto for capability checking."""
        assert "canCrypto" in crypto_js

    def test_exports_setup_encryption(self, crypto_js: str):
        """Must export setupEncryption for initial setup."""
        assert "setupEncryption" in crypto_js

    def test_exports_unlock_encryption(self, crypto_js: str):
        """Must export unlockEncryption for passphrase unlock."""
        assert "unlockEncryption" in crypto_js

    def test_exports_encrypt_field(self, crypto_js: str):
        """Must export encryptField for field-level encryption."""
        assert "encryptField" in crypto_js

    def test_exports_decrypt_field(self, crypto_js: str):
        """Must export decryptField for field-level decryption."""
        assert "decryptField" in crypto_js

    def test_uses_secure_iterations(self, crypto_js: str):
        """Must use 600k PBKDF2 iterations (OWASP 2024 recommendation)."""
        assert "PBKDF2_ITERATIONS = 600000" in crypto_js

    def test_no_eval_usage(self, crypto_js: str):
        """Must not use eval or Function constructor (security)."""
        assert "eval(" not in crypto_js
        assert "Function(" not in crypto_js

    def test_has_looks_encrypted_helper(self, crypto_js: str):
        """Must have looksEncrypted helper to prevent double-encryption."""
        assert "looksEncrypted" in crypto_js


class TestDragDropModuleExportsAPI:
    """Verify drag-drop.js exports required calendar scheduling functions."""

    @pytest.fixture
    def dragdrop_js(self) -> str:
        return (JS_DIR / "drag-drop.js").read_text()

    def test_exports_create_scheduled_task_element(self, dragdrop_js: str):
        """Must export createScheduledTaskElement for calendar tasks."""
        assert "window.createScheduledTaskElement" in dragdrop_js

    def test_exports_recalculate_overlaps(self, dragdrop_js: str):
        """Must export recalculateOverlaps for overlap handling."""
        assert "window.recalculateOverlaps" in dragdrop_js

    def test_exports_move_task_to_scheduled_section(self, dragdrop_js: str):
        """Must export moveTaskToScheduledSection for task reordering."""
        assert "window.moveTaskToScheduledSection" in dragdrop_js

    def test_exports_update_task_scheduled_date(self, dragdrop_js: str):
        """Must export updateTaskScheduledDate for date updates."""
        assert "window.updateTaskScheduledDate" in dragdrop_js

    def test_uses_15_minute_snapping(self, dragdrop_js: str):
        """Must snap to 15-minute intervals."""
        assert "15" in dragdrop_js  # Quarter intervals


class TestToastModuleExportsAPI:
    """Verify toast.js exports notification functions."""

    @pytest.fixture
    def toast_js(self) -> str:
        return (JS_DIR / "toast.js").read_text()

    def test_exports_window_toast_object(self, toast_js: str):
        """Toast must be exposed on window object."""
        assert "window.Toast = Toast" in toast_js

    def test_exports_show_function(self, toast_js: str):
        """Must export show function."""
        assert re.search(r"return\s*\{[^}]*show", toast_js, re.DOTALL)

    def test_exports_hide_function(self, toast_js: str):
        """Must export hide function."""
        assert re.search(r"return\s*\{[^}]*hide", toast_js, re.DOTALL)

    def test_supports_undo_callback(self, toast_js: str):
        """Must support onUndo callback option."""
        assert "onUndo" in toast_js


class TestThemeModuleContract:
    """Verify theme.js handles dark/light mode correctly."""

    @pytest.fixture
    def theme_js(self) -> str:
        return (JS_DIR / "theme.js").read_text()

    def test_uses_data_theme_attribute(self, theme_js: str):
        """Must use data-theme attribute for theme state."""
        assert "data-theme" in theme_js

    def test_stores_preference(self, theme_js: str):
        """Must store theme preference in localStorage."""
        assert "localStorage" in theme_js


class TestDeviceDetectionModule:
    """Verify device-detection.js correctly identifies device types."""

    @pytest.fixture
    def device_js(self) -> str:
        return (JS_DIR / "device-detection.js").read_text()

    def test_detects_touch_devices(self, device_js: str):
        """Must detect touch capability."""
        assert "touch" in device_js.lower()

    def test_provides_is_mobile_check(self, device_js: str):
        """Must provide mobile detection."""
        assert "mobile" in device_js.lower() or "isMobile" in device_js


class TestHapticsModule:
    """Verify haptics.js provides feedback patterns."""

    @pytest.fixture
    def haptics_js(self) -> str:
        return (JS_DIR / "haptics.js").read_text()

    def test_uses_vibrate_api(self, haptics_js: str):
        """Must use the Vibration API."""
        assert "vibrate" in haptics_js

    def test_has_feedback_patterns(self, haptics_js: str):
        """Must define feedback patterns."""
        assert "success" in haptics_js.lower() or "pattern" in haptics_js.lower()


class TestRecurrencePickerModule:
    """Verify recurrence-picker.js handles recurring task patterns."""

    @pytest.fixture
    def recurrence_js(self) -> str:
        return (JS_DIR / "recurrence-picker.js").read_text()

    def test_exports_recurrence_picker(self, recurrence_js: str):
        """Must expose RecurrencePicker globally."""
        assert "RecurrencePicker" in recurrence_js

    def test_supports_daily_pattern(self, recurrence_js: str):
        """Must support daily recurrence."""
        assert "daily" in recurrence_js.lower()

    def test_supports_weekly_pattern(self, recurrence_js: str):
        """Must support weekly recurrence."""
        assert "weekly" in recurrence_js.lower()

    def test_supports_monthly_pattern(self, recurrence_js: str):
        """Must support monthly recurrence."""
        assert "monthly" in recurrence_js.lower()


class TestTaskDialogModule:
    """Verify task-dialog.js provides task editing UI."""

    @pytest.fixture
    def task_dialog_js(self) -> str:
        return (JS_DIR / "task-dialog.js").read_text()

    def test_has_open_function(self, task_dialog_js: str):
        """Must have function to open dialog."""
        assert "open" in task_dialog_js.lower() or "show" in task_dialog_js.lower()

    def test_handles_task_creation(self, task_dialog_js: str):
        """Must handle creating new tasks."""
        assert "create" in task_dialog_js.lower() or "POST" in task_dialog_js

    def test_handles_task_editing(self, task_dialog_js: str):
        """Must handle editing existing tasks."""
        assert "edit" in task_dialog_js.lower() or "PUT" in task_dialog_js


class TestPlanTasksModule:
    """Verify plan-tasks.js handles Plan My Day feature."""

    @pytest.fixture
    def plan_js(self) -> str:
        return (JS_DIR / "plan-tasks.js").read_text()

    def test_has_schedule_function(self, plan_js: str):
        """Must have scheduling logic."""
        assert "schedule" in plan_js.lower()

    def test_respects_existing_events(self, plan_js: str):
        """Must avoid conflicts with existing events."""
        assert "event" in plan_js.lower() or "conflict" in plan_js.lower() or "overlap" in plan_js.lower()


class TestEnergySelectorModule:
    """Verify energy-selector.js handles energy mode filtering."""

    @pytest.fixture
    def energy_js(self) -> str:
        return (JS_DIR / "energy-selector.js").read_text()

    def test_has_energy_modes(self, energy_js: str):
        """Must define energy modes."""
        # Check for mode names
        assert "zombie" in energy_js.lower() or "normal" in energy_js.lower() or "focus" in energy_js.lower()

    def test_filters_tasks_by_clarity(self, energy_js: str):
        """Energy filtering relates to clarity levels."""
        assert "clarity" in energy_js.lower() or "executable" in energy_js.lower()


class TestWizardModule:
    """Verify wizard.js handles onboarding flow."""

    @pytest.fixture
    def wizard_js(self) -> str:
        return (JS_DIR / "wizard.js").read_text()

    def test_has_step_navigation(self, wizard_js: str):
        """Must support step navigation."""
        assert "step" in wizard_js.lower()

    def test_has_next_action(self, wizard_js: str):
        """Must have next step action."""
        assert "next" in wizard_js.lower()

    def test_saves_progress(self, wizard_js: str):
        """Must save wizard progress."""
        assert "localStorage" in wizard_js or "storage" in wizard_js.lower()


class TestTaskCompleteModule:
    """Verify task-complete.js handles task completion."""

    @pytest.fixture
    def complete_js(self) -> str:
        return (JS_DIR / "task-complete.js").read_text()

    def test_has_toggle_complete(self, complete_js: str):
        """Must have completion toggle logic."""
        assert "complete" in complete_js.lower() or "toggle" in complete_js.lower()

    def test_calls_api(self, complete_js: str):
        """Must call backend API to persist completion."""
        assert "fetch" in complete_js or "api" in complete_js.lower()
