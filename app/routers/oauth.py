"""
OAuth 2.1 provider for MCP and third-party integrations.

Implements:
- Dynamic client registration (RFC 7591)
- Authorization code grant with PKCE (RFC 7636)
- Token exchange and refresh

Tokens issued are the same format as device auth (itsdangerous signed),
so existing bearer token validation works seamlessly.
"""

import hashlib
import logging
import secrets
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import HTMLResponse, RedirectResponse
from pydantic import BaseModel
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.constants import DEVICE_TOKEN_MAX_AGE_SECONDS
from app.database import get_db
from app.middleware.rate_limit import AUTH_LIMIT, limiter
from app.models import OAuthAuthorizationCode, OAuthClient, User
from app.routers.auth import get_user_id
from app.routers.device_auth import _create_access_token, _create_refresh_token

logger = logging.getLogger("whendoist.oauth")
router = APIRouter(prefix="/oauth", tags=["oauth"])

_settings = get_settings()
_is_production = _settings.base_url.startswith("https://")

# PKCE code challenge method
SUPPORTED_CODE_CHALLENGE_METHODS = {"S256"}

# Authorization code TTL
AUTH_CODE_TTL = timedelta(minutes=10)


def _hash_secret(value: str) -> str:
    """SHA-256 hash for storing secrets (client_secret, auth codes)."""
    return hashlib.sha256(value.encode()).hexdigest()


def _verify_pkce(code_verifier: str, code_challenge: str) -> bool:
    """Verify PKCE S256 challenge: BASE64URL(SHA256(code_verifier)) == code_challenge."""
    import base64

    digest = hashlib.sha256(code_verifier.encode("ascii")).digest()
    computed = base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")
    return computed == code_challenge


# =============================================================================
# Request/Response Models
# =============================================================================


class ClientRegistrationRequest(BaseModel):
    client_name: str
    redirect_uris: list[str]


class ClientRegistrationResponse(BaseModel):
    client_id: str
    client_secret: str
    client_name: str
    redirect_uris: list[str]


class TokenRequest(BaseModel):
    grant_type: str  # "authorization_code" or "refresh_token"
    code: str | None = None
    code_verifier: str | None = None
    redirect_uri: str | None = None
    client_id: str | None = None
    client_secret: str | None = None
    refresh_token: str | None = None


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int = DEVICE_TOKEN_MAX_AGE_SECONDS
    scope: str = "tasks"


# =============================================================================
# OAuth Metadata (RFC 8414)
# =============================================================================


def get_oauth_metadata() -> dict:
    """Return OAuth 2.0 Authorization Server Metadata."""
    base = _settings.base_url
    return {
        "issuer": base,
        "authorization_endpoint": f"{base}/oauth/authorize",
        "token_endpoint": f"{base}/oauth/token",
        "registration_endpoint": f"{base}/oauth/register",
        "response_types_supported": ["code"],
        "grant_types_supported": ["authorization_code", "refresh_token"],
        "code_challenge_methods_supported": ["S256"],
        "token_endpoint_auth_methods_supported": ["client_secret_post"],
        "scopes_supported": ["tasks"],
    }


# =============================================================================
# Dynamic Client Registration (RFC 7591)
# =============================================================================


@router.post("/register", response_model=ClientRegistrationResponse)
@limiter.limit(AUTH_LIMIT)
async def register_client(
    request: Request,
    body: ClientRegistrationRequest,
    db: AsyncSession = Depends(get_db),
) -> ClientRegistrationResponse:
    """Register a new OAuth client dynamically."""
    if not body.redirect_uris:
        raise HTTPException(status_code=400, detail="At least one redirect_uri required")

    client_id = secrets.token_urlsafe(32)
    client_secret = secrets.token_urlsafe(48)

    client = OAuthClient(
        client_id=client_id,
        client_secret_hash=_hash_secret(client_secret),
        client_name=body.client_name,
        redirect_uris=body.redirect_uris,
    )
    db.add(client)
    await db.commit()

    logger.info(f"OAuth client registered: {body.client_name} ({client_id[:8]}…)")

    return ClientRegistrationResponse(
        client_id=client_id,
        client_secret=client_secret,
        client_name=body.client_name,
        redirect_uris=body.redirect_uris,
    )


