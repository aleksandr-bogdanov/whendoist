# V1.0 Final Ship Readiness Review

> Opus 4.6 investigation, February 9 2026. Independent blind audit followed by
> cross-reference with 4 prior gate audits (2026-02-09-v1-gate-audit-{2,3,4}).
>
> Method: Full CI run (578 pass), 6 parallel code investigations (auth boundary,
> untrusted input, data lifecycle, error paths, client-server contract, state
> consistency), adversarial/frustrated-user scenarios, then backlog cross-reference.
>
> Prior audit chain: recurring-task-audit → gcal-sync-audit → pwa-offline →
> gate-audit-2 → gate-audit-3 → gate-audit-4 (and their implementation PRs).

---

## New Findings (not fixed, not in backlog)

### NF-1. `TaskUpdate.clarity` missing enum validation (MEDIUM)

**Evidence:** `app/routers/tasks.py:190` — `clarity: str | None = None`

`TaskCreate` validates clarity to `{"autopilot", "normal", "brainstorm"}` at line 167-171.
`TaskUpdate` has NO corresponding validator. Any string up to 20 chars (SQL column limit)
can be stored via `PUT /api/v1/tasks/{task_id}`.

The same gap exists in `BackupTaskSchema` at `backup_service.py:56`.

Audit #4 (M2) fixed `impact` and `duration_minutes` range validation but missed `clarity`.
The client always sends valid values, so this is an API-only exploit path.

**Fix:** Add `@field_validator("clarity")` to `TaskUpdate` matching `TaskCreate`, and enum
validation in `BackupTaskSchema`.

---

### NF-2. `BackupTaskSchema.status` accepts any string (MEDIUM)

**Evidence:** `app/services/backup_service.py:55` — `status: str = "pending"`

Valid values should be `{"pending", "completed", "archived"}` for tasks and
`{"pending", "completed", "skipped"}` for instances (line 42). A crafted backup file
can inject arbitrary status strings. Tasks with invalid statuses would be invisible to
all status-based queries (`Task.status == "pending"`, etc.), effectively hiding data.

Not flagged in any prior audit. Not in backlog.

**Fix:** Add `@field_validator("status")` with enum check on both `BackupTaskSchema`
and `BackupInstanceSchema`.

---

### NF-3. Archived task instances appear in calendar views (MEDIUM)

**Evidence:** `app/services/recurrence_service.py:219-236`

`get_instances_for_range()` joins Task but does NOT filter `Task.status != "archived"`.
When a recurring task is archived via `DELETE /api/v1/tasks/{task_id}`, its pending
instances remain and will appear in the instance list / calendar view.

The archive path at `task_service.py:360-371` does not touch instances — it only
sets `status="archived"` on the task and recursively archives subtasks.

Not flagged in any prior audit. Not in backlog.

**Fix:** Add `.where(Task.status != "archived")` to the query at line 222.

---

### NF-4. Backup import does not clean Google Calendar events (MEDIUM)

**Evidence:** `app/services/backup_service.py:325-333` — `_clear_user_data()`

