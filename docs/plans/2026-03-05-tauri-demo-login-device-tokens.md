---
version:
pr:
created: 2026-03-05
---

# Fix: Demo Login in Tauri (iOS Simulator)

## Context

Demo login returns "not found" in Tauri iOS sim because of two issues:

1. **No Vite proxy in Tauri mode**: `vite.config.ts:18-23` explicitly sets `proxy: undefined`
   when `TAURI_ENV_PLATFORM` is set. So `<a href="/auth/demo">` navigates to
   `localhost:5173/auth/demo` — the SPA, which has no `/auth/demo` route.

2. **Session-based flow incompatible with Tauri**: Even if the request reached the backend,
   `demo_login()` sets a session cookie and redirects. Tauri can't use session cookies
   (different origin) — it needs bearer device tokens.

## Approach

Add a `POST /api/v1/device/demo-token` endpoint that creates/gets the demo user and
returns device tokens directly (no session, no redirect). The frontend calls this via
axios (which already routes to production in Tauri mode), stores the tokens, and
navigates via the SPA router.

## Changes

### 1. Backend: `app/routers/device_auth.py`

Add new endpoint reusing existing patterns:

```python
@router.post("/demo-token", response_model=TokenResponse)
@limiter.limit(DEMO_LIMIT)
async def demo_device_token(
    request: Request,
    body: DemoTokenRequest,  # { profile: str }
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    """Demo login for Tauri — returns device tokens directly."""
    if not _settings.demo_login_enabled:
        raise HTTPException(status_code=404)
    if body.profile not in DEMO_VALID_PROFILES:
        raise HTTPException(status_code=400, detail="Invalid profile")
    demo_service = DemoService(db)
    user = await demo_service.get_or_create_demo_user(body.profile)
    return TokenResponse(
        access_token=_create_access_token(user.id),
        refresh_token=_create_refresh_token(user.id),
        expires_at=int(time.time()) + DEVICE_TOKEN_MAX_AGE_SECONDS,
    )
```

Imports to add: `DEMO_LIMIT` from rate_limit, `DEMO_VALID_PROFILES` from constants,
`DemoService` from services.

### 2. Frontend: `frontend/src/routes/login.lazy.tsx`

When `isTauri`, change the demo button from an `<a href>` to a button that:
1. Calls `POST /api/v1/device/demo-token` via axios with `{ profile: "demo" }`
2. Stores the response via `saveDeviceToken()`
3. Navigates to `/thoughts` via `window.location.href = "/thoughts"`

```tsx
// Add isTauri import and handler
const handleDemoLogin = async () => {
  const { data } = await axios.post("/api/v1/device/demo-token", { profile: "demo" });
  const { saveDeviceToken } = await import("@/lib/tauri-token-store");
  await saveDeviceToken(data);
  window.location.href = "/thoughts";
};

// In JSX: conditionally render button vs anchor
{isTauri ? (
  <button onClick={handleDemoLogin} className="login-demo-btn">...</button>
) : (
  <a href="/auth/demo" className="login-demo-btn">...</a>
)}
```

### 3. Regenerate API types

Run `cd frontend && npx orval` to pick up the new endpoint (optional — the call
is made directly via axios, not via generated hooks).

## Files Modified

| File | Change |
|------|--------|
| `app/routers/device_auth.py` | Add `DemoTokenRequest` model + `demo_device_token` endpoint |
| `frontend/src/routes/login.lazy.tsx` | Tauri-aware demo login button |
| `pyproject.toml` | Version bump |
| `uv.lock` | Lockfile sync |
| `CHANGELOG.md` | Version entry |

## Verification

1. `just tauri-ios-sim` — demo button should log in and navigate to `/thoughts`
2. `uv run ruff format . && uv run ruff check . && uv run pyright app/ && just test`
3. `cd frontend && npx tsc -p tsconfig.app.json --noEmit && npx biome check . && npm run build`
