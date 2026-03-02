---
created: 2026-03-02
type: investigation
---

# Task Activity Log — Investigation

Research-only investigation into adding a task activity log to Whendoist.
No implementation — findings, options, open questions, and recommendation.

---

## Findings

### 1. Mutation Points (21 total)

Every place where a task, instance, or domain is created/updated/deleted:

| # | Endpoint | Method | File | What mutates |
|---|----------|--------|------|-------------|
| 1 | `/tasks` | POST | tasks.py:526 | Create task, materialize instances if recurring, GCal sync |
| 2 | `/tasks/{id}` | PUT | tasks.py:586 | Update fields, regenerate instances if recurrence changed |
| 3 | `/tasks/{id}` | DELETE | tasks.py:686 | Archive (soft delete), unsync GCal |
| 4 | `/tasks/{id}/restore` | POST | tasks.py:703 | Restore archived → pending |
| 5 | `/tasks/{id}/complete` | POST | tasks.py:760 | Set completed_at |
| 6 | `/tasks/{id}/uncomplete` | POST | tasks.py:788 | Clear completed status |
| 7 | `/tasks/{id}/toggle-complete` | POST | tasks.py:816 | Toggle + cascade to instances/subtasks |
| 8 | `/tasks/batch-update` | POST | tasks.py:895 | Batch update titles/descriptions (encryption toggle), up to 5000 |
| 9 | `/instances/{id}/complete` | POST | instances.py:179 | Complete instance |
| 10 | `/instances/{id}/uncomplete` | POST | instances.py:197 | Uncomplete instance |
| 11 | `/instances/{id}/toggle-complete` | POST | instances.py:215 | Toggle instance completion |
| 12 | `/instances/{id}/skip` | POST | instances.py:237 | Skip instance |
| 13 | `/instances/{id}/unskip` | POST | instances.py:349 | Unskip instance |
| 14 | `/instances/{id}/schedule` | PUT | instances.py:256 | Reschedule instance |
| 15 | `/instances/batch-complete` | POST | instances.py:293 | Complete all pending before date |
| 16 | `/instances/batch-past` | POST | instances.py:325 | Complete or skip all past pending |
| 17 | `/import/wipe` | POST | import_data.py:79 | Delete ALL user data |
| 18 | `/import/todoist` | POST | import_data.py:212 | Import tasks from Todoist |
| 19 | `/domains` | POST | domains.py:158 | Create domain |
| 20 | `/domains/{id}` | PUT | domains.py:175 | Update domain |
| 21 | `/domains/{id}` | DELETE | domains.py:197 | Archive domain |

**Key pattern:** All mutations flow through `TaskService` or `RecurrenceService` — routers never execute SQL directly. Every mutation calls `bump_data_version(db, user_id)` before commit.

### 2. Service Layer Architecture

```
FastAPI Endpoint (router)
  └── TaskService(db, user.id) or RecurrenceService(db, user.id)
        ├── Fetch + validate ownership
        ├── Mutate ORM objects
        ├── db.flush()
        ├── bump_data_version(db, user_id)  ← called by EVERY mutation
        └── return modified object
  └── Router calls db.commit()
  └── Fire-and-forget GCal sync
```

**Centralized service layer: YES.** `TaskService` handles all task/domain mutations. `RecurrenceService` handles instance mutations. This is the natural interception point for activity logging.

**Exception:** `batch_update_tasks` bypasses TaskService for performance — mutates ORM objects directly in the router, commits every 25 items.

### 3. Existing Audit Trails

**None.** There is no activity log, audit trail, or change history in the codebase.

**What exists:**
- `created_at` (DateTime) — on Task, TaskInstance, Domain, User
- `updated_at` (DateTime, auto-updated) — on Task, Domain
- `completed_at` (DateTime, nullable) — on Task, TaskInstance
- `User.data_version` (Integer) — monotonic counter bumped on every mutation, used for snapshot optimization only
- Snapshots: point-in-time full JSON exports (gzip-compressed), NOT change deltas. Content-hash deduplicated. Cannot answer "what changed."

**Not found:** No `audit_log` table, no SQLAlchemy event listeners, no field-level change tracking, no `changed_by` attribution.

### 4. Encryption Impact

**Architecture:** Client-side E2EE (AES-256-GCM). Server stores and returns ciphertext. Server never decrypts.

**Encrypted fields:** `Task.title`, `Task.description`, `Domain.name` — stored as ciphertext when `user.encryption_enabled = true`.

**Problem for activity logging:**

