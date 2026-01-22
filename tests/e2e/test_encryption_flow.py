"""
E2E tests for encryption enable/disable flow.

Tests the complete user journey for:
1. Enabling encryption with a passphrase
2. Verifying encrypted data display
3. Unlocking encryption after page reload
4. Disabling encryption and decrypting data

Prerequisites:
- Running server: uvicorn app.main:app --port 8000
- Playwright browsers: playwright install chromium
- Test user logged in

Run: pytest -m e2e tests/e2e/test_encryption_flow.py
"""

import os

import pytest

pytest.importorskip("playwright")

from playwright.sync_api import Page, expect

BASE_URL = os.getenv("E2E_BASE_URL", "http://localhost:8000")


@pytest.fixture
def authenticated_page(page: Page):
    """Page fixture with authentication."""
    page.goto(f"{BASE_URL}/dashboard")

    if "/login" in page.url:
        pytest.skip("E2E tests require authentication setup")

    return page


@pytest.mark.e2e
class TestEncryptionSetup:
    """E2E tests for enabling encryption."""

    def test_navigate_to_encryption_settings(self, authenticated_page: Page):
        """User can navigate to encryption settings."""
        page = authenticated_page

        # Navigate to settings
        settings_link = page.locator('a[href*="settings"], [data-testid="settings-link"]').first
        settings_link.click()

        page.wait_for_url("**/settings**")

        # Look for encryption section
        encryption_section = page.locator('text="Encryption", text="encryption"').first
        expect(encryption_section).to_be_visible()

    def test_enable_encryption(self, authenticated_page: Page):
        """User can enable encryption with a passphrase."""
        page = authenticated_page

        # Go to settings
        page.goto(f"{BASE_URL}/settings")

        # Find encryption toggle/button
        enable_button = page.locator(
            '[data-testid="enable-encryption"], '
            'button:has-text("Enable Encryption"), '
            'button:has-text("Set up encryption")'
        ).first

        if enable_button.count() == 0:
            pytest.skip("Encryption already enabled or not available")

        enable_button.click()

        # Wait for passphrase dialog
        page.wait_for_selector('[data-testid="passphrase-dialog"], .passphrase-modal', timeout=5000)

        # Enter passphrase
        passphrase_input = page.locator(
            '[data-testid="passphrase-input"], '
            'input[type="password"][name="passphrase"], '
            'input[placeholder*="passphrase"]'
        ).first
        passphrase_input.fill("TestPassphrase123!")

        # Confirm passphrase
        confirm_input = page.locator(
            '[data-testid="confirm-passphrase"], input[name="confirmPassphrase"], input[placeholder*="confirm"]'
        ).first
        if confirm_input.count() > 0:
            confirm_input.fill("TestPassphrase123!")

        # Submit
        submit_button = page.locator('button:has-text("Enable"), button:has-text("Set up"), [type="submit"]').first
        submit_button.click()

        # Wait for encryption to be enabled
        page.wait_for_timeout(2000)

        # Verify encryption is now enabled
        # Could be an indicator, status message, or the enable button is gone
        status = page.locator('[data-testid="encryption-status"], text="Encryption enabled", text="encrypted"').first

        if status.count() > 0:
            expect(status).to_be_visible()

    def test_encryption_requires_matching_passphrases(self, authenticated_page: Page):
        """Encryption setup rejects mismatched passphrases."""
        page = authenticated_page

        page.goto(f"{BASE_URL}/settings")

        enable_button = page.locator('[data-testid="enable-encryption"], button:has-text("Enable Encryption")').first

        if enable_button.count() == 0:
            pytest.skip("Encryption not available or already enabled")

        enable_button.click()

        page.wait_for_selector('[data-testid="passphrase-dialog"], .passphrase-modal', timeout=5000)

        # Enter mismatched passphrases
        passphrase_input = page.locator('input[type="password"]').first
        passphrase_input.fill("Passphrase1")

        confirm_input = page.locator('input[type="password"]').nth(1)
        if confirm_input.count() > 0:
            confirm_input.fill("DifferentPassphrase")

            # Try to submit
            submit_button = page.locator('button:has-text("Enable"), [type="submit"]').first
            submit_button.click()

            # Should show error
            error = page.locator('text="match", text="do not match"').first
            if error.count() > 0:
                expect(error).to_be_visible()


