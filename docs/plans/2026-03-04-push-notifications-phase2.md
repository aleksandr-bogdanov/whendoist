---
version:
pr:
created: 2026-03-04
---

# Phase 2: Push Notifications / Remote Reminders

## Context

Phase 1 (local notifications) is complete — reminders fire via `tauri-plugin-notification` when the app is running. But if the app is closed/backgrounded, reminders are missed. Phase 2 adds server-side push delivery so notifications fire regardless of app state.

**Architecture:** Silent push + local notification.
```
Backend cron (60s) → find tasks with due reminders →
send silent push via FCM/APNs → device wakes → Rust creates local notification
```

**Decisions:**
- Raw `httpx` for both FCM v1 HTTP API and APNs HTTP/2 (no firebase-admin)
- Community plugin `choochmeque/tauri-plugin-notifications` with `push-notifications` feature
- `reminder_sent_at` resets when scheduling fields change (allows re-fire)

---

## Implementation Steps

### Step 1: `app/models.py` — DeviceToken + reminder_sent_at

**Add `reminder_sent_at` to Task** (after `reminder_minutes_before`, line 352):
```python
reminder_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
```

**Add `DeviceToken` model** (new section after ActivityLog, ~line 581):
```python
class DeviceToken(Base):
    __tablename__ = "device_tokens"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    token: Mapped[str] = mapped_column(String(255), nullable=False)
    platform: Mapped[str] = mapped_column(String(20), nullable=False)  # "ios" | "android"
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    user: Mapped["User"] = relationship(back_populates="device_tokens")
    __table_args__ = (
        UniqueConstraint("user_id", "token", name="uq_device_token_user_token"),
    )
```

**Add relationship to User** (after `passkeys` relationship, ~line 108):
```python
device_tokens: Mapped[list["DeviceToken"]] = relationship(
    back_populates="user", cascade="all, delete-orphan", passive_deletes=True
)
```

### Step 2: Alembic migration

`just migrate-new "add_device_tokens_and_reminder_sent_at"` — creates `device_tokens` table + adds `reminder_sent_at` column to `tasks`.

### Step 3: `app/constants.py` — Push constants

New section:
```python
# Push Notification Constants
PUSH_REMINDER_LOOP_INTERVAL_SECONDS = 60
PUSH_REMINDER_LOOP_TIMEOUT_SECONDS = 55
PUSH_REMINDER_FIRE_WINDOW_SECONDS = 120  # 2-min window for clock drift
PUSH_MAX_TOKENS_PER_USER = 10
PUSH_ENCRYPTED_TITLE = "Task reminder"
FCM_SEND_URL = "https://fcm.googleapis.com/v1/projects/{project_id}/messages:send"
FCM_TOKEN_URL = "https://oauth2.googleapis.com/token"
FCM_OAUTH_SCOPE = "https://www.googleapis.com/auth/firebase.messaging"
APNS_PROD_HOST = "https://api.push.apple.com"
APNS_SANDBOX_HOST = "https://api.sandbox.push.apple.com"
```

### Step 4: `app/config.py` — Push settings

Add to `Settings` class (all default to empty = not configured):
```python
# Push notifications (FCM + APNs)
fcm_project_id: str = ""
fcm_service_account_json: str = ""  # JSON string or path to .json file
apns_key_id: str = ""
apns_team_id: str = ""
apns_key_path: str = ""             # Path to .p8 file
apns_bundle_id: str = "com.whendoist.app"
apns_use_sandbox: bool = True
```

### Step 5: `app/services/push_service.py` — FCM + APNs delivery (NEW)

Pure push delivery service — no DB access, returns result objects.

```python
class PushResult:
    success: bool
    token_invalid: bool  # True → caller should delete token from DB

class PushService:
    async def send_silent_push(self, token, platform, task_id, title=None) -> PushResult
    async def _send_fcm(self, token, data) -> PushResult   # Google OAuth2 JWT → bearer token
    async def _send_apns(self, token, data) -> PushResult   # ES256 JWT, HTTP/2
```