# =============================================================================
# Authorization Endpoint
# =============================================================================

_AUTHORIZE_HTML = """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Authorize — Whendoist</title>
    <style>
        @font-face {{
            font-family: 'Nunito'; font-style: normal; font-weight: 400 700;
            font-display: swap; src: url('/fonts/nunito-latin.woff2') format('woff2');
        }}
        @font-face {{
            font-family: 'Quicksand'; font-style: normal; font-weight: 500 700;
            font-display: swap; src: url('/fonts/quicksand-latin.woff2') format('woff2');
        }}
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        body {{
            font-family: 'Nunito', -apple-system, BlinkMacSystemFont, sans-serif;
            background: #0a0a0a; color: #e5e5e5;
            display: flex; align-items: center; justify-content: center;
            min-height: 100vh; padding: 1rem;
        }}
        .card {{
            background: #171717; border: 1px solid #262626; border-radius: 12px;
            padding: 2rem; max-width: 420px; width: 100%;
        }}
        .brand {{
            display: inline-flex; align-items: flex-end;
            margin-bottom: 1.5rem; padding-bottom: 1.25rem;
            border-bottom: 1px solid #262626; width: 100%;
        }}
        .brand svg {{ flex-shrink: 0; margin-bottom: 2px; margin-right: 1px; }}
        .brand span {{
            font-family: 'Quicksand', sans-serif;
            font-size: 1.25rem; font-weight: 500; color: #FFFFFF;
            line-height: 1;
        }}
        h1 {{ font-size: 1.25rem; font-weight: 700; margin-bottom: 0.625rem; }}
        .desc {{ color: #a3a3a3; font-size: 0.9rem; line-height: 1.5; }}
        .client-name {{ color: #167BFF; font-weight: 700; }}
        .scope {{
            background: rgba(109, 94, 246, 0.08); border: 1px solid rgba(109, 94, 246, 0.2);
            border-radius: 8px; padding: 0.875rem 1rem; margin: 1.25rem 0;
            font-size: 0.85rem; color: #c4b5fd;
        }}
        .scope strong {{ color: #e5e5e5; display: block; margin-bottom: 0.375rem; font-weight: 700; }}
        .scope ul {{ list-style: none; padding: 0; }}
        .scope li {{ padding: 0.15rem 0; }}
        .scope li::before {{ content: '\\2713\\0020'; color: #6D5EF6; font-weight: 700; }}
        .buttons {{ display: flex; gap: 0.75rem; margin-top: 1.5rem; }}
        button {{
            flex: 1; padding: 0.7rem 1rem; border-radius: 8px; border: none;
            font-family: 'Nunito', sans-serif;
            font-size: 0.9rem; font-weight: 700; cursor: pointer;
            transition: background 0.15s ease, border-color 0.15s ease;
        }}
        .approve {{ background: #6D5EF6; color: white; }}
        .approve:hover {{ background: #5B4CD4; }}
        .deny {{ background: #262626; color: #a3a3a3; border: 1px solid #404040; }}
        .deny:hover {{ background: #2a2a2a; border-color: #525252; color: #d4d4d4; }}
        .user {{
            font-size: 0.775rem; color: #525252; margin-top: 1.25rem;
            padding-top: 1rem; border-top: 1px solid #262626;
        }}
    </style>
</head>
<body>
    <div class="card">
        <div class="brand">
            <svg viewBox="38 40 180 160" width="17" height="15">
                <rect x="48" y="40" width="28" height="160" rx="14" fill="#167BFF"
                      transform="rotate(-8 62 120)"/>
                <rect x="114" y="72" width="28" height="127.3" rx="14" fill="#6D5EF6"/>
                <rect x="180" y="40" width="28" height="160" rx="14" fill="#A020C0"
                      transform="rotate(8 194 120)"/>
            </svg>
            <span>hendoist</span>
        </div>
        <h1>Authorize access</h1>
        <p class="desc"><span class="client-name">{client_name}</span> wants to access
           your Whendoist account.</p>
        <div class="scope">
            <strong>Permissions requested</strong>
            <ul>
                <li>Read and write your tasks</li>
                <li>Read and write your domains</li>
                <li>Read your schedule</li>
            </ul>
        </div>
        <form method="POST" action="/oauth/authorize">
            <input type="hidden" name="client_id" value="{client_id}">
            <input type="hidden" name="redirect_uri" value="{redirect_uri}">
            <input type="hidden" name="code_challenge" value="{code_challenge}">
            <input type="hidden" name="code_challenge_method" value="{code_challenge_method}">
            <input type="hidden" name="state" value="{state}">
            <input type="hidden" name="scope" value="{scope}">
            <div class="buttons">
                <button type="submit" name="action" value="deny" class="deny">Deny</button>
                <button type="submit" name="action" value="approve" class="approve">Approve</button>
            </div>
        </form>
        <p class="user">Signed in as {user_email}</p>
    </div>
</body>
</html>"""

