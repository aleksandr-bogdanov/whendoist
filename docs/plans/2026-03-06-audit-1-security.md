---
version:
pr:
created: 2026-03-06
---

# Security Audit — v0.57.0 → v0.64.1

**Scope:** All changes since commit `8af04e6` (v0.57.0).
Focus: Tauri mobile (biometric auth, push notifications, offline SQLite cache, IPC),
API endpoints, device auth, encryption, CORS.

**Method:** Source code review of every changed file. No speculation — each finding
references verified code.

---

## Summary

| Severity | Count |
|----------|-------|
| Critical | 0     |
| High     | 1     |
| Medium   | 3     |
| Low      | 4     |

Overall: The codebase has strong security fundamentals. Multitenancy filtering is
consistent, authentication is required on all API routes, and encryption-aware push
notification handling is correct. The main concerns are around stateless token
revocation and defense-in-depth gaps.

---

## Findings

### [SEV: High] Stateless device tokens cannot be revoked server-side

**File(s):** `app/routers/device_auth.py:166-182`

**Description:**
The `DELETE /api/v1/device/token` endpoint is purely advisory — it logs the event
but performs no server-side invalidation. Device tokens are signed with
`itsdangerous.URLSafeTimedSerializer` and validated by signature + expiry alone.
There is no server-side token denylist or database-backed session.

```python
@router.delete("/token")
async def revoke_device_token(request: Request) -> dict:
    # Best-effort: extract user_id from bearer token for logging
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        user_id = verify_access_token(auth_header[7:])
        if user_id:
            logger.info(f"Device token revoked for user {user_id}")
    return {"success": True}
```

**Why it matters:**
If an access token (1h TTL) or refresh token (30d TTL) is stolen (e.g., from a
compromised device, backup extraction, or ADB on a rooted device), the user has no
way to invalidate it. The stolen refresh token remains valid for up to 30 days and
can mint new access tokens. Account password changes and logout do not invalidate
outstanding tokens.

**Exploit scenario:**
1. Attacker extracts `biometric-keys.json` or `tauri-plugin-store` file from a
   rooted/jailbroken device (or device backup).
2. Attacker uses the refresh token to mint new access tokens indefinitely for 30d.
3. User logs out — revocation endpoint logs a message but tokens remain valid.
4. User has no recourse except waiting 30 days for refresh token expiry.

---

### [SEV: Medium] CSRF gap on device token exchange endpoint

**File(s):** `app/middleware/csrf.py:31`, `app/routers/device_auth.py:97-128`

**Description:**
`POST /api/v1/device/token` is CSRF-exempt (csrf.py line 31) and authenticates via
session cookie (device_auth.py line 108). This combination means a cross-origin
attacker can forge the request while the user has an active session cookie.

```python
# csrf.py line 31
CSRF_EXEMPT_PATHS = {
    ...
    "/api/v1/device/token",
    "/api/v1/device/refresh",
}
```

```python
# device_auth.py line 108
user_id = get_user_id(request)  # Reads from session cookie
```

**Why it matters:**
After Google OAuth completes, the user briefly has a valid session cookie. During
this window, a malicious page could `POST` to `/api/v1/device/token` and receive
valid access + refresh tokens in the JSON response.

**Mitigating factors (reduce severity from High to Medium):**
- The session window is narrow (user must have just completed OAuth).
- CORS policy blocks cross-origin reads: `allow_credentials=False` means the
  browser won't attach cookies on cross-origin requests. The `tauri://localhost`
  origin doesn't apply to web browsers.
- The attacker must be on an allowed origin to read the response.

However, if the user is on `localhost:5173` (dev) and visits a malicious page on
`localhost:5173` in another tab, same-origin policy allows the request with cookies.

---

### [SEV: Medium] Biometric key stored in plaintext JSON, not hardware-backed keystore

**File(s):** `frontend/src-tauri/src/commands/biometric.rs:9-20, 105-112`

**Description:**
The AES-256-GCM encryption key is stored via `tauri-plugin-store`, which writes a
JSON file (`biometric-keys.json`) to the app's private data directory. This is NOT
hardware-backed.

```rust
// biometric.rs line 111
store.set(BIOMETRIC_KEY_ENTRY, serde_json::json!(key_data));
store.save().map_err(|e| format!("Store save error: {e}"))?;
```

