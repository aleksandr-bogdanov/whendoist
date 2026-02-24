# Whendoist Follow-Up Audit - January 2026 (Supplementary)

**Version:** 0.26.0
**Audit Date:** 2026-01-22
**Previous Audit:** docs/AUDIT-2026-01.md
**Focus:** Deep-dive on edge cases missed by first pass

---

## Summary

This supplementary audit performed a deeper technical analysis focusing on:
- Security edge cases (race conditions, timing attacks, token handling)
- Concurrency issues (async patterns, data races)
- Error handling gaps (partial failures, missing rollbacks)
- Business logic bugs (recurrence, timezone, date boundaries)
- Performance bottlenecks
- Frontend security (XSS, prototype pollution)

### New Findings

| # | Severity | Finding | Location |
|---|----------|---------|----------|
| 1 | **Medium** | DOM XSS via domain name in task-dialog.js | `static/js/task-dialog.js:721-722` |
| 2 | Low | Batch update partial commit on error | `app/routers/tasks.py:533-584` |
| 3 | Low | Timezone-naive date.today() in recurrence | `app/services/recurrence_service.py:133-134` |
| 4 | Info | Wipe endpoint requires Todoist connection | `app/routers/import_data.py:67-88` |
| 5 | Info | Calendar data innerHTML (low risk) | `static/js/wizard.js:804-816` |

---

## 1. Security Edge Cases

### 1.1 Finding SUP-01: DOM XSS via Domain Name (Medium)

**Location:** `static/js/task-dialog.js:721-722`

**Description:** The `updateDomainSelect()` function uses `innerHTML` to render domain names without escaping:

```javascript
menu.innerHTML = '<button type="button" class="domain-dropdown-item" data-value="">📥 Inbox</button>' +
    domains.map(d => `<button type="button" class="domain-dropdown-item" data-value="${d.id}">${d.icon || '📁'} ${d.name}</button>`).join('');
```

If a domain name contains `<script>` or other HTML, it will be rendered as HTML. While domain names are user-controlled data (same user), this breaks defense-in-depth principles.

**Attack Scenario:**
1. User creates domain with name: `<img src=x onerror=alert(1)>`
2. Opens task dialog
3. Payload executes in browser context

**Risk Assessment:** Medium - Self-XSS only (attacker = victim), but could be exploited via:
- CSRF to create malicious domain
- Social engineering to import malicious backup

**Recommendation:** Use `escapeHtml()` (already exists in wizard.js):

```javascript
menu.innerHTML = '<button ...>📥 Inbox</button>' +
    domains.map(d => `<button ... data-value="${d.id}">${escapeHtml(d.icon || '📁')} ${escapeHtml(d.name)}</button>`).join('');
```

**Effort:** Trivial

### 1.2 Token Refresh Race Condition Handling (Good)

**Location:** `app/services/gcal.py:125-182`

**Assessment:** Excellent design. Uses `FOR UPDATE SKIP LOCKED` to prevent thundering herd on token refresh. Multiple concurrent requests gracefully handle:
1. First request acquires lock and refreshes
2. Other requests see lock, wait with exponential backoff
3. After wait, re-check if refresh needed (may have been done)
4. Force refresh fallback after timeout

No issues found.

### 1.3 Challenge Service Token Handling (Good)

**Location:** `app/services/challenge_service.py`

**Assessment:** Challenges are:
- Stored in database (multi-worker safe)
- Single-use (consumed on verification)
- Time-bounded (CHALLENGE_TTL_SECONDS)
- User-scoped (can't use another user's challenge)

No timing attacks possible since comparison is on bytes from database lookup (not comparison).

---

## 2. Concurrency Issues

### 2.1 Finding SUP-02: Batch Update Partial Commit on Error (Low)

**Location:** `app/routers/tasks.py:533-584`

**Description:** The `batch_update_tasks` endpoint commits every 25 items to prevent connection timeouts, but continues processing on error:

