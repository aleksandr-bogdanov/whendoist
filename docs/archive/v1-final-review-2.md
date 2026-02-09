# V1.0 Final Ship Readiness Review — Final 2

**Date:** 2026-02-09
**Version Under Review:** 0.42.22
**Audit Pass:** 7th (prior: recurring-task, gcal-sync, pwa-offline, gate-audit-2, gate-audit-3, gate-audit-4, final-review)
**Methodology:** Inverted (schema-first, error-handler-first, background-task-first, JS-event-first, cross-module-first)

---

## Methodology Notes

Prior audits consistently found 5–8 new issues each. This review deliberately inverted the standard API-first methodology:

- **Phase 1A (Schema):** Started from DB columns and constraints, not API endpoints
- **Phase 1B (Error Handlers):** Started from `except` blocks and error responses, not happy paths
- **Phase 1C (Background Tasks):** Started from `asyncio.create_task` and background loops, not request handlers
- **Phase 1D (JS Events):** Started from DOM event handlers and user interactions, not `safeFetch` calls
- **Phase 1E (Cross-Module):** Started from assumptions one module makes about another's guarantees

Phases 1–2 were conducted blind (no prior audit docs read). Phase 3 cross-referenced all findings.

---

## Phase 1: Findings

### F-1. domain_id IDOR — Cross-Tenant Domain Name Leakage

**Severity: HIGH**
**Files:** `app/services/task_service.py:265`, `app/services/task_service.py:299`, `app/routers/tasks.py:469,532`

`create_task()` accepts `domain_id` from the request and writes it to the Task row without verifying that the domain belongs to the authenticated user:

```python
# task_service.py:265 — domain_id used directly, no ownership check
task = Task(user_id=self.user_id, domain_id=domain_id, ...)
```

The `update_task()` method (line 296–322) also includes `domain_id` in `UPDATABLE_FIELDS` and sets it via `setattr` with no ownership check.

**Impact:** An attacker with a valid account can:
1. `POST /api/v1/tasks {"title":"probe", "domain_id": 50}` — associates their task with victim's domain ID
2. `GET /api/v1/tasks/{id}` — response includes `domain_name` from `_task_to_response()` line 308: `task.domain.name if task.domain else None`
3. Iterate domain IDs 1–N to enumerate all domain names across all users

Domain names may contain sensitive information ("Medical Records", "Job Search", etc.). When encryption is disabled, names are plaintext. When enabled, the ciphertext is still returned, confirming domain existence.

**Classification: NEW** — Audit #4 verified `parent_id` IDOR but omitted `domain_id`.

---

### F-2. Batch Update Dirty Session — No Rollback After Exception

**Severity: HIGH**
**Files:** `app/routers/tasks.py:781`, `app/routers/domains.py:220–222`

Both batch update endpoints (`/tasks/batch-update`, `/domains/batch-update`) catch exceptions in a loop and continue, but never rollback:

```python
# tasks.py:781
except Exception as e:
    errors.append({"id": item.id, "error": str(e)})  # str(e) leaks internals
    logger.warning(f"Failed to update task {item.id}: {e}")
# Loop continues, then line 787: await db.commit()
```

After a SQLAlchemy exception (e.g., IntegrityError), the session is in an invalid state. The subsequent `db.commit()` either:
- Commits partially-applied changes from the failed operation
- Raises another error, potentially leaving all remaining items unprocessed

Additionally, `str(e)` in the error response leaks internal exception messages (SQL errors, column names, constraint names).

**Classification: NEW** — Final Review noted partial encryption batch commits but not the missing rollback.

---

### F-3. Backup Import Accepts Invalid Status/Clarity/Impact Values

**Severity: MEDIUM**
**Files:** `app/services/backup_service.py:55–57`

`BackupTaskSchema` accepts arbitrary values for `status`, `clarity`, and `impact`:

```python
status: str = "pending"      # No validator — accepts "HACKED", "XSS<script>"
clarity: str | None = None   # No validator — accepts anything
impact: int | None = None    # No range check — accepts 999, -1, etc.
```

No DB CHECK constraints exist either (`app/models.py:293–311`). Tasks with invalid status become "ghost" rows — invisible in all views because `get_tasks()` filters by exact status match.

**Classification: KNOWN-UNFIXED** — Final Review NF-2 identified this. CHANGELOG shows no fix applied.

---