_LOGIN_REDIRECT_HTML = """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Sign In — Whendoist</title>
    <style>
        @font-face {{
            font-family: 'Nunito'; font-style: normal; font-weight: 400 700;
            font-display: swap; src: url('/fonts/nunito-latin.woff2') format('woff2');
        }}
        @font-face {{
            font-family: 'Quicksand'; font-style: normal; font-weight: 500 700;
            font-display: swap; src: url('/fonts/quicksand-latin.woff2') format('woff2');
        }}
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        body {{
            font-family: 'Nunito', -apple-system, BlinkMacSystemFont, sans-serif;
            background: #0a0a0a; color: #e5e5e5;
            display: flex; align-items: center; justify-content: center;
            min-height: 100vh; padding: 1rem;
        }}
        .card {{
            background: #171717; border: 1px solid #262626; border-radius: 12px;
            padding: 2rem; max-width: 420px; width: 100%; text-align: center;
        }}
        .brand {{
            display: inline-flex; align-items: flex-end;
            margin-bottom: 1.5rem; padding-bottom: 1.25rem;
            border-bottom: 1px solid #262626; width: 100%;
            justify-content: center;
        }}
        .brand svg {{ flex-shrink: 0; margin-bottom: 2px; margin-right: 1px; }}
        .brand span {{
            font-family: 'Quicksand', sans-serif;
            font-size: 1.25rem; font-weight: 500; color: #FFFFFF;
            line-height: 1;
        }}
        h1 {{ font-size: 1.25rem; font-weight: 700; margin-bottom: 0.5rem; }}
        p {{ color: #a3a3a3; margin-bottom: 1.5rem; font-size: 0.875rem; line-height: 1.5; }}
        a {{
            display: inline-block; padding: 0.7rem 1.75rem; border-radius: 8px;
            background: #167BFF; color: white; text-decoration: none;
            font-family: 'Nunito', sans-serif;
            font-size: 0.9rem; font-weight: 700;
            transition: background 0.15s ease;
        }}
        a:hover {{ background: #1268D9; }}
    </style>
</head>
<body>
    <div class="card">
        <div class="brand">
            <svg viewBox="38 40 180 160" width="17" height="15">
                <rect x="48" y="40" width="28" height="160" rx="14" fill="#167BFF"
                      transform="rotate(-8 62 120)"/>
                <rect x="114" y="72" width="28" height="127.3" rx="14" fill="#6D5EF6"/>
                <rect x="180" y="40" width="28" height="160" rx="14" fill="#A020C0"
                      transform="rotate(8 194 120)"/>
            </svg>
            <span>hendoist</span>
        </div>
        <h1>Sign in required</h1>
        <p>You need to sign in to authorize this application.</p>
        <a href="{login_url}">Sign in with Google</a>
    </div>
</body>
</html>"""