The code comments (lines 9-20) explicitly acknowledge this limitation and reference
`tauri-plugin-keystore` as the ideal alternative.

**Why it matters:**
On rooted/jailbroken devices or via device backup extraction (iTunes/iMazing for
iOS, ADB for Android), the encryption key can be read from the JSON file. This
defeats the client-side encryption for those attack vectors. The biometric prompt is
a software gate only — it doesn't protect the key at rest.

**Mitigating factors:**
- Already documented in code as a known limitation.
- Requires physical access or device compromise.
- iOS App Sandbox provides baseline protection on non-jailbroken devices.

---

### [SEV: Medium] Dev CORS origins always allowed in production

**File(s):** `app/main.py:199-200`

**Description:**
The CORS middleware includes localhost dev origins unconditionally:

```python
allow_origins=[
    "tauri://localhost",        # macOS / iOS production
    "https://tauri.localhost",  # Windows production
    "http://localhost:5173",    # dev mode (Vite)     ← always included
    "http://localhost:1420",    # Tauri default dev port ← always included
],
```

There is no conditional check against `is_production` (which exists in the same
file, line 169).

**Why it matters:**
If any process on the production server (or a reverse-proxy-accessible network
neighbor) binds to port 5173 or 1420, it can make cross-origin API requests to the
production backend. Combined with `allow_credentials=False`, this limits the attack
to bearer-token-authenticated requests (not session cookies), but it's still an
unnecessary expansion of the trusted origin set.

**Mitigating factors:**
- `allow_credentials=False` prevents cookie-based attacks.
- Requires a process running on the production host on the specific port.
- Low practical exploitability in a containerized Railway deployment.

---

### [SEV: Low] Push notification payload includes plaintext task title for non-encrypted users

**File(s):** `app/tasks/push_notifications.py:96-97`, `app/services/push_service.py:125-127, 297-300`

**Description:**
For non-encrypted users, the task title is included directly in the FCM/APNs push
payload:

```python
# push_notifications.py line 96-97
title = task_row.title if not task_row.encryption_enabled else None

# push_service.py line 125-127
data = {"task_id": str(task_id)}
if title:
    data["title"] = title
```

For APNs, the title is sent as a top-level key in the JSON payload (line 297-300):
```python
payload = {
    "aps": {"content-available": 1},
    **data,  # includes title
}
```

**Why it matters:**
Apple (APNs) and Google (FCM) can read push notification payloads in transit and at
rest on their servers. This is standard push notification behavior, but users who
haven't explicitly enabled encryption may not expect their task titles to be visible
to third-party infrastructure.

Encrypted users are correctly protected — title is `None` and the app falls back to
a generic "Task reminder" string.

---

### [SEV: Low] DeviceToken deletion in background task lacks defense-in-depth user_id filter

**File(s):** `app/tasks/push_notifications.py:126`

**Description:**
The invalid token cleanup deletes by `DeviceToken.id` without a redundant `user_id`
filter:

```python
# line 126
await db.execute(delete(DeviceToken).where(DeviceToken.id.in_(invalid_token_ids)))
```

The `invalid_token_ids` list is constructed from tokens that were already filtered by
`user_id` (line 85-88), so this is not exploitable in the current code. However, it
violates defense-in-depth: if a future refactor changes how `invalid_token_ids` is
populated, this delete could affect other users' tokens.

**Why it matters:**
Fragile code pattern. All other `DeviceToken` operations in the codebase include an
explicit `user_id` filter (push_notifications.py lines 48, 61, 96). This one is the
exception.

---

### [SEV: Low] Push token field has no max_length validation

**File(s):** `app/routers/push_notifications.py:29-31`

**Description:**
The `RegisterTokenRequest` schema doesn't constrain token length:

```python
class RegisterTokenRequest(BaseModel):
    token: str          # No Field(max_length=255)
    platform: Literal["ios", "android"]
```

The database column is `String(255)` (models.py), so overly long tokens would be
silently truncated by the database. Real FCM tokens are ~152 chars and APNs tokens
are 64 hex chars, but the API accepts arbitrarily long strings.

**Why it matters:**
Minor — could cause database truncation surprises, but no security exploit. A
`Field(max_length=255)` would provide explicit validation with a clear error message.

---

### [SEV: Low] clear_encryption_key IPC command doesn't require biometric on mobile