```python
for i, item in enumerate(data.tasks):
    try:
        task = await service.get_task(item.id)
        if not task:
            continue
        await service.update_task(...)
        updated_count += 1

        if (i + 1) % batch_size == 0:
            await db.commit()  # Partial commit
    except Exception as e:
        errors.append({"id": item.id, "error": str(e)})
        # Continues to next item - no rollback
```

**Issue:** If task 26 fails, tasks 1-25 are already committed. The operation is not atomic.

**Impact:** Low - This endpoint is used for encryption enable/disable. Partial completion means some tasks encrypted, others not. User can retry to complete.

**Recommendation:**
- Option A: Document non-atomic behavior in API
- Option B: Use savepoints for true atomicity (may hit connection limits)
- Option C: Accept current behavior (self-healing on retry)

**Effort:** Small (for Option A)

### 2.2 Async Database Session Handling (Good)

**Assessment:** All async routes use `Depends(get_db)` which provides proper session lifecycle. No shared session state between requests. `AsyncSession` used consistently.

---

## 3. Error Handling Gaps

### 3.1 Import Partial Failure

**Location:** `app/services/todoist_import.py`

**Assessment:** Import accumulates errors but continues processing. Result includes error list. Partial imports are valid use case (some tasks may fail due to validation). Documented behavior.

### 3.2 Rollback on Passkey Registration Failure (Good)

**Location:** `app/routers/passkeys.py:160-177`

**Assessment:** Properly catches exception, calls `db.rollback()`, then raises HTTPException. No orphaned data.

---

## 4. Business Logic Bugs

### 4.1 Finding SUP-03: Timezone-Naive date.today() in Recurrence (Low)

**Location:** `app/services/recurrence_service.py:133-134`

**Description:** Instance materialization uses `date.today()` which is server-local:

```python
start_date = task.recurrence_start or date.today()
if start_date < date.today():
    start_date = date.today()
```

**Issue:** If server is in UTC but user is in UTC-8:
- At 4pm PST (midnight UTC), server thinks it's "tomorrow"
- Task scheduled for "today" may not appear until page refresh

**Impact:** Low - Only affects edge case around midnight server time. Self-corrects on next page load.

**Recommendation:** Consider using user timezone preference (if implemented) or always use UTC for consistency.

**Effort:** Medium (requires timezone preference in user model)

### 4.2 Instance Date vs Scheduled DateTime Timezone (Info)

**Location:** `app/services/recurrence_service.py:177-178`

```python
instance = TaskInstance(
    instance_date=occ_date,  # Plain date, no timezone
    scheduled_datetime=(datetime.combine(occ_date, default_time, tzinfo=UTC) if default_time else None),
)
```

**Assessment:** `instance_date` is a date (no timezone), `scheduled_datetime` is timezone-aware (UTC). This is intentional - dates are for filtering, datetime for scheduling. Edge cases handled correctly.

### 4.3 Recurrence Rule Edge Cases (Good)

**Assessment:** dateutil.rrule handles:
- Feb 29 in non-leap years (skipped)
- 31st of month for months with fewer days (handled by rrule)
- Week-of-month boundaries

---

## 5. Performance Bottlenecks

### 5.1 N+1 in ensure_instances_materialized - FIXED

**Status:** Already fixed in first audit.

### 5.2 Task List Pagination (Info)

**Assessment:** First audit noted "acceptable for scale." For a personal productivity app with hundreds of tasks (not thousands), full load is acceptable. Add pagination if user feedback indicates performance issues.

### 5.3 Calendar Event Fetching (Good)

**Location:** `app/services/gcal.py:247-306`

**Assessment:** Uses pagination with configurable `max_events` (default 1000). Efficient for typical usage.

---

## 6. Frontend Security

### 6.1 innerHTML Usage Audit