@router.get("/authorize")
async def authorize_page(
    request: Request,
    client_id: str,
    redirect_uri: str,
    code_challenge: str,
    code_challenge_method: str = "S256",
    scope: str = "tasks",
    state: str = "",
    response_type: str = "code",
    db: AsyncSession = Depends(get_db),
) -> Response:
    """Show the OAuth authorization consent page."""
    if response_type != "code":
        raise HTTPException(status_code=400, detail="Only response_type=code is supported")

    if code_challenge_method not in SUPPORTED_CODE_CHALLENGE_METHODS:
        raise HTTPException(
            status_code=400, detail=f"Unsupported code_challenge_method. Use: {SUPPORTED_CODE_CHALLENGE_METHODS}"
        )

    # Validate client
    result = await db.execute(select(OAuthClient).where(OAuthClient.client_id == client_id))
    client = result.scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=400, detail="Unknown client_id")

    if redirect_uri not in client.redirect_uris:
        raise HTTPException(status_code=400, detail="Invalid redirect_uri")

    # Check if user is logged in
    user_id = get_user_id(request)
    if not user_id:
        # Store OAuth params in cookie and redirect to Google login
        # After login, Google callback redirects to /dashboard, but we'll
        # intercept with a cookie to come back here
        from urllib.parse import urlencode

        oauth_params = urlencode(
            {
                "client_id": client_id,
                "redirect_uri": redirect_uri,
                "code_challenge": code_challenge,
                "code_challenge_method": code_challenge_method,
                "scope": scope,
                "state": state,
                "response_type": response_type,
            }
        )
        return_url = f"/oauth/authorize?{oauth_params}"
        response = HTMLResponse(_LOGIN_REDIRECT_HTML.format(login_url="/auth/google"))
        response.set_cookie(
            key="oauth_return_to",
            value=return_url,
            max_age=600,
            httponly=True,
            samesite="lax",
            secure=_is_production,
            path="/",
        )
        return response

    # Get user email for display
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    # Render consent page
    html = _AUTHORIZE_HTML.format(
        client_name=client.client_name,
        client_id=client_id,
        redirect_uri=redirect_uri,
        code_challenge=code_challenge,
        code_challenge_method=code_challenge_method,
        state=state,
        scope=scope,
        user_email=user.email,
    )
    return HTMLResponse(html)