### F-4. No CHECK Constraints on Status/Clarity/Impact Columns

**Severity: MEDIUM**
**Files:** `app/models.py:293` (Task.status), `app/models.py:295` (Task.clarity), `app/models.py:296` (Task.impact), `app/models.py:363` (TaskInstance.status)

The database schema has no CHECK constraints for any enum-like columns. Pydantic validation at the API layer is the only defense, and it does not cover all entry points (backup import, Todoist import, direct DB operations).

The only CheckConstraint in the entire schema is on `GoogleCalendarEventSync` (line 471).

**Classification: NEW** — No prior audit discussed DB-level constraints.

---

### F-5. Information Leakage in /ready Endpoint

**Severity: MEDIUM**
**Files:** `app/main.py:227`

```python
checks["database"] = f"error: {e}"  # Exposes DB error message in JSON response
```

The `/ready` endpoint returns database error details (connection strings, timeout messages, etc.) in the response body. This endpoint is unauthenticated and not CSRF-protected.

**Classification: NEW** — Audit #3 M1 sanitized 5 endpoints but missed `/ready`.

---

### F-6. Recurrence Service Rollback Destroys Prior Unflushed Work

**Severity: MEDIUM**
**Files:** `app/services/recurrence_service.py:182–184`, `app/services/recurrence_service.py:490–492`

```python
except IntegrityError:
    await self.db.rollback()  # Full session rollback, not savepoint
    return existing_instance
```

When a duplicate instance triggers IntegrityError, the full `db.rollback()` destroys ALL pending (unflushed) changes in the session, not just the failed insert. In `materialize_instances()`, this could discard instances created earlier in the same loop iteration.

**Classification: KNOWN-UNFIXED** — Final Review Phase 1 finding #16. Described as "self-healing" but not fixed.

---

### F-7. _instance_to_response Null Task Assumption

**Severity: MEDIUM**
**Files:** `app/routers/instances.py:56`

```python
instance.task.title  # AttributeError if instance.task is None
```

`_instance_to_response()` accesses `instance.task.title` without checking for None. If the parent task is deleted (via cascade or race condition), this raises an unhandled `AttributeError` → 500 error.

**Classification: NEW**

---

### F-8. Missing user_id Filter in Fire-and-Forget GCal Sync

**Severity: LOW** (defense-in-depth)
**Files:** `app/routers/tasks.py:89`

```python
result = await db.execute(sa_select(TaskInstance).where(TaskInstance.id == instance_id))
# Missing: TaskInstance.user_id == user_id
```

The `instance_id` comes from server-side logic (line 704), not user input, so this isn't directly exploitable. But it violates the multitenancy invariant that all queries filter by `user_id`.

**Classification: NEW** — Audit #2 claimed "28+ queries verified, all filter by user_id."

---

### F-9. GCal Unsync Deletes DB Records Despite API Failure

**Severity: MEDIUM**
**Files:** `app/services/gcal_sync.py:411–414`, `app/services/gcal_sync.py:434–438`

When Google API deletion fails (timeout, 5xx, etc.), the except block logs a warning but falls through to `await self.db.delete(sync_record)` and `await self.db.flush()`. This creates orphaned Google Calendar events that can never be cleaned up.

**Classification: KNOWN-ACCEPTED** — Post-v1.0 backlog lists "Orphan event scenarios."

---

### F-10. No Debouncing on Task Completion Gutter Clicks

**Severity: LOW**
**Files:** `static/js/task-complete.js`

Rapid clicks on the completion gutter fire multiple `POST /api/v1/tasks/{id}/toggle` requests. Without debouncing, this can rapidly toggle completion status and generate multiple GCal sync fire-and-forget tasks.

**Classification: KNOWN-UNFIXED** — Final Review NF-8.

---

### F-11. Keyboard/Mobile Delete Has No Undo

**Severity: LOW**
**Files:** `static/js/shortcuts.js`, `static/js/task-swipe.js`

Keyboard shortcut delete and mobile sheet delete paths use `safeFetch` DELETE with no undo mechanism beyond the toast notification.

**Classification: KNOWN-ACCEPTED** — Full undo is v1.1 per backlog.

---

### F-12. recurrence_rule Accepts Arbitrary Dict

**Severity: LOW**
**Files:** `app/models.py:306`, `app/routers/tasks.py:143,196`

```python
recurrence_rule: dict | None = None  # No schema validation
```

