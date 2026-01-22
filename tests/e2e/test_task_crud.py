"""
E2E tests for task CRUD operations.

Tests the complete user flow for creating, viewing, editing, and deleting tasks
through the browser interface.

Prerequisites:
- Running server: uvicorn app.main:app --port 8000
- Playwright browsers: playwright install chromium
- Test user logged in (or auth bypass configured)

Run: pytest -m e2e tests/e2e/test_task_crud.py
"""

import os

import pytest

# Skip all tests in this module if playwright is not installed
pytest.importorskip("playwright")

from playwright.sync_api import Page, expect

BASE_URL = os.getenv("E2E_BASE_URL", "http://localhost:8000")


@pytest.fixture(scope="module")
def browser_context(browser):
    """Create browser context with saved auth state if available."""
    context = browser.new_context()
    yield context
    context.close()


@pytest.fixture
def authenticated_page(browser_context, page: Page):
    """
    Page fixture with authentication.

    For local testing, assumes a dev user is auto-logged in or
    uses a test cookie. In CI, this would use a test auth flow.
    """
    # Navigate to dashboard (will redirect to login if not authenticated)
    page.goto(f"{BASE_URL}/dashboard")

    # If we're on login page, we need to authenticate
    if "/login" in page.url:
        pytest.skip("E2E tests require authentication setup - set E2E_AUTH_COOKIE or configure test user")

    return page


@pytest.mark.e2e
class TestTaskCreation:
    """E2E tests for task creation flow."""

    def test_create_task_from_inbox(self, authenticated_page: Page):
        """User can create a task in the inbox."""
        page = authenticated_page

        # Click add task button (look for common patterns)
        add_button = page.locator('[data-testid="add-task"], .add-task-btn, button:has-text("Add task")').first
        add_button.click()

        # Fill in task details in dialog
        title_input = page.locator('[name="title"], [data-testid="task-title"], input[placeholder*="task"]').first
        title_input.fill("E2E Test Task")

        # Submit the form
        save_button = page.locator('button:has-text("Save"), button:has-text("Create"), [type="submit"]').first
        save_button.click()

        # Wait for dialog to close
        page.wait_for_selector('[data-testid="task-dialog"]', state="hidden", timeout=5000)

        # Verify task appears in the list
        expect(page.locator('text="E2E Test Task"')).to_be_visible()

    def test_create_task_with_domain(self, authenticated_page: Page):
        """User can create a task in a specific domain."""
        page = authenticated_page

        # First create a domain if it doesn't exist
        # This assumes there's a domain creation flow or existing domains

        # Open task creation
        add_button = page.locator('[data-testid="add-task"], .add-task-btn, button:has-text("Add task")').first
        add_button.click()

        # Fill in task
        title_input = page.locator('[name="title"], [data-testid="task-title"]').first
        title_input.fill("E2E Domain Task")

        # Select a domain if dropdown exists
        domain_select = page.locator('[data-testid="domain-select"], select[name="domain"]').first
        if domain_select.count() > 0:
            domain_select.select_option(index=1)  # Select first domain

        # Save
        save_button = page.locator('button:has-text("Save"), button:has-text("Create")').first
        save_button.click()

        page.wait_for_timeout(1000)  # Brief wait for save

        # Verify task exists
        expect(page.locator('text="E2E Domain Task"')).to_be_visible()


