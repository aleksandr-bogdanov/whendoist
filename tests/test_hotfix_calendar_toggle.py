"""
Hotfix Tests - Calendar Toggle URL Encoding.

This test verifies the fix for calendar toggles in Settings not working.

Bug: Google Calendar IDs often contain special characters (e.g., # @ in IDs like
"en.usa#holiday@group.v.calendar.google.com"). When rendered in the template
without URL encoding, the # character is treated as a URL fragment delimiter,
causing the browser to only send the portion before #, breaking the toggle.

Fix: Use Jinja2's urlencode filter in the hx-post URL.

Test Category: Contract
Related Issues: Settings > Google Calendars toggle doesn't work

v0.28.1: Calendar Toggle Fix
"""

from pathlib import Path


class TestCalendarToggleUrlEncoding:
    """
    Verify that calendar toggle URLs are properly URL-encoded.

    Bug: Calendar IDs containing # or @ characters (common in Google Calendar)
    were not being URL-encoded, causing:
    - # to be interpreted as URL fragment (truncating the path)
    - Requests to wrong endpoints like /api/v1/calendars/en.usa instead of
      /api/v1/calendars/en.usa%23holiday%40group.v.calendar.google.com

    The wizard worked because it uses a bulk POST with calendar_ids in the body,
    not individual toggle endpoints with IDs in the URL path.
    """

    def test_calendar_toggle_url_is_urlencoded(self):
        """
        Calendar toggle hx-post URL MUST use urlencode filter.

        Without urlencode, calendar IDs containing # are broken:
        - /api/v1/calendars/en.usa#holiday@group.v.calendar.google.com/toggle
        - Browser sends: /api/v1/calendars/en.usa (everything after # is fragment)

        With urlencode:
        - /api/v1/calendars/en.usa%23holiday%40group.v.calendar.google.com/toggle
        - Browser sends full path correctly
        """
        settings_file = Path(__file__).parent.parent / "app" / "templates" / "settings.html"
        source = settings_file.read_text()

        # Find the calendar toggle section - it's the hx-post for toggling calendars
        assert "hx-post=" in source, "Template must have HTMX post for calendar toggle"

        # Find the calendar toggle line specifically
        # Should be: hx-post="/api/v1/calendars/{{ cal.id | urlencode }}/toggle"
        assert "cal.id | urlencode" in source or "cal.id|urlencode" in source, (
            "Calendar toggle hx-post URL must URL-encode the calendar ID using "
            "{{ cal.id | urlencode }}. Without this, calendar IDs containing # or @ "
            "characters will break (e.g., holiday calendars, shared calendars). "
            "The # character is interpreted as a URL fragment delimiter, causing "
            "the toggle to fail silently."
        )

    def test_calendar_toggle_endpoint_registered(self):
        """Verify the calendar toggle endpoint exists."""
        from app.main import app

        routes = [r.path for r in app.routes if hasattr(r, "path")]

        # The toggle endpoint should be registered
        toggle_route = "/api/v1/calendars/{calendar_id}/toggle"
        assert toggle_route in routes, (
            f"Calendar toggle endpoint {toggle_route} must be registered. "
            f"Available calendar routes: {[r for r in routes if 'calendar' in r.lower()]}"
        )

    def test_calendar_selections_endpoint_registered(self):
        """Verify the bulk calendar selections endpoint exists (used by wizard)."""
        from app.main import app

        routes = [r.path for r in app.routes if hasattr(r, "path")]

        # The selections endpoint should be registered
        selections_route = "/api/v1/calendars/selections"
        assert selections_route in routes, f"Calendar selections endpoint {selections_route} must be registered"
