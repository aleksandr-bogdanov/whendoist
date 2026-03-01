"""
URL utility endpoints.

Provides server-side URL metadata fetching (title extraction)
for the paste-to-markdown-link feature in the frontend.
"""

import re

import httpx
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.routers.auth import require_user

router = APIRouter(prefix="/url", tags=["url"])

# Only read the first 16KB — enough for <title> without downloading entire pages
_MAX_BYTES = 16 * 1024
_TIMEOUT = 5.0
_USER_AGENT = "Mozilla/5.0 (compatible; Whendoist/1.0; +https://whendoist.com)"

_TITLE_RE = re.compile(r"<title[^>]*>(.*?)</title>", re.IGNORECASE | re.DOTALL)
_OG_TITLE_RE = re.compile(
    r'<meta\s[^>]*property=["\']og:title["\'][^>]*content=["\']([^"\']+)["\']',
    re.IGNORECASE,
)


class URLTitleRequest(BaseModel):
    url: str


class URLTitleResponse(BaseModel):
    title: str
    url: str


def _extract_title(html: str) -> str | None:
    """Extract page title from HTML, trying <title> then og:title."""
    m = _TITLE_RE.search(html)
    if m:
        # Collapse whitespace and strip
        return re.sub(r"\s+", " ", m.group(1)).strip()
    m = _OG_TITLE_RE.search(html)
    if m:
        return m.group(1).strip()
    return None


def _hostname(url: str) -> str:
    """Extract hostname from URL, stripping www. prefix."""
    try:
        from urllib.parse import urlparse

        parsed = urlparse(url)
        host = parsed.hostname or url
        return host.removeprefix("www.")
    except Exception:
        return url


@router.post("/title", response_model=URLTitleResponse)
async def get_url_title(
    data: URLTitleRequest,
    _user=Depends(require_user),
):
    """Fetch a URL and extract its page title."""
    url = data.url.strip()
    if not url.startswith(("http://", "https://")):
        return URLTitleResponse(title=url, url=url)

    try:
        async with httpx.AsyncClient(
            timeout=_TIMEOUT,
            follow_redirects=True,
            headers={"User-Agent": _USER_AGENT},
        ) as client:
            resp = await client.get(url)
            if "text/html" not in resp.headers.get("content-type", ""):
                return URLTitleResponse(title=_hostname(url), url=url)

            html = resp.text[:_MAX_BYTES]

        title = _extract_title(html)
        if title:
            return URLTitleResponse(title=title, url=url)

        return URLTitleResponse(title=_hostname(url), url=url)

    except Exception:
        return URLTitleResponse(title=_hostname(url), url=url)