**File(s):** `frontend/src-tauri/src/commands/biometric.rs:176-188`

**Description:**
The `clear_encryption_key` command can be invoked without biometric authentication,
even on mobile:

```rust
#[tauri::command]
pub fn clear_encryption_key(app: tauri::AppHandle) -> Result<(), String> {
    // No #[cfg(mobile)] biometric gate here
    use tauri_plugin_store::StoreExt;
    let store = app.store(BIOMETRIC_STORE_FILE)...;
    store.delete(BIOMETRIC_KEY_ENTRY);
    store.save()...;
}
```

In contrast, `store_encryption_key` and `retrieve_encryption_key` both require
biometric authentication on mobile (lines 89-102, 127-141).

**Why it matters:**
Not a data exposure risk (clearing a key doesn't reveal it), but could be used as a
denial-of-service: any WebView-injected JavaScript could clear the stored key,
forcing the user to re-enter their encryption passphrase. In practice, the Tauri
WebView only loads bundled code (signed app), so XSS would require a separate
vulnerability.

---

## Areas Verified as Secure

### Multitenancy (all queries verified)
Every new database query and API endpoint properly filters by `user_id`:
- `app/routers/push_notifications.py` — lines 48, 61, 72, 96 ✓
- `app/routers/device_auth.py` — user lookup by session/token ✓
- `app/routers/preferences.py` — via `PreferencesService(db, user.id)` ✓
- `app/routers/tasks.py` — via `TaskService(db, user.id)` and explicit `user_id` filters ✓
- `app/routers/instances.py` — via `RecurrenceService(db, user.id)` ✓
- `app/routers/analytics.py` — via `AnalyticsService(db, user.id)` ✓
- `app/routers/gcal_sync.py` — explicit `user_id` in every query ✓
- `app/tasks/push_notifications.py` — `Task.user_id == user_id` on all updates ✓
- `app/tasks/recurring.py` — `Task.user_id == User.id` join ✓
- Batch operations use `Task.id.in_(ids), Task.user_id == user.id` ✓

### Authentication coverage
All v1 API routes require `Depends(require_user)`:
- Routes registered in `app/routers/v1/__init__.py` ✓
- `get_user_id()` correctly prioritizes bearer tokens over session cookies ✓
- Invalid bearer tokens return `None` immediately (no fallthrough to session) ✓
- Device token exchange verifies user exists in DB before issuing tokens ✓

### CSRF protection
- Bearer-authenticated requests correctly exempt from CSRF (csrf.py:86-91) ✓
- Session-based CSRF uses `secrets.compare_digest()` for constant-time comparison ✓
- OAuth callbacks use state parameter instead of CSRF ✓

### Offline cache encryption
- `tauri-cache.ts` stores ciphertext as-is (line 8-9) ✓
- Decryption stays in TanStack Query layer (`use-crypto.ts`) ✓
- Cache cleared on logout (`clearAllCache()` line 205) ✓
- Write queue cleared on logout ✓
- Rust never touches encryption keys ✓

### Tauri IPC surface
- All IPC commands are local-only (no direct backend data access) ✓
- Biometric commands gated on mobile via `#[cfg(mobile)]` ✓
- Widget data excludes encrypted fields when encryption enabled ✓
- Capability permissions are platform-scoped and minimal ✓
- CSP in `tauri.conf.json` restricts `connect-src` to `self` + `whendoist.com` ✓

### Input validation
- Task title/description stripped of control characters (`_strip_control_chars`) ✓
- Length limits enforced on title and description ✓
- Impact, clarity, duration, reminder_minutes_before all enum/range-validated ✓
- STT output flows through the same validation pipeline as typed input ✓
- Smart input parser is client-side only; server validates independently ✓

### Push notification multitenancy
- Device token registration requires `require_user` ✓
- Token upsert prevents duplicates via `(user_id, token)` unique constraint ✓
- Max tokens per user enforced, oldest deleted first ✓
- Encrypted users' titles never sent in push payloads ✓
- Cascade deletion on user account removal ✓

### Token signing
- Separate `URLSafeTimedSerializer` instances with unique salts for access/refresh ✓
- Token type field (`"t": "access"` / `"t": "refresh"`) prevents type confusion ✓
- User existence verified on every refresh ✓
- Refresh tokens rotate (new refresh token issued on each refresh call) ✓