| Scenario | What gets logged |
|----------|-----------------|
| "Title changed from X to Y" | Ciphertext → `"a9kQ8x..." → "7mL4pQ..."` (meaningless) |
| "Task completed" | Status change only — no encrypted data needed (safe) |
| "Task archived" | Status change only (safe) |
| "Domain changed to X" | Ciphertext domain name (meaningless) |

**How other features handle this:**
- **Analytics:** Returns ciphertext titles as-is → client decrypts before display
- **Snapshots:** Stores ciphertext as-is → client decrypts on restore
- **Pattern:** Server stores opaque data; client handles decryption

**Implication:** Activity log entries that reference content fields (title, description, domain name) must either:
1. Store ciphertext and let the client decrypt (follows existing pattern)
2. Store only event type + timestamp without content values (simpler, no encryption concern)
3. Log content server-side in plaintext (violates E2EE — not acceptable)

### 5. Database Growth Estimate

**Typical user activity per day:**
- 5–15 task creates
- 10–30 completions/uncompletes
- 5–20 field updates (reschedule, priority, domain, etc.)
- 2–5 archives/restores
- ~1 batch past-instances operation (auto-completing yesterday's items)

**Estimate: 25–70 activity records/day per active user.**

At 50 records/day × 365 days = ~18,000 records/user/year. Each record ~200 bytes = ~3.5 MB/user/year. Manageable for indefinite storage.

**Batch operations are the outlier:**
- Encryption toggle: 5000 task updates + 500 domain updates = 5,500 records in one request
- Batch past instances: unbounded (could be hundreds)

### 6. Frontend Display

**TaskInspector** (`task-inspector.tsx`, 450 lines): Desktop right-pane editor for thought triage.

```
Header (close button)
├── Scrollable Body (flex-1, overflow-y-auto)
│   ├── Title textarea
│   ├── Domain, Parent, Impact, Schedule, Duration, Time, Repeat, Clarity, Notes
│   └── (each as FieldRow component)
└── Footer (Delete + Convert buttons)
```

**TaskDetailPanel** (`task-detail-panel.tsx`, 257 lines): Dashboard task editor. Similar structure. Has a metadata section showing `Created` and `Completed` timestamps at the bottom.

**Available UI primitives:**
- Radix `Tabs` component with `default` (pill) and `line` (underline) variants
- `FieldRow` pattern for labeled content rows
- Both panels use scrollable body with fixed header/footer

**Best placement:** Tab-based approach — add "Activity" tab alongside the current fields in either inspector.

### 7. Batch Operations

| Operation | Max size | Commit pattern | Activity log impact |
|-----------|----------|---------------|-------------------|
| Task encryption toggle | 5,000 | Every 25 items | 5,000 records (problematic) |
| Domain encryption toggle | 500 | Per item | 500 records (manageable) |
| Complete instances (per task) | Unbounded | Single flush | Variable |
| Complete/skip past instances | Unbounded | Single flush | Variable |

All batch operations use loop-based per-item processing — they already iterate individually. Adding per-item logging is architecturally possible but the volume of encryption toggles is concerning.

---

## Options

### Option A: Event-only log (no content values)

Log the event type and timestamp, but never store old/new field values.

```
| id | task_id | user_id | event_type       | timestamp           | metadata (JSON) |
|----|---------|---------|------------------|---------------------|-----------------|
| 1  | 42      | 7       | task_created     | 2026-03-02 10:00:00 | {}              |
| 2  | 42      | 7       | task_completed   | 2026-03-02 14:30:00 | {}              |
| 3  | 42      | 7       | task_rescheduled | 2026-03-02 15:00:00 | {"from": "2026-03-02", "to": "2026-03-05"} |
```

**Pros:** No encryption concern (never logs titles/descriptions). Simple schema. Small records.
**Cons:** Can't show "title changed from X to Y." Limited usefulness for debugging.

### Option B: Content-aware log with client decryption

Store old/new values (including ciphertext for encrypted fields). Client decrypts when displaying.

```
| id | task_id | event_type    | field    | old_value     | new_value     |
|----|---------|---------------|----------|---------------|---------------|
| 1  | 42      | field_changed | title    | <ciphertext>  | <ciphertext>  |
| 2  | 42      | field_changed | priority | 3             | 5             |
```

**Pros:** Full change history. Follows existing pattern (analytics/snapshots store ciphertext too). Field-level granularity.
**Cons:** Larger records. Client must decrypt activity entries. Old values become undecryptable if user changes encryption key (same problem snapshots have).

### Option C: Hybrid — events + non-encrypted metadata

Log all events. Include old/new values only for non-encrypted fields (dates, priority, status, domain_id). Skip content diffs for encrypted fields.

**Pros:** Best of both worlds. No encryption complexity for most fields. Still shows meaningful history.
**Cons:** Inconsistent — some fields show diffs, others don't. Users may wonder why title changes aren't shown.

### Option D: No server-side log — derive from snapshots

Don't create a new table. Diff consecutive snapshots to reconstruct activity.

**Pros:** Zero new infrastructure. Already have daily snapshots.
**Cons:** Only daily granularity (not per-action). Snapshots are gzip blobs — diffing is expensive. Can't show "who did what at 2:30 PM." Not viable for real-time display.

---

## Open Questions

1. **What's the primary use case?** User curiosity ("when did I complete this?"), debugging ("why is this task in the wrong domain?"), or accountability ("who changed this")?
   - Single-user app → no "who" dimension. Likely curiosity + debugging.

2. **Should batch encryption toggles generate activity records?** 5,000 "title_updated" records for a single encryption toggle seems like noise. Options:
   - Skip activity logging for encryption batch operations entirely
   - Log a single "encryption_enabled" / "encryption_disabled" event on the user
   - Log per-item but with a `batch_id` to group and collapse in UI

3. **Retention policy?** 18K records/user/year is small. But if we add content values (Option B), ciphertext strings are ~1.4x larger. Should we prune after N months, or keep forever?

4. **Where to hook in?** Two candidate interception points:
   - **TaskService methods** — wrap each method with before/after state capture. Clean but requires modifying every method.
   - **`bump_data_version()` wrapper** — single interception point, but lacks context about what changed.
   - **SQLAlchemy session events** (`after_flush`) — automatic, captures all changes, but harder to control (catches internal operations too).

5. **Should instance events appear on the parent task's activity log?** E.g., "Instance for Mar 5 completed" — shown on the recurring task's log? Or only on the instance?

6. **Mobile display?** TaskInspector is desktop-only. Where does activity show on mobile? Bottom sheet? Separate screen?

7. **Real-time or lazy?** Should the activity log update live (WebSocket/polling) or only refresh on navigation?

---

## Recommendation

**Option C (Hybrid) is the best fit for Whendoist.**

### Why

1. **Encryption is the deciding constraint.** Options A and C avoid the ciphertext display problem. Option C is strictly more useful than A because it includes field-level diffs for non-encrypted data (dates, priority, status, domain_id — the fields users most want to track).

2. **The service layer is well-structured for this.** All mutations flow through `TaskService` and `RecurrenceService`. Adding logging to ~10 service methods is manageable and keeps the logging concern centralized.

3. **Storage is not a concern.** ~18K records/user/year at ~200 bytes each = ~3.5 MB/year. No pruning needed for years.

4. **Batch operations should be special-cased.** Encryption toggles should log a single user-level event, not per-item records. Instance batch operations (complete past) should log a single "batch completed N instances" event.

### Suggested schema

```sql
CREATE TABLE task_activity (
    id            BIGINT PRIMARY KEY,
    user_id       INTEGER NOT NULL REFERENCES users(id),
    task_id       INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
    instance_id   INTEGER REFERENCES task_instances(id) ON DELETE SET NULL,
    event_type    VARCHAR(50) NOT NULL,  -- 'created', 'completed', 'field_changed', 'archived', 'restored', 'skipped', etc.
    field_name    VARCHAR(50),           -- NULL for status events, 'priority'/'scheduled_date'/etc. for field changes
    old_value     TEXT,                  -- NULL for creates; plaintext for non-encrypted fields; omitted for encrypted fields
    new_value     TEXT,                  -- same rules
    batch_id      UUID,                 -- non-NULL groups events from single batch operation
    created_at    TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX ix_task_activity_user_task ON task_activity(user_id, task_id, created_at DESC);
CREATE INDEX ix_task_activity_user_created ON task_activity(user_id, created_at DESC);
```

### Suggested interception point

Add a lightweight `log_activity()` helper called from `TaskService` and `RecurrenceService` methods, right before `bump_data_version()`. This keeps logging co-located with the mutation and inside the same transaction (activity record commits atomically with the change).

### Estimated scope

- **Backend:** New model, migration, ~10 service method modifications, 1 new API endpoint (`GET /tasks/{id}/activity`)
- **Frontend:** Activity list component, tab integration in TaskDetailPanel/TaskInspector, orval regeneration
- **Effort:** Medium — ~2-3 focused sessions. No architectural changes needed.

### What NOT to do

- Don't use SQLAlchemy event listeners — too magical, hard to control what gets logged
- Don't log encrypted field values — follows existing ciphertext-avoidance pattern
- Don't generate per-item records for encryption batch operations
- Don't build a generic audit system — scope to task activity only