Key design:
- FCM: OAuth2 service account JWT (using `cryptography` RS256, already a dep) → exchange for bearer → POST to FCM v1 API
- APNs: ES256 JWT from .p8 key (using `cryptography` EC, already a dep) → HTTP/2 POST
- Both tokens cached in-memory with expiry
- FCM 404 / APNs 410 → `token_invalid=True` (stale token cleanup)
- 5xx / network errors → `success=False, token_invalid=False` (retry naturally next cycle)
- Graceful no-op if FCM/APNs not configured (logs warning once)

**FCM silent push payload:**
```json
{"message": {"token": "...", "data": {"task_id": "123", "title": "Buy groceries"},
  "android": {"priority": "high"}}}
```

**APNs silent push payload:**
```json
{"aps": {"content-available": 1}, "task_id": "123", "title": "Buy groceries"}
```

For encrypted users: `title` omitted (Rust falls back to "Task reminder").

### Step 6: `app/routers/push_notifications.py` — Register/unregister tokens (NEW)

```python
router = APIRouter(prefix="/push", tags=["push-notifications"])
```

**POST /api/v1/push/token** — Register device token
- Auth: `Depends(require_user)`
- Body: `{token: str, platform: "ios"|"android"}`
- Upsert: if `(user_id, token)` exists → touch `updated_at`; else insert
- Enforce `PUSH_MAX_TOKENS_PER_USER` — delete oldest if cap reached
- Returns 201

**DELETE /api/v1/push/token** — Unregister device token
- Auth: `Depends(require_user)`
- Body: `{token: str}`
- Delete WHERE `user_id = user.id AND token = data.token`
- Idempotent: 204 even if not found

### Step 7: `app/routers/v1/__init__.py` — Wire router

Add `push_notifications` to imports and `router.include_router(push_notifications.router)`.

### Step 8: `app/routers/tasks.py` — Reset reminder_sent_at on update

In `update_task()` (between line 574 `update_data = data.model_dump(...)` and line 597 `service.update_task()`):

```python
# Reset reminder_sent_at if scheduling fields change (allows push to re-fire)
REMINDER_RESET_FIELDS = {"scheduled_date", "scheduled_time", "reminder_minutes_before"}
if update_data.keys() & REMINDER_RESET_FIELDS:
    needs_reset = any(
        field in update_data and update_data[field] != getattr(current, field)
        for field in REMINDER_RESET_FIELDS
    )
    if needs_reset:
        update_data["reminder_sent_at"] = None
```

**Also:** Add `"reminder_sent_at"` to the `UPDATABLE_FIELDS` whitelist in `TaskService.update_task()` (line 419 of `task_service.py`).

### Step 9: `app/tasks/push_notifications.py` — Background reminder loop (NEW)

Follow `app/tasks/snapshots.py` pattern exactly:

```python
async def process_due_reminders() -> dict[str, int]:
    """Find tasks with due reminders, send push to registered devices."""
```

**Query logic** (PostgreSQL-specific, runs only on production DB):
```sql
SELECT t.id, t.user_id, t.title, up.encryption_enabled
FROM tasks t
JOIN user_preferences up ON up.user_id = t.user_id
WHERE t.reminder_minutes_before IS NOT NULL
  AND t.reminder_sent_at IS NULL
  AND t.status = 'pending'
  AND t.scheduled_date IS NOT NULL
  AND (t.scheduled_date::timestamp + COALESCE(t.scheduled_time, '00:00')::interval
       - (t.reminder_minutes_before * interval '1 minute'))
      BETWEEN :window_start AND :now
```

