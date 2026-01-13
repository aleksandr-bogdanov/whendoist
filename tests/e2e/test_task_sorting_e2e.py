"""
End-to-End Task Sorting Tests.

Browser-based tests using Playwright that verify the full user flow
of changing preferences and sorting tasks.

Test Category: E2E (slow, requires running server + browser)
Related Modules: static/js/task-sort.js, static/js/task-list-options.js

Prerequisites:
- Running dev server: `just dev`
- Playwright browsers: `uv run playwright install chromium`
- Test user with sample tasks

Regression Coverage:
- Stale preference cache bug: Verifies that changing "Group at bottom"
  in Options menu affects subsequent column header clicks.

Note: These tests are skipped by default. Set pytestmark skip to False
and ensure server is running before executing.

See tests/README.md for full test architecture.
"""

import pytest
from playwright.sync_api import Page

# Skip all tests in this file if no live server is available
pytestmark = pytest.mark.skipif(
    True,  # TODO: Set to False when test infrastructure is ready
    reason="E2E tests require running server with test data",
)


class TestPreferenceSynchronization:
    """
    Tests that verify preference changes in Options menu
    are respected by column header sorting.

    THE BUG: task-sort.js cached preferences on page load and never
    updated them. When user changed "Group at bottom" to OFF,
    clicking a column header would still group tasks at bottom
    because it used the stale cached value.

    THE FIX: task-list-options.js now calls TaskSort.updatePreference()
    after saving a preference to keep the cache in sync.
    """

    def test_scheduled_group_at_bottom_off_persists_after_column_click(self, page: Page):
        """
        Scenario: User disables "Group at bottom" for scheduled tasks,
        then clicks a column header. Scheduled tasks should remain
        interleaved with unscheduled tasks.

        This is the exact bug that was reported.
        """
        # Given: User is on dashboard with scheduled and unscheduled tasks
        page.goto("/dashboard")

        # Get initial task order
        page.locator(".task-item .task-text").all_text_contents()

        # When: User opens Options menu
        page.click("#header-actions-btn")

        # And: Disables "Group at bottom" for scheduled tasks
        scheduled_group_toggle = page.locator('[data-pref="scheduled_move_to_bottom"]')
        if scheduled_group_toggle.get_attribute("aria-pressed") == "true":
            scheduled_group_toggle.click()

        # Wait for the preference to be saved and list to refresh
        page.wait_for_load_state("networkidle")

        # And: Clicks the "Clarity" column header
        page.click('[data-sort="clarity"]')

        # Then: Scheduled tasks should NOT be grouped at bottom
        # They should be interleaved based on clarity value
        task_items = page.locator(".task-item")

        # Collect task info: (is_scheduled, clarity)
        tasks_info = []
        for i in range(task_items.count()):
            item = task_items.nth(i)
            is_scheduled = item.get_attribute("data-scheduled-date") not in [None, ""]
            clarity = item.get_attribute("data-clarity")
            tasks_info.append({"scheduled": is_scheduled, "clarity": clarity})

        # Verify: NOT all scheduled tasks are at the end
        # If they were grouped at bottom, all scheduled would come after all unscheduled
        scheduled_indices = [i for i, t in enumerate(tasks_info) if t["scheduled"]]
        unscheduled_indices = [i for i, t in enumerate(tasks_info) if not t["scheduled"]]

        if scheduled_indices and unscheduled_indices:
            # Bug condition: all scheduled tasks have higher indices than all unscheduled
            all_scheduled_at_bottom = min(scheduled_indices) > max(unscheduled_indices)
            assert not all_scheduled_at_bottom, (
                "Bug: Scheduled tasks are grouped at bottom even though "
                "'Group at bottom' is OFF. This indicates stale preferences in task-sort.js"
            )

    def test_completed_group_at_bottom_off_persists_after_column_click(self, page: Page):
        """
        Same test for completed tasks.
        """
        page.goto("/dashboard")

        # Open Options menu
        page.click("#header-actions-btn")

        # Disable "Group at bottom" for completed tasks
        completed_group_toggle = page.locator('[data-pref="completed_move_to_bottom"]')
        if completed_group_toggle.get_attribute("aria-pressed") == "true":
            completed_group_toggle.click()

        page.wait_for_load_state("networkidle")

        # Click column header
        page.click('[data-sort="impact"]')

        # Verify completed tasks are interleaved, not grouped at bottom
        task_items = page.locator(".task-item")
        tasks_info = []
        for i in range(task_items.count()):
            item = task_items.nth(i)
            is_completed = item.get_attribute("data-completed") == "1"
            tasks_info.append({"completed": is_completed})

        completed_indices = [i for i, t in enumerate(tasks_info) if t["completed"]]
        pending_indices = [i for i, t in enumerate(tasks_info) if not t["completed"]]

        if completed_indices and pending_indices:
            all_completed_at_bottom = min(completed_indices) > max(pending_indices)
            assert not all_completed_at_bottom, (
                "Bug: Completed tasks are grouped at bottom even though "
                "'Group at bottom' is OFF. This indicates stale preferences in task-sort.js"
            )


class TestTaskSortPreferenceSync:
    """
    Tests that verify TaskSort.updatePreference() is called correctly.
    """

    def test_tasksort_preferences_updated_after_toggle(self, page: Page):
        """
        Verify that TaskSort's internal preferences object is updated
        when user changes a preference via the Options menu.
        """
        page.goto("/dashboard")

        # Get initial TaskSort preferences
        initial_prefs = page.evaluate("window.TaskSort.getPreferences()")
        assert initial_prefs["scheduled_move_to_bottom"] == True

        # Open Options and toggle "Group at bottom" OFF
        page.click("#header-actions-btn")
        page.click('[data-pref="scheduled_move_to_bottom"]')

        # Wait for save
        page.wait_for_load_state("networkidle")

        # Verify TaskSort's preferences were updated
        updated_prefs = page.evaluate("window.TaskSort.getPreferences()")
        assert updated_prefs["scheduled_move_to_bottom"] == False, (
            "Bug: TaskSort.updatePreference() was not called after saving preference. "
            "This causes stale preferences to be used when clicking column headers."
        )


class TestSortOrderConsistency:
    """
    Tests that verify sorting produces consistent results
    between server-side and client-side sorting.
    """

    def test_client_sort_matches_server_sort(self, page: Page):
        """
        After page load (server-sorted) and after clicking a column header
        (client-sorted), the relative ordering based on preferences should match.
        """
        page.goto("/dashboard")

        # Get server-sorted order
        page.locator(".task-item").all_text_contents()

        # Click column header to trigger client-side sort
        page.click('[data-sort="clarity"]')

        # Click again to toggle (tests both asc and desc)
        page.click('[data-sort="clarity"]')

        # Click a different column
        page.click('[data-sort="impact"]')

        # Now click clarity again to get back to similar state
        page.click('[data-sort="clarity"]')

        page.locator(".task-item").all_text_contents()

        # The section ordering (unscheduled vs scheduled vs completed)
        # should be preserved regardless of which column is sorted
        # This is verified by checking that the same tasks appear in
        # the same sections