Any JSON object is accepted. Missing `freq` key causes KeyError in `generate_occurrences()` at `recurrence_service.py:79`. Invalid values produce empty occurrence lists (no corruption, but silent failure).

**Classification: KNOWN-ACCEPTED** — Deferred per Audit #2.

---

### F-13. parent_id Allows Circular References

**Severity: LOW**
**Files:** `app/services/task_service.py:296–322`, `app/services/task_service.py:373–387`

Two sequential `PUT` requests can create a cycle: Task A → parent B, Task B → parent A. The `_archive_subtasks()` and `_restore_subtasks()` recursive functions would infinite-loop on circular references.

**Classification: NEW** — Audit #4 assessed this as "Moot" because parent_id wasn't imported, but v0.42.21 added parent_id import, and API updates have always allowed it.

---

### F-14. Domain.color Has No Hex Validation

**Severity: LOW**
**Files:** `app/models.py:250`

```python
color: Mapped[str | None] = mapped_column(String(7), nullable=True)  # hex color
```

No validation at Pydantic or DB level. String(7) limits length but doesn't enforce `#RRGGBB` format. XSS risk is mitigated by Jinja2 auto-escaping.

**Classification: NEW**

---

### F-15. asyncio.create_task References May Be Garbage Collected

**Severity: LOW**
**Files:** `app/routers/tasks.py:498–717` (12 `asyncio.create_task` calls)

Fire-and-forget tasks created with `asyncio.create_task()` without storing the returned Task object. Per Python docs, the event loop only holds a weak reference — if no strong reference exists, the task may be garbage collected before completion.

The materialization background task at `app/tasks/recurring.py:188–194` correctly stores the reference in `_materialization_task`.

**Classification: PARTIALLY-NEW** — Audit #4 verified the materialization loop but not fire-and-forget tasks.

---

### F-16. Crypto Key Stored with extractable: true

**Severity: LOW**
**Files:** `static/js/crypto.js:64`

```js
true, // extractable for storage
```

Intentional — key is exported to base64 for localStorage persistence. But means any XSS can extract the key via `crypto.subtle.exportKey()`.

**Classification: NEW**

---

### F-17. decryptField Silently Returns Original Value on Failure

**Severity: LOW**
**Files:** `static/js/crypto.js:351–356`

If decryption fails (wrong key, corrupted data), `decryptField` returns the original ciphertext without error indication. The user sees garbled base64 text with no hint that decryption failed.

**Classification: NEW**

---

### F-18. window.Crypto Export Shadows Native Constructor

**Severity: LOW**
**Files:** `static/js/crypto.js:488`

```js
window.Crypto = Crypto;  // Shadows native window.Crypto constructor
```

Does not break `window.crypto.subtle` (lowercase) but could confuse `instanceof` checks.

**Classification: NEW**

---

### F-19. Route Overlap — GET /api/v1/tasks Conflict

**Severity: MEDIUM**
**Files:** `app/routers/api.py:28,128`, `app/main.py:276,279`

`api.py` registers `GET /api/v1/tasks` (Todoist tasks) and is included before the v1 router (line 276 vs 279 in main.py). The native tasks `GET /api/v1/tasks` from `tasks.py` is shadowed and unreachable via direct GET without query parameters.

In practice, the native endpoint at `tasks.py:349` uses `@router.get("")` which becomes `/api/v1/tasks`, identical to `api.py:128`. FastAPI resolves first-registered route, so the Todoist endpoint wins.

**Classification: NEW** — Audit #3 stated "No unregistered or dangling routes" — incorrect.

---

## Phase 2: Adversarial Attack Scenarios

### Scenario 1: Cross-Tenant Domain Name Enumeration

**Goal:** Read other users' domain names
**Severity: HIGH**

1. `POST /api/v1/tasks {"title":"probe","domain_id":1}` — create task with victim's domain ID
2. `GET /api/v1/tasks/{new_id}` — response includes `domain_name: "Medical Records"`
3. Repeat with `domain_id` 2, 3, 4... to enumerate all domains

**Code path:** `tasks.py:469` → `task_service.py:265` (no ownership check) → DB FK passes (domain exists) → `_task_to_response:308` loads `task.domain.name`

---

### Scenario 2: Ghost Task Injection via Backup Import

**Goal:** Create invisible, undeletable tasks
**Severity: MEDIUM**

