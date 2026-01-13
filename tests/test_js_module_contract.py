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