@router.post("/authorize")
@limiter.limit(AUTH_LIMIT)
async def authorize_submit(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> Response:
    """Handle authorization consent form submission."""
    form = await request.form()
    action = form.get("action")
    client_id = form.get("client_id", "")
    redirect_uri = form.get("redirect_uri", "")
    code_challenge = form.get("code_challenge", "")
    code_challenge_method = form.get("code_challenge_method", "S256")
    state = form.get("state", "")
    scope = form.get("scope", "tasks")

    # Build redirect URL for deny case
    if action == "deny":
        sep = "&" if "?" in str(redirect_uri) else "?"
        deny_url = f"{redirect_uri}{sep}error=access_denied"
        if state:
            deny_url += f"&state={state}"
        return RedirectResponse(deny_url, status_code=302)

    # Validate user
    user_id = get_user_id(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")

    # Validate client
    result = await db.execute(select(OAuthClient).where(OAuthClient.client_id == str(client_id)))
    client = result.scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=400, detail="Unknown client_id")

    if str(redirect_uri) not in client.redirect_uris:
        raise HTTPException(status_code=400, detail="Invalid redirect_uri")

    # Generate authorization code
    code = secrets.token_urlsafe(48)

    auth_code = OAuthAuthorizationCode(
        code_hash=_hash_secret(code),
        client_id=str(client_id),
        user_id=user_id,
        redirect_uri=str(redirect_uri),
        code_challenge=str(code_challenge),
        code_challenge_method=str(code_challenge_method),
        scope=str(scope),
        expires_at=datetime.now(UTC) + AUTH_CODE_TTL,
    )
    db.add(auth_code)
    await db.commit()

    logger.info(f"OAuth authorization code issued for user {user_id}, client {str(client_id)[:8]}…")

    # Redirect with code
    sep = "&" if "?" in str(redirect_uri) else "?"
    approve_url = f"{redirect_uri}{sep}code={code}"
    if state:
        approve_url += f"&state={state}"
    return RedirectResponse(approve_url, status_code=302)


# =============================================================================
# Token Endpoint
# =============================================================================


@router.post("/token", response_model=TokenResponse)
@limiter.limit(AUTH_LIMIT)
async def token_exchange(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    """Exchange authorization code for tokens, or refresh existing tokens.

    Accepts both application/x-www-form-urlencoded (OAuth 2.1 spec, RFC 6749 §4.1.3)
    and application/json for flexibility.
    """
    content_type = request.headers.get("content-type", "")
    if "form" in content_type.lower():
        form = await request.form()
        body = TokenRequest(
            grant_type=str(form.get("grant_type", "")),
            code=str(form["code"]) if form.get("code") else None,
            code_verifier=str(form["code_verifier"]) if form.get("code_verifier") else None,
            redirect_uri=str(form["redirect_uri"]) if form.get("redirect_uri") else None,
            client_id=str(form["client_id"]) if form.get("client_id") else None,
            client_secret=str(form["client_secret"]) if form.get("client_secret") else None,
            refresh_token=str(form["refresh_token"]) if form.get("refresh_token") else None,
        )
    else:
        body = TokenRequest.model_validate(await request.json())

    if body.grant_type == "authorization_code":
        return await _handle_authorization_code(body, db)
    elif body.grant_type == "refresh_token":
        return await _handle_refresh_token(body, db)
    else:
        raise HTTPException(status_code=400, detail="Unsupported grant_type")


async def _handle_authorization_code(body: TokenRequest, db: AsyncSession) -> TokenResponse:
    """Exchange authorization code + PKCE verifier for tokens."""
    if not body.code or not body.code_verifier or not body.client_id or not body.redirect_uri:
        raise HTTPException(
            status_code=400, detail="Missing required fields: code, code_verifier, client_id, redirect_uri"
        )

    # Validate client
    result = await db.execute(select(OAuthClient).where(OAuthClient.client_id == body.client_id))
    client = result.scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=400, detail="Unknown client_id")

    if body.client_secret and client.client_secret_hash != _hash_secret(body.client_secret):
        raise HTTPException(status_code=400, detail="Invalid client_secret")

    # Find and validate authorization code
    code_hash = _hash_secret(body.code)
    result = await db.execute(
        select(OAuthAuthorizationCode).where(
            OAuthAuthorizationCode.code_hash == code_hash,
            OAuthAuthorizationCode.client_id == body.client_id,
        )
    )
    auth_code = result.scalar_one_or_none()

    if not auth_code:
        raise HTTPException(status_code=400, detail="Invalid authorization code")

    if auth_code.expires_at < datetime.now(UTC):
        await db.delete(auth_code)
        await db.commit()
        raise HTTPException(status_code=400, detail="Authorization code expired")

    if auth_code.redirect_uri != body.redirect_uri:
        raise HTTPException(status_code=400, detail="redirect_uri mismatch")

    # Verify PKCE
    if not _verify_pkce(body.code_verifier, auth_code.code_challenge):
        raise HTTPException(status_code=400, detail="PKCE verification failed")

    # Consume the code (single-use)
    user_id = auth_code.user_id
    await db.delete(auth_code)

    # Clean up expired codes for this client
    await db.execute(delete(OAuthAuthorizationCode).where(OAuthAuthorizationCode.expires_at < datetime.now(UTC)))

    await db.commit()

    # Issue tokens using existing device auth mechanism
    access_token = _create_access_token(user_id)
    refresh_token = _create_refresh_token(user_id)

    logger.info(f"OAuth tokens issued for user {user_id}, client {body.client_id[:8]}…")

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        scope=auth_code.scope,
    )


async def _handle_refresh_token(body: TokenRequest, db: AsyncSession) -> TokenResponse:
    """Refresh an access token using a refresh token."""
    if not body.refresh_token:
        raise HTTPException(status_code=400, detail="Missing refresh_token")

    from app.routers.device_auth import _verify_refresh_token

    user_id = _verify_refresh_token(body.refresh_token)
    if not user_id:
        raise HTTPException(status_code=400, detail="Invalid or expired refresh_token")

    # Verify user still exists
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=400, detail="User not found")

    access_token = _create_access_token(user_id)
    refresh_token = _create_refresh_token(user_id)

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
    )