**Per-task processing:**
1. Fetch user's `DeviceToken` records
2. If no tokens → set `reminder_sent_at = now` (don't retry every 60s)
3. For each token → `push_service.send_silent_push()`
4. Delete tokens where `result.token_invalid`
5. Set `reminder_sent_at = now` (always, even on failure — push is best-effort)

**Loop:** sleep 60s → `asyncio.wait_for(process_due_reminders(), timeout=55)` → repeat.

### Step 10: `app/main.py` — Wire background task

In lifespan startup (after `start_snapshot_background()`):
```python
from app.tasks.push_notifications import start_push_reminder_background, stop_push_reminder_background

if settings.fcm_project_id or settings.apns_key_id:
    start_push_reminder_background()
```

In shutdown (before `stop_snapshot_background()`):
```python
stop_push_reminder_background()
```

No-op when push not configured — backend works fine without credentials.

### Step 11: `pyproject.toml` — Version bump + httpx[http2]

- Bump version to `0.61.0`
- Change `"httpx>=0.28.0"` → `"httpx[http2]>=0.28.0"` (adds `h2` for APNs HTTP/2)
- Run `uv lock`

### Step 12: `frontend/src-tauri/Cargo.toml` — Replace notification plugin

```toml
# Remove:
tauri-plugin-notification = "2"

# Add:
tauri-plugin-notifications = { git = "https://github.com/nicklimmm/tauri-plugin-notifications", features = ["push-notifications"] }
```

Note: Verify exact repo URL and version at implementation time. The `choochmeque/tauri-plugin-notifications` plugin may have been transferred or forked. Check crates.io and GitHub.

### Step 13: `frontend/src-tauri/src/lib.rs` — Plugin + push handlers

Replace `tauri_plugin_notification::init()` with `tauri_plugin_notifications::init()`.

Add `#[cfg(mobile)]` setup block:
1. `app.push().register()` — triggers OS push registration
2. `on_registration(|token| { ... })` — emit `"push-token-received"` event to frontend
3. `on_notification_received(|data| { ... })` — parse `task_id`/`title` from payload → create local notification via the same plugin

Add `PushTokenState(Mutex<Option<String>>)` managed state.

Register new command: `get_push_token`.

### Step 14: `frontend/src-tauri/src/commands/notifications.rs` — Update API

Update local notification calls to use new plugin API surface:
- `tauri_plugin_notification::NotificationExt` → `tauri_plugin_notifications::NotificationsExt`
- `app.notification().builder()...show()` → equivalent new-plugin API

Add `get_push_token` command (reads from `PushTokenState`).

### Step 15: `frontend/src-tauri/capabilities/default.json` — Permissions

Update `"notification:default"` → `"notifications:default"` (plural, new plugin identifier).

### Step 16: `frontend/src/lib/tauri-push.ts` — Push registration wrapper (NEW)

Following `tauri-notifications.ts` pattern:
- `registerPushTokenWithBackend(token, platform)` → `POST /api/v1/push/token`
- `unregisterPushTokenFromBackend(token)` → `DELETE /api/v1/push/token`
- `getStoredPushToken()` / `storePushToken()` / `clearPushToken()` → `LazyStore("credentials.json")`

### Step 17: `frontend/src/hooks/use-push-notifications.ts` — Push hook (NEW)

Called from `_authenticated.tsx` alongside `useReminders()`.

```typescript
export function usePushNotifications() {
  // Only active when isTauri && (isIOS || isAndroid)
  // On mount: listen for "push-token-received" Tauri event
  // Compare with stored token → if different, register with backend
  // Store token locally for change detection
  // On unmount (logout): unregister from backend, clear stored token
}
```

Uses `@tauri-apps/api/event.listen()` for the event from Rust.

### Step 18: `frontend/src/routes/_authenticated.tsx` — Wire hook

Add `usePushNotifications()` call alongside existing `useReminders()`.

### Step 19: `frontend/src/lib/tauri-notifications.ts` — Check compatibility

Verify existing `invoke("schedule_reminder", ...)` calls still work with the new plugin. The Rust command names stay the same; only the internal plugin API changes (handled in Rust). **Likely no changes needed here.**

---

## Files Modified (20 files)

| # | File | Action |
|---|---|---|
| 1 | `app/models.py` | Add `DeviceToken` model, `Task.reminder_sent_at`, `User.device_tokens` relationship |
| 2 | `alembic/versions/xxx_add_device_tokens_and_reminder_sent_at.py` | New migration |
| 3 | `app/constants.py` | Add push notification constants section |
| 4 | `app/config.py` | Add FCM/APNs settings to `Settings` class |
| 5 | `app/services/push_service.py` | **New** — FCM + APNs delivery via httpx |
| 6 | `app/routers/push_notifications.py` | **New** — POST/DELETE `/api/v1/push/token` |
| 7 | `app/routers/v1/__init__.py` | Include push_notifications router |
| 8 | `app/routers/tasks.py` | Reset `reminder_sent_at` on scheduling field changes |
| 9 | `app/services/task_service.py` | Add `reminder_sent_at` to `UPDATABLE_FIELDS` whitelist (line 419) |
| 10 | `app/tasks/push_notifications.py` | **New** — background loop (60s), finds due reminders, sends push |
| 11 | `app/main.py` | Wire `start/stop_push_reminder_background()` in lifespan |
| 12 | `pyproject.toml` | Bump to v0.61.0, `httpx[http2]>=0.28.0` |
| 13 | `frontend/src-tauri/Cargo.toml` | Replace `tauri-plugin-notification` with community push plugin |
| 14 | `frontend/src-tauri/src/lib.rs` | Register new plugin, push handlers, `PushTokenState` |
| 15 | `frontend/src-tauri/src/commands/notifications.rs` | Update for new plugin API, add `get_push_token` |
| 16 | `frontend/src-tauri/capabilities/default.json` | Update permission identifier |
| 17 | `frontend/src/lib/tauri-push.ts` | **New** — push token registration/store wrapper |
| 18 | `frontend/src/hooks/use-push-notifications.ts` | **New** — push registration hook |
| 19 | `frontend/src/routes/_authenticated.tsx` | Wire `usePushNotifications()` |
| 20 | `frontend/src/lib/tauri-notifications.ts` | Verify compatibility (likely no changes) |

Plus: `CHANGELOG.md`, `uv.lock` (auto from `uv lock`)

---

## Key Patterns Reused

| Pattern | Source | Reuse in |
|---|---|---|
| Background task loop | `app/tasks/snapshots.py` (sleep → wait_for → repeat) | `app/tasks/push_notifications.py` |
| Per-user session isolation | `app/tasks/snapshots.py` (`async_session_factory()` per user) | Background reminder processing |
| Router + inline Pydantic schemas | `app/routers/device_auth.py` | `app/routers/push_notifications.py` |
| `Depends(require_user)` auth | All protected routers | Push token endpoints |
| `UPDATABLE_FIELDS` whitelist | `app/services/task_service.py:419` | Add `reminder_sent_at` |
| Tauri `invoke()` wrapper | `frontend/src/lib/tauri-notifications.ts` | `frontend/src/lib/tauri-push.ts` |
| `LazyStore("credentials.json")` | `frontend/src/lib/tauri-token-store.ts` | Push token local storage |
| `listen()` for Tauri events | TanStack patterns in `_authenticated.tsx` | `use-push-notifications.ts` |
| `encryption_enabled` check | `UserPreferences.encryption_enabled` in `app/models.py:223` | Background task query join |

---

## Verification

1. **Backend unit tests** (CI, SQLite):
   - `test_push_router.py` — register/unregister/dedup/multitenancy
   - `test_reminder_sent_at_reset.py` — update task scheduling → `reminder_sent_at` cleared

2. **Backend integration tests** (CI, PostgreSQL):
   - `test_push_background_task.py` — mock push_service, verify fire-time SQL query

3. **Push service tests** (CI, SQLite + mocked httpx):
   - `test_push_service.py` — FCM/APNs payload structure, token invalidation handling

4. **Manual mobile verification:**
   - Create task with 1-minute reminder → close app completely → notification fires at reminder time → tap opens app
   - Verify encrypted user gets "Task reminder" (not the title)
   - Verify logout calls DELETE /api/v1/push/token

5. **Checks before PR:**
   ```bash
   uv run ruff format . && uv run ruff check . && uv run pyright app/ && just test
   cd frontend && npx tsc -p tsconfig.app.json --noEmit && npx biome check . && npm run build
   ```

---

## Config Required (not committed)

```env
# FCM (Android) — from Firebase Console → Project Settings → Service Accounts
FCM_PROJECT_ID=whendoist-xxxxx
FCM_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"...","private_key":"...","client_email":"..."}

# APNs (iOS) — from Apple Developer → Keys
APNS_KEY_ID=XXXXXXXXXX
APNS_TEAM_ID=XXXXXXXXXX
APNS_KEY_PATH=/path/to/AuthKey_XXXXXXXXXX.p8
APNS_BUNDLE_ID=com.whendoist.app
APNS_USE_SANDBOX=true
```

Backend starts fine without these — push loop simply doesn't start.