1. Craft backup with `"status": "phantom"`, `"impact": 999`
2. `POST /api/v1/backup/import` with the malicious JSON
3. Tasks are created in DB but never appear in any view (`get_tasks()` filters by exact status)
4. User cannot see or delete these tasks through the UI

**Code path:** `backup.py:92` → `backup_service.py:216` (validates title/description only) → `backup_service.py:256` (writes `status="phantom"` to DB) → `task_service.py:174` (WHERE status="pending" — ghost task invisible)

---

### Scenario 3: Batch Update Error Leakage + Session Corruption

**Goal:** Extract internal error messages and corrupt batch operations
**Severity: HIGH (compound)**

1. Enable encryption on account
2. `POST /api/v1/tasks/batch-update` with 100 tasks, task #50 has a title that triggers a constraint violation
3. Tasks 1–49 committed, task #50 throws exception → `str(e)` returned in response (leaks SQL details)
4. Session is dirty — tasks 51–100 may silently fail or commit partial state
5. The `errors` array in the response exposes `IntegrityError` messages with column names and constraint names

**Code path:** `tasks.py:764–787` → exception at #50 → `str(e)` captured at line 783 → no `db.rollback()` → loop continues with dirty session → final `db.commit()` at line 787 operates on invalid session state

---

### Scenario 4: Circular Parent Chain → Infinite Loop on Archive

**Goal:** Lock a user's task archival
**Severity: MEDIUM**

1. Create Task A and Task B
2. `PUT /api/v1/tasks/{A} {"parent_id": B_id}`
3. `PUT /api/v1/tasks/{B} {"parent_id": A_id}`
4. Archive Task A → `_archive_subtasks()` recurses: A → B → A → B → ... → stack overflow or timeout
5. The archive request hangs until the 30-second statement timeout kills it

**Code path:** `tasks.py:600–625` → `task_service.py:353–387` → `_archive_subtasks()` recursive call with no cycle detection → infinite recursion

---

### Scenario 5: GCal Event Orphaning via Wipe-During-Sync Race

**Goal:** Leave orphaned events in victim's Google Calendar
**Severity: MEDIUM**

1. User starts a bulk GCal sync (dozens of tasks being synced)
2. Simultaneously, user triggers `/import/wipe` to delete all data
3. Wipe deletes tasks and GCal sync records from DB
4. In-flight fire-and-forget sync tasks continue creating Google Calendar events
5. Events are created in Google Calendar but their sync records are gone — can never be cleaned up

**Code path:** Wipe at `import_data.py:118–136` deletes tasks + GCal event sync records → concurrent fire-and-forget at `tasks.py:38–57` still running with stale task data → `gcal_sync.py` creates events in Google → sync record already deleted → orphaned events

---

## Phase 3: Cross-Reference Classification Table

| # | Severity | Finding | Classification | Prior Audit Reference |
|---|----------|---------|----------------|----------------------|
| F-1 | HIGH | domain_id IDOR | **NEW** | Audit #4 checked parent_id only |
| F-2 | HIGH | Batch update dirty session | **NEW** | Final Review noted partial commits, not rollback gap |
| F-3 | MEDIUM | Backup accepts invalid status/clarity/impact | **KNOWN-UNFIXED** | Final Review NF-2 |
| F-4 | MEDIUM | No DB CHECK constraints | **NEW** | — |
| F-5 | MEDIUM | /ready leaks DB errors | **NEW** | Audit #3 M1 missed this endpoint |
| F-6 | MEDIUM | Recurrence rollback scope | **KNOWN-UNFIXED** | Final Review Phase 1 #16 |
| F-7 | MEDIUM | _instance_to_response null assumption | **NEW** | — |
| F-8 | LOW | Missing user_id in fire-and-forget | **NEW** | Audit #2 "28+ queries" missed this |
| F-9 | MEDIUM | GCal unsync orphans events | **KNOWN-ACCEPTED** | Post-v1.0 backlog |
| F-10 | LOW | No completion debounce | **KNOWN-UNFIXED** | Final Review NF-8 |
| F-11 | LOW | No undo on keyboard/mobile delete | **KNOWN-ACCEPTED** | v1.1 backlog |
| F-12 | LOW | recurrence_rule arbitrary dict | **KNOWN-ACCEPTED** | Audit #2 deferred |
| F-13 | LOW | parent_id circular references | **NEW** | Audit #4 "Moot" — now stale |
| F-14 | LOW | Domain.color no hex validation | **NEW** | — |
| F-15 | LOW | asyncio.create_task GC risk | **PARTIALLY-NEW** | Audit #4 covered materialization only |
| F-16 | LOW | Crypto key extractable: true | **NEW** | — |
| F-17 | LOW | decryptField silent failure | **NEW** | — |
| F-18 | LOW | window.Crypto shadows native | **NEW** | — |
| F-19 | MEDIUM | Route overlap GET /api/v1/tasks | **NEW** | Audit #3 "no dangling routes" — wrong |