| File | Line | Risk | Mitigation |
|------|------|------|------------|
| task-dialog.js | 721 | **Medium** | Domain name not escaped - **FIX NEEDED** |
| wizard.js | 804 | Low | Calendar data from API, escapeHtml available |
| wizard.js | 529, 1121 | Low | Uses escapeHtml for user data |
| drag-drop.js | 934, 1145 | Low | Task data from API, timing labels hardcoded |
| toast.js | 27 | Safe | Message passed from code, not user input |

### 6.2 Finding SUP-04: Calendar Data innerHTML (Info)

**Location:** `static/js/wizard.js:804-816`

**Description:** Calendar list renders data from API without escaping:

```javascript
list.innerHTML = calendars.map(cal => {
    return `<div class="wizard-calendar-row" data-calendar-id="${this.escapeHtml(cal.id)}">
        <span class="wizard-calendar-color" style="background: ${cal.background_color || '#4285f4'}"></span>
        <span class="wizard-calendar-name">${this.escapeHtml(cal.summary)}</span>
        ...
    `;
}).join('');
```

**Assessment:** Actually safe - `escapeHtml` is used for cal.id and cal.summary. `background_color` comes from Google Calendar API (hex color format). Low risk of abuse.

### 6.3 No postMessage Usage (Good)

**Assessment:** Grep found no postMessage handlers. No cross-origin messaging attack surface.

### 6.4 Prototype Pollution (Good)

**Assessment:** No `Object.assign` with user-controlled sources, no `JSON.parse` with direct assignment to prototype chains. Safe patterns used.

---

## 7. Additional Observations

### 7.1 Finding SUP-05: Wipe Endpoint Requires Todoist (Info)

**Location:** `app/routers/import_data.py:67-88`

**Description:** The wipe endpoint requires a Todoist connection:

```python
todoist_token = (await db.execute(select(TodoistToken).where(...))).scalar_one_or_none()
if not todoist_token:
    raise HTTPException(status_code=400, detail="Todoist not connected...")
```

**Issue:** Users without Todoist cannot use the wipe feature. The Todoist token is passed to `TodoistImportService` but not used for wipe.

**Recommendation:** Move wipe logic to TaskService (no Todoist dependency).

**Effort:** Trivial

### 7.2 Encryption Test Value Exposure (Acceptable)

**Location:** `app/templates/base.html:110`

The encrypted test value is exposed in JavaScript:
```javascript
encryptionTestValue: {{ encryption_test_value|default(none)|tojson }},
```

**Assessment:** This is intentional - the test value is encrypted and needed client-side to verify passphrase. Cannot be used to decrypt data without the passphrase.

---

## Action Items

### Immediate (Before Next Release)

| Priority | Item | Effort | Severity |
|----------|------|--------|----------|
| 1 | Fix XSS in task-dialog.js domain dropdown | Trivial | Medium |

### Short-Term

| Priority | Item | Effort | Severity |
|----------|------|--------|----------|
| 2 | Document batch update non-atomic behavior | Trivial | Low |
| 3 | Remove Todoist requirement from wipe endpoint | Trivial | Info |

### Consider for Future

| Priority | Item | Effort | Severity |
|----------|------|--------|----------|
| 4 | Add user timezone preference for recurrence | Medium | Low |
| 5 | Add escapeHtml utility to task-dialog.js | Trivial | Defense-in-depth |

---

## Conclusion

The deep-dive audit found **one Medium-severity issue** (DOM XSS in task-dialog.js) that should be fixed before the next release. All other findings are Low or Informational.

The codebase demonstrates good security practices overall:
- Proper handling of race conditions in token refresh
- Challenge tokens properly scoped and time-bounded
- Templates use safe escaping patterns
- No prototype pollution or postMessage vulnerabilities

The XSS finding is self-XSS (same user creates and views the malicious domain), but still violates security best practices and could be exploited via CSRF or social engineering.

---

*Supplementary audit generated by Claude on 2026-01-22*