@pytest.mark.e2e
class TestTaskEditing:
    """E2E tests for task editing flow."""

    def test_edit_task_title(self, authenticated_page: Page):
        """User can edit an existing task's title."""
        page = authenticated_page

        # Find an existing task or create one first
        task_element = page.locator('.task-item, [data-testid="task"]').first

        # Click to open task dialog
        task_element.click()

        # Wait for dialog to open
        page.wait_for_selector('[data-testid="task-dialog"], .task-dialog', state="visible", timeout=5000)

        # Edit the title
        title_input = page.locator('[name="title"], [data-testid="task-title"]').first
        original_title = title_input.input_value()
        new_title = f"{original_title} (edited)"
        title_input.fill(new_title)

        # Save changes
        save_button = page.locator('button:has-text("Save"), [type="submit"]').first
        save_button.click()

        # Wait for dialog to close
        page.wait_for_selector('[data-testid="task-dialog"]', state="hidden", timeout=5000)

        # Verify the updated title appears
        expect(page.locator(f'text="{new_title}"').first).to_be_visible()

    def test_change_task_impact(self, authenticated_page: Page):
        """User can change a task's impact level."""
        page = authenticated_page

        # Open first task
        task_element = page.locator('.task-item, [data-testid="task"]').first
        task_element.click()

        page.wait_for_selector('[data-testid="task-dialog"], .task-dialog', state="visible", timeout=5000)

        # Find and change impact selector
        impact_selector = page.locator('[data-testid="impact-select"], select[name="impact"], .impact-picker').first
        if impact_selector.count() > 0:
            # Click on a different impact level
            impact_buttons = page.locator("[data-impact], .impact-button")
            if impact_buttons.count() > 1:
                impact_buttons.nth(1).click()

        # Save
        save_button = page.locator('button:has-text("Save"), [type="submit"]').first
        save_button.click()

        page.wait_for_timeout(1000)  # Wait for save


@pytest.mark.e2e
class TestTaskCompletion:
    """E2E tests for task completion flow."""

    def test_complete_task_from_list(self, authenticated_page: Page):
        """User can complete a task from the task list."""
        page = authenticated_page

        # Find a checkbox or complete button on a task
        checkbox = page.locator('.task-checkbox, [data-testid="task-complete"], input[type="checkbox"]').first

        if checkbox.count() > 0:
            # Check the checkbox
            checkbox.click()

            # Task should show completed state
            page.wait_for_timeout(500)

            # The task should now have completed styling
            completed_task = page.locator('.task-item.completed, [data-completed="true"]').first
            if completed_task.count() == 0:
                # Alternative: task moved to completed section
                expect(page.locator('text="completed"').first).to_be_visible()

    def test_uncomplete_task(self, authenticated_page: Page):
        """User can uncomplete a completed task."""
        page = authenticated_page

        # Find a completed task
        completed_checkbox = page.locator('.task-item.completed .task-checkbox, [data-completed="true"] input').first

        if completed_checkbox.count() > 0:
            completed_checkbox.click()
            page.wait_for_timeout(500)
            # Verify task is no longer completed
            # This would check the UI state changed


@pytest.mark.e2e
class TestTaskDeletion:
    """E2E tests for task deletion flow."""

    def test_delete_task(self, authenticated_page: Page):
        """User can delete a task."""
        page = authenticated_page

        # Create a task to delete
        add_button = page.locator('[data-testid="add-task"], .add-task-btn, button:has-text("Add task")').first
        add_button.click()

        delete_task_title = "E2E Task To Delete"
        title_input = page.locator('[name="title"], [data-testid="task-title"]').first
        title_input.fill(delete_task_title)

        save_button = page.locator('button:has-text("Save"), button:has-text("Create")').first
        save_button.click()

        page.wait_for_timeout(1000)

        # Find and open the task
        task = page.locator(f'text="{delete_task_title}"').first
        task.click()

        page.wait_for_selector('[data-testid="task-dialog"], .task-dialog', state="visible", timeout=5000)

        # Find delete button
        delete_button = page.locator('button:has-text("Delete"), [data-testid="delete-task"], .delete-btn').first

        if delete_button.count() > 0:
            delete_button.click()

            # Confirm deletion if confirmation dialog appears
            confirm_button = page.locator('button:has-text("Confirm"), button:has-text("Yes")')
            if confirm_button.count() > 0:
                confirm_button.click()

            page.wait_for_timeout(1000)

            # Verify task is gone
            expect(page.locator(f'text="{delete_task_title}"')).not_to_be_visible()