The `POST /api/v1/import/wipe` endpoint was fixed in v0.42.18 (PR #90) to delete
the Google Calendar before wiping tasks. However, the backup import path
(`POST /api/v1/backup/import`) calls `BackupService._clear_user_data()` which
does NOT clean up GCal events or sync records.

After a backup restore, DB-level CASCADE deletes the `GoogleCalendarEventSync` records
when tasks are deleted, but the actual Google Calendar events remain as permanent
orphans. These are invisible to subsequent syncs (no sync records reference them).

This is distinct from the wipe endpoint fix. The fix in v0.42.18 only covered
`import_data.py`, not `backup_service.py`.

**Fix:** Either call GCal cleanup in `_clear_user_data()` or call the fixed wipe
endpoint's logic before backup import.

---

### NF-5. Todoist import leaks `str(e)` to client (MEDIUM)

**Evidence:** `app/services/todoist_import.py:149` — `result.errors.append(str(e))`

The v0.42.16 fix (PR #88) sanitized `HTTPException` detail fields in `backup.py`,
`import_data.py`, and `passkeys.py`. But the Todoist import service collects raw
exception strings in the `errors` list, which flows through to the client via
`ImportResponse.errors` at `import_data.py:265`.

If the Todoist API returns an error, the full `httpx.HTTPStatusError` string
(including URL, status code, and response body) is sent to the client. If a DB
error occurs, the SQLAlchemy error message (including table/column names) is leaked.

**Fix:** Replace `result.errors.append(str(e))` with a generic message. The full
exception is already logged at line 148 via `logger.exception()`.

---

### NF-6. Backup import validation errors return HTTP 500 (LOW)

**Evidence:** `app/routers/backup.py:103-106`

Pydantic `ValidationError` from `BackupSchema(**data)` is caught by the generic
`except Exception` handler, which returns HTTP 500. Validation errors should return
HTTP 400 with helpful field-level messages. The user sees only "Import failed" with
no guidance on what's wrong with their backup file.

**Fix:** Catch `pydantic.ValidationError` (or a custom `BackupValidationError`)
before `except Exception`, return 400 with summarized validation messages.

---

### NF-7. `executeDeleteNow` undefined in drag-drop retry callback (LOW)

**Evidence:** `static/js/drag-drop.js:503`

```javascript
retry: () => executeDeleteNow(taskId)
```

The actual function is named `executeDelete` at line 472. If a task delete fails and
the user clicks "Retry" in the error toast, it will throw `ReferenceError: executeDeleteNow
is not defined`. This is a functional bug, not a security issue.

**Fix:** Change `executeDeleteNow` to `executeDelete`.

---

### NF-8. No double-click protection on completion gutter (LOW)

**Evidence:** `static/js/task-complete.js:54-76`

`handleGutterClick()` has no debounce, throttle, or disabled state. Rapid clicks fire
concurrent `toggle-complete` API calls. The optimistic UI update at line 95 provides
partial protection (second click reads toggled state), but very rapid clicks within
a single event loop tick can both read the same state.

Audit #4 assessed this as "Non-issue" because the server state is eventually correct.
I agree for security but note it causes UX issues: multiple toasts, animation
flickering, wasted network requests. Compare with `task-dialog.js` which properly
disables buttons during async operations (line 1351).

**Fix:** Add a module-level `processingIds` Set; skip clicks for IDs currently
being processed.

---

## Challenged "Safe" Claims

### Claim 1: "Concurrent Tab Behavior ✅" (Audit #3)

**Audit #3 said:** "No WebSocket/SSE/real-time sync. Two tabs operate independently
with last-write-wins semantics. Acceptable for a task app."

**My re-verification:** I partially disagree. Simple last-write-wins on task updates
is indeed acceptable. However, two specific concurrent access issues go beyond this:

1. **Materialization IntegrityError rollback scope** (`recurrence_service.py:179-186`):
   When a duplicate instance is detected, `db.rollback()` rolls back ALL pending
   instance creations in the session, not just the duplicate. If the background
   materialization and a user request both try to create instances, the IntegrityError
   handler loses all work for that user's session. They're recreated next cycle, but
   the scope of the rollback is unexpectedly broad.

2. **WebAuthn challenge non-atomic consume** (`challenge_service.py:44-63`):
   `get_and_consume_challenge()` reads the challenge, stores the value, then deletes
   the record. No `SELECT FOR UPDATE`. Two concurrent WebAuthn verifications could
   both read the same challenge. WebAuthn's built-in nonce checks provide additional
   protection, making exploitation very difficult, but the non-atomic pattern is a
   design weakness compared to the token refresh code which correctly uses
   `SELECT FOR UPDATE SKIP LOCKED` at `gcal.py:140`.

**Verdict:** The "safe" claim is **mostly correct** for typical usage. The materialization
rollback is a real (if self-healing) correctness issue. The challenge reuse is a
theoretical concern adequately mitigated by WebAuthn protocol design.

---

### Claim 2: "XSS / Template Injection ✅" (Audit #3)

**Audit #3 said:** "All user content properly escaped on output. Jinja2 auto-escaping
never disabled, JS consistently uses `escapeHtml()` or `textContent`."

**My re-verification:** I agree. I independently verified:

- All `innerHTML` assignments in JS that include user data use `escapeHtml()`:
  - `drag-drop.js:947` — `escapeHtml(content)` for task title
  - `drag-drop.js:1150` — `escapeHtml(content)` for date-only task title
  - `task-dialog.js:826` — `escapeHtml(d.name)` for domain dropdown
  - `wizard.js:802` — `escapeHtml(cal.summary)` for calendar list
- `task-swipe.js:383` uses `originalHTML` which is original server-rendered
  (Jinja2-escaped) content — safe.
- Zero `|safe` filters in templates (confirmed by grep)
- Zero `{% autoescape false %}` blocks

**Verdict:** The "safe" claim is **correct**. XSS protection is thorough.

---

### Claim 3: "Passkey / WebAuthn ✅" (Audit #3)

**Audit #3 said:** "PRF extension failure handled, credential IDs validated,
delete-last-passkey resets unlock method, register-before-encryption protected."

**My re-verification:** I partially disagree — the audit correctly verified the
listed scenarios, but did NOT examine challenge consumption atomicity. The
`get_and_consume_challenge()` pattern at `challenge_service.py:44-63` is a
read-then-delete without row-level locking (see Claim 1 above).

Additionally, the passkey deletion race condition noted in my Phase 1 investigation
(Finding #13 from state consistency agent) — two concurrent passkey deletions could
both read `count > 0` and neither would update the unlock method — was not examined.

**Verdict:** The "safe" claim is **mostly correct**. The scenarios tested are genuine
and well-handled. The untested concurrent access patterns are narrow edge cases with
low practical risk.

---

## Unexamined Areas

### Previously Unaudited Code

After reviewing all 4 prior audit scopes, I identified these areas that were never
explicitly examined:

1. **`app/services/labels.py`** — Label CRUD service. Not mentioned in any audit.
   I verified it follows the same `user_id` filtering pattern (confirmed by multitenancy
   coverage in audit #2 "28+ queries"). Low risk.

2. **`app/services/task_grouping.py`** and **`app/services/task_sorting.py`** — Task
   organization logic. Not mentioned in any audit. These are read-only query builders
   that always filter by user_id via the calling service. No mutation, no external
   input. Zero risk.

3. **`app/utils/timing.py`** — Timing utility. Infra code, no user input. Zero risk.

4. **`app/metrics.py`** — Prometheus metrics. Exposes request counts and durations.
   Uses static SQL (`SELECT COUNT(*)`) for one metric. No user input. Zero risk.

5. **`TaskContentData` / `DomainContentData` batch update validation** — These Pydantic
   models at `tasks.py:377-383` and `domains.py:179-183` have NO field-level validation
   (no max_length, no control char stripping). Audit #4 added list size limits
   (`max_length=5000`) but did not add validation to individual items. This is
   **intentional** — the endpoint is used for encryption toggle, where ciphertext
   content must pass through without being validated as plaintext. But it means an
   attacker could send a 10MB title string per item (5000 items x 10MB = 50GB
   theoretical payload, though Starlette body limits would cap this). **LOW risk**
   due to rate limiting and authentication.

### Flows That Were Covered But Deserve Deeper Examination

1. **Recurrence rule → rrule() execution** — The backlog notes "recurrence_rule
   validation" as deferred. The `rrule()` call at `recurrence_service.py:116` passes
   `**kwargs` built from defensively extracted keys. However, `interval: 0` would cause
   `rrule` to raise `ValueError`, and `interval: -1` causes unpredictable behavior.
   The error would be caught by the background task's per-user try/except, so no crash,
   but the user's task would silently generate zero instances. This is correctly
   documented in the backlog.

2. **Google Calendar event data from user input** — Task titles and descriptions flow
   into GCal event `summary` and `description` fields at `gcal.py:488-492`. Google's
   API handles its own sanitization, so this is safe, but extremely long titles (up to
   the 500-char validated limit) could cause truncation in Google Calendar UI.

---

## Summary: All Findings Classified

### NEW (not fixed, not in backlog)

| # | Severity | Finding | Evidence |
|---|----------|---------|----------|
| NF-2 | MEDIUM | `BackupTaskSchema.status` accepts any string | `backup_service.py:55` |
| NF-3 | MEDIUM | Archived task instances appear in calendar views | `recurrence_service.py:219-236` |
| NF-4 | MEDIUM | Backup import doesn't clean GCal events | `backup_service.py:325-333` |
| NF-6 | LOW | Backup validation error returns 500 not 400 | `backup.py:103-106` |
| NF-8 | LOW | No double-click protection on completion gutter | `task-complete.js:54-76` |

### KNOWN (in backlog or related to backlog items)

| Finding | Backlog Item |
|---------|-------------|
| `recurrence_rule: dict` accepts arbitrary JSON | "recurrence_rule validation" |
| GCal fire-and-forget creates duplicate events | "Fire-and-forget bypasses per-user lock" |
| Bulk sync orphans new tasks' GCal records | "Orphan event scenarios" |
| Partial encryption batch leaves mixed state | By design (encryption toggle flow) |
| `scheduled_time` timezone issue | "Timezone on scheduled_time" |
| CSP `unsafe-inline` | "Nonce-based CSP" |
| No offline write queue | "Offline write queue" |
| 11/18 offline mutation paths unchecked | "Offline checks on secondary mutation paths" |

### VERIFIED (already fixed in code)

| Finding | Fix |
|---------|-----|
| Rate limiting on destructive endpoints | v0.42.11 (PR #83) |
| Backup import file size limit | v0.42.12 (PR #84) |
| Session clear before login | v0.42.13 (PR #85) |
| Offline checks on primary mutations | v0.42.10, v0.42.14 |
| Exception messages in HTTP responses | v0.42.16 (PR #88) |
| CDN scripts in CSP | v0.42.17 (PR #89) |
| GCal events orphaned on data wipe | v0.42.18 (PR #90) |
| Input validation (impact, duration, etc.) | v0.42.19 (PR #91) |
| HTMX CSRF protection | v0.42.20 (PR #92) |
| Subtask hierarchy in backup | v0.42.21 (PR #93) |
| `TaskUpdate.clarity` missing enum validation (NF-1) | v0.42.22 (PR #94) |
| Todoist import leaks `str(e)` to client (NF-5) | v0.42.22 (PR #94) |
| `executeDeleteNow` undefined in retry callback (NF-7) | v0.42.22 (PR #94) |

---

## Ship Verdict

### SHIP WITH CAVEATS

The application is ready to ship for v1.0. The security foundations are solid: multitenancy
is consistently enforced across all 28+ queries, CSRF protection covers all state-changing
endpoints, XSS prevention is thorough (Jinja2 autoescaping + JS `escapeHtml()`), session
security is properly configured, and SQL injection is not possible (all queries use
SQLAlchemy ORM parameterization). Four rounds of progressive audits have systematically
identified and fixed issues from rate limiting gaps to exception message leakage.

The remaining 2 MEDIUM findings (NF-2 through NF-4) are all **defense-in-depth input
validation gaps or data consistency issues** — none are exploitable for unauthorized access,
data theft, or privilege escalation. Specifically:

- **NF-2** (status validation): The client always sends valid values. Exploitation requires
  direct API manipulation and produces incorrect task metadata, not unauthorized access.
- **NF-3** (archived instances): A correctness bug where archived recurring tasks' instances
  still appear — annoying but not a data leak or security issue.
- **NF-4** (backup import GCal orphans): Google Calendar events become orphaned — a UX
  nuisance, not a security or data loss issue. Users can delete the Whendoist calendar
  from Google Calendar settings.

**Pre-ship fixes applied** in v0.42.22 (PR #94):
1. NF-1: Added `clarity` validator to `TaskUpdate` matching `TaskCreate`
2. NF-5: Sanitized `todoist_import.py:149` error message (generic message, full exception logged)
3. NF-7: Fixed `executeDeleteNow` → `executeDelete` typo in drag-drop retry callback

**Recommended post-ship fixes** (next patch):
4. NF-2: Add `status` validation to `BackupTaskSchema`
5. NF-3: Filter archived tasks from instance queries
6. NF-4: Add GCal cleanup to backup import path
7. NF-6: Return 400 for backup validation errors
8. NF-8: Add debounce to completion gutter