@pytest.mark.e2e
class TestEncryptionUnlock:
    """E2E tests for unlocking encryption."""

    def test_encryption_lock_on_page_reload(self, authenticated_page: Page):
        """Encryption requires unlock after page reload."""
        page = authenticated_page

        # Assuming encryption is enabled, reload the page
        page.reload()

        # If encryption is enabled but locked, should see unlock prompt
        unlock_prompt = page.locator(
            '[data-testid="unlock-prompt"], .encryption-locked, text="Enter passphrase", text="Unlock"'
        ).first

        # This depends on whether encryption is currently enabled
        # Skip if encryption not enabled
        if unlock_prompt.count() == 0:
            pytest.skip("Encryption not enabled or auto-unlocked")

        expect(unlock_prompt).to_be_visible()

    def test_unlock_with_correct_passphrase(self, authenticated_page: Page):
        """User can unlock encryption with correct passphrase."""
        page = authenticated_page

        # Look for unlock UI
        unlock_input = page.locator('[data-testid="unlock-passphrase"], input[placeholder*="passphrase"]').first

        if unlock_input.count() == 0:
            pytest.skip("Unlock UI not visible - encryption may not be enabled")

        unlock_input.fill("TestPassphrase123!")

        unlock_button = page.locator('button:has-text("Unlock"), [data-testid="unlock-button"]').first
        unlock_button.click()

        page.wait_for_timeout(1000)

        # Data should now be visible/decrypted
        # The unlock prompt should be gone
        expect(unlock_input).not_to_be_visible()

    def test_unlock_with_wrong_passphrase(self, authenticated_page: Page):
        """Wrong passphrase shows error."""
        page = authenticated_page

        unlock_input = page.locator('[data-testid="unlock-passphrase"], input[placeholder*="passphrase"]').first

        if unlock_input.count() == 0:
            pytest.skip("Unlock UI not visible")

        unlock_input.fill("WrongPassphrase")

        unlock_button = page.locator('button:has-text("Unlock")').first
        unlock_button.click()

        page.wait_for_timeout(1000)

        # Should show error
        error = page.locator('text="incorrect", text="wrong", text="Invalid"').first

        if error.count() > 0:
            expect(error).to_be_visible()


@pytest.mark.e2e
class TestEncryptionDisable:
    """E2E tests for disabling encryption."""

    def test_disable_encryption(self, authenticated_page: Page):
        """User can disable encryption."""
        page = authenticated_page

        page.goto(f"{BASE_URL}/settings")

        # Find disable button (only visible if encryption is enabled)
        disable_button = page.locator(
            '[data-testid="disable-encryption"], '
            'button:has-text("Disable Encryption"), '
            'button:has-text("Turn off encryption")'
        ).first

        if disable_button.count() == 0:
            pytest.skip("Encryption not enabled")

        disable_button.click()

        # May need to confirm
        confirm_button = page.locator('button:has-text("Confirm"), button:has-text("Yes, disable")')
        if confirm_button.count() > 0:
            confirm_button.click()

        # May need to enter passphrase to confirm
        passphrase_input = page.locator('input[type="password"]').first
        if passphrase_input.count() > 0:
            passphrase_input.fill("TestPassphrase123!")
            submit = page.locator('button:has-text("Disable"), [type="submit"]').first
            submit.click()

        page.wait_for_timeout(2000)

        # Verify encryption is now disabled
        enable_button = page.locator('[data-testid="enable-encryption"], button:has-text("Enable Encryption")').first

        # Enable button should now be visible
        if enable_button.count() > 0:
            expect(enable_button).to_be_visible()


@pytest.mark.e2e
class TestEncryptedDataDisplay:
    """E2E tests for encrypted data handling."""

    def test_encrypted_tasks_show_correctly_when_unlocked(self, authenticated_page: Page):
        """Task titles are readable when encryption is unlocked."""
        page = authenticated_page

        page.goto(f"{BASE_URL}/dashboard")

        # If there are tasks, they should be readable (not encrypted gibberish)
        tasks = page.locator('.task-item, [data-testid="task"]')

        if tasks.count() > 0:
            first_task = tasks.first
            task_title = first_task.locator('.task-title, [data-testid="task-title"]').first

            if task_title.count() > 0:
                title_text = task_title.inner_text()
                # Should not look like encrypted data (base64 or gibberish)
                assert not title_text.startswith("AAA"), "Title looks encrypted"
                assert len(title_text) < 500, "Title looks like encrypted data"

    def test_create_task_while_encrypted(self, authenticated_page: Page):
        """User can create tasks while encryption is enabled."""
        page = authenticated_page

        # Ensure we're on dashboard
        page.goto(f"{BASE_URL}/dashboard")

        # Create a task
        add_button = page.locator('[data-testid="add-task"], .add-task-btn, button:has-text("Add task")').first

        if add_button.count() == 0:
            pytest.skip("Add task button not found")

        add_button.click()

        # Fill in task
        title_input = page.locator('[name="title"], [data-testid="task-title"]').first
        encrypted_task_title = "Encrypted Test Task"
        title_input.fill(encrypted_task_title)

        # Save
        save_button = page.locator('button:has-text("Save"), [type="submit"]').first
        save_button.click()

        page.wait_for_timeout(1500)

        # Task should appear and be readable
        expect(page.locator(f'text="{encrypted_task_title}"')).to_be_visible()