### Additional Findings from Prior Audit Cross-Reference

| # | Severity | Finding | Classification |
|---|----------|---------|----------------|
| F-20 | MEDIUM | Backup import doesn't clean GCal events | **KNOWN-UNFIXED** (Final Review NF-4) |
| F-21 | LOW | Backup validation errors return 500 not 400 | **KNOWN-UNFIXED** (Final Review NF-6) |
| F-22 | MEDIUM | Archived task instances appear in calendar | **KNOWN-UNFIXED** (Final Review NF-3) |

---

## Phase 3: Challenged Claims

### Challenge 1: Audit #4 — "IDOR (Beyond user_id) — Verified Safe"

**Claim:** "All ID-based endpoints use single-query ownership checks... Parent_id validation on subtask creation: `get_task(parent_id)` validates ownership."

**Verification: INCORRECT for domain_id.** The audit checked `parent_id` but completely omitted `domain_id`. `create_task()` at `task_service.py:265` and `update_task()` at line 299 both accept `domain_id` without ownership verification. A user can associate their task with another user's domain, causing the victim's domain name to leak through the task response.

---

### Challenge 2: Audit #2 — "P3. Multitenancy bulletproof — 28+ queries verified"

**Claim:** "28+ queries verified, all filter by user_id. No cross-tenant leaks."

**Verification: OVERSTATED.** At `tasks.py:89`, the fire-and-forget instance sync queries `TaskInstance` by ID only, without `user_id` filter. The domain_id IDOR (F-1) also demonstrates that cross-resource ownership is not verified on foreign keys, even though same-table user_id filtering is consistent.

---

### Challenge 3: Audit #4 — "No circular parent_id detection on import — Moot"

**Claim:** "Moot. parent_id isn't imported. Even if it were, _archive_subtasks only recurses via parent_id FK which can't form cycles."

**Verification: INCORRECT.** PR #93 (v0.42.21) added `parent_id` to backup import. More critically, the API `update_task()` has always allowed setting arbitrary `parent_id` values. Two sequential PUT requests can create A→B→A cycle. `_archive_subtasks()` at `task_service.py:373–387` and `_restore_subtasks()` at `task_service.py:403–418` would infinite-loop on circular references. The claim that "cycles can't form" was wrong at the time of writing and is doubly wrong now.

---

## Summary

| Category | Count |
|----------|-------|
| NEW findings | 12 |
| KNOWN-UNFIXED | 5 |
| KNOWN-ACCEPTED | 3 |
| PARTIALLY-NEW | 2 |
| **Total** | **22** |

| Severity | Count |
|----------|-------|
| HIGH | 2 |
| MEDIUM | 10 |
| LOW | 10 |

---

## Ship Verdict: CONDITIONAL SHIP

**Must-fix before v1.0 (2 items):**

1. **F-1: domain_id IDOR** — Add ownership verification in `create_task()` and `update_task()`. ~10 lines of code.
2. **F-2: Batch update rollback** — Add `await db.rollback()` in the except block and sanitize `str(e)` before returning. ~5 lines of code.

**Should-fix before v1.0 (3 items):**

3. **F-5: /ready info leakage** — Replace `f"error: {e}"` with generic `"error"`. 1 line.
4. **F-3: Backup status/clarity/impact validation** — Add `@field_validator` to `BackupTaskSchema`. ~15 lines.
5. **F-13: Circular parent_id** — Add cycle detection in `update_task()` or cap recursion depth in `_archive_subtasks()`. ~10 lines.

**Post-v1.0 backlog (remaining 17 items):** LOW severity items and KNOWN-ACCEPTED findings. None are security-critical or data-integrity risks that block shipping.

The two HIGH findings (F-1, F-2) are both straightforward fixes with minimal blast radius. Once addressed, the application is ship-ready.
