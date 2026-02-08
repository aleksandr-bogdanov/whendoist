# V1.0 Roadmap Audit: Critical Features Reality Check

> **Created:** February 2026
> **Purpose:** Verify actual implementation status vs. V1-ROADMAP.md claims for critical features (#2, #3, #4, #6)

---

## Executive Summary

**The roadmap is outdated.** Two "critical blockers" are already implemented, one is partially done, and one needs work.

| Feature | Roadmap Claim | Reality | Status |
|---------|---------------|---------|--------|
| **#2: User Onboarding** | ❌ "No guided setup" | ✅ Full 7-step wizard | **IMPLEMENTED** |
| **#3: Error Recovery UX** | ⚠️ "Generic errors, inconsistent" | ⚠️ Toast system exists, coverage incomplete | **PARTIAL** |
| **#4: Data Export** | ⚠️ "Manual endpoint exists" | ✅ UI + API complete | **IMPLEMENTED** |
| **#6: Keyboard Shortcuts** | ⚠️ "Limited (Ctrl+K)" | ⚠️ Basic shortcuts only (`q`, `n`, `Esc`) | **MINIMAL** |

---

## Detailed Findings

### #2: User Onboarding — **IMPLEMENTED** ✅

**Roadmap says:**
> Current: No guided setup
> Need: First-run wizard, sample tasks, feature discovery
> Goal: 0→productive in < 5 minutes

**Reality:**
- **Full wizard exists** at `app/routers/wizard.py` + `static/js/wizard.js`
- **7-step onboarding flow:**
  1. Welcome screen (personalized greeting)
  2. Energy mode explanation (Zombie/Normal/Focus)
  3. Calendar connection (Google OAuth)
  4. Calendar selection (which calendars matter)
  5. Todoist import (optional)
  6. Domain setup (life areas)
  7. Completion screen
- **Production features:**
  - Swipe navigation for mobile
  - Keyboard handling for virtual keyboards
  - Haptic feedback
  - LocalStorage state persistence
  - Skip/retry mechanisms
  - Reduced motion support
- **Database integration:**
  - `User.wizard_completed` flag
  - `/wizard/status`, `/wizard/complete`, `/wizard/reset` endpoints

**Verdict:** This is a **polished, production-ready wizard**. The roadmap is **completely wrong**.

**Recommendation:** Remove from critical blockers. Move to "Iterate & Improve" bucket.

---

### #3: Error Recovery UX — **PARTIAL** ⚠️

**Roadmap says:**
> Current: Generic error pages, some inconsistent error handling
> Need: User-friendly error messages, retry mechanisms
> Sentry captures backend errors, but frontend needs polish

**Reality:**

#### ✅ What exists:
- **Error handler module** (`static/js/error-handler.js`):
  - `handleError(error, userMessage)` - logs technical details, shows user-friendly toast
  - `safeFetch(url, options)` - auto-includes CSRF, handles common errors (403 CSRF expiry, HTTP errors)
  - `getCSRFHeaders()` - standardized header injection
- **Toast notification system** - user-facing error messages
- **Wizard retry mechanisms:**
  - Todoist import failure → "Try Again" + "Skip" buttons
  - Error state rendering with illustrations
- **CSRF handling:**
  - Detects expired tokens
  - Prompts user to refresh page

#### ❌ What's missing:
- **Consistency:** Not all JS modules use `safeFetch()` or `handleError()`
- **Network errors:** No offline detection or "retry" for network failures
- **Rate limit UX:** Rate limit errors (429) not handled gracefully
- **Error boundaries:** No global error catching for JS exceptions
- **Recovery guidance:** Errors don't always suggest actionable fixes

**Verdict:** The roadmap is **accurate**. Foundation exists, but **coverage is incomplete**.

**Recommendation:**
1. Audit all `fetch()` calls → migrate to `safeFetch()`
2. Add global error boundary for unhandled JS exceptions
3. Add network status detection + retry UI
4. Add rate limit error messaging (e.g., "Too many requests, try again in 30s")

---

### #4: Data Export — **IMPLEMENTED** ✅

**Roadmap says:**
> Current: Manual backup endpoint exists
> Need: Scheduled exports, one-click download
> Users should be able to leave with their data

**Reality:**

#### ✅ What exists:
- **API endpoints** (`app/routers/backup.py`):
  - `GET /backup/export` - downloads `whendoist_backup_YYYYMMDD_HHMMSS.json`
  - `POST /backup/import` - restores from uploaded JSON (replaces all data)
  - Rate limited (5 requests/minute)
- **UI in Settings** (`app/templates/settings.html`):
  - **"Download Backup"** button → one-click export
  - **"Restore Backup"** button → file upload dialog
- **Service layer** (`app/services/backup_service.py`):
  - Exports: tasks, domains, preferences, recurring tasks, task instances
  - Imports: validates schema, clears existing data, restores all entities
  - Multitenancy-safe (only user's own data)

#### ❌ What's missing:
- **Scheduled exports** - no automated daily/weekly backups
- **Cloud storage** - no Google Drive / Dropbox integration
- **Version history** - no backup retention policy
- **Incremental backups** - always full export

**Verdict:** The roadmap understates reality. **One-click download already exists.**

**Recommendation:**
1. Remove from critical blockers (it's done)
2. Post-v1.0: Add scheduled exports (cron job → email link or Google Drive)
3. Post-v1.0: Add backup history (keep last 7 backups)

---

### #6: Keyboard Shortcuts — **MINIMAL** ⚠️

**Roadmap says:**
> Current: Limited (Ctrl+K for quick add)
> Need: Full shortcut reference, customizable bindings
> Power users expect this

**Reality:**

#### ✅ What exists:
- **Quick add:** `q` (not Ctrl+K!) opens task dialog
  - Only works when no input/textarea/select is focused
  - Location: `static/js/task-dialog.js:605`
- **New task editor:** `n` opens task sheet
  - Location: `static/js/task-sheet.js:186`
- **Close dialogs:** `Escape` closes:
  - Task sheet
  - Settings panel
  - Mobile sheet
  - Wizard custom domain input
  - Plan mode selection
- **Submit forms:** `Enter` advances wizard steps (when not in button)

#### ❌ What's missing:
- **No shortcut reference** - users can't discover shortcuts
- **No customization** - hardcoded keybindings
- **No visual hints** - no tooltips showing shortcuts
- **Limited coverage** - no shortcuts for:
  - Navigation (j/k for next/prev task)
  - Task actions (c for complete, d for delete, e for edit)
  - View switching (1-7 for different views)
  - Search (/ for focus search)
  - Calendar navigation (arrow keys)
  - Undo/redo (Ctrl+Z / Ctrl+Y)

**Verdict:** The roadmap is **mostly accurate**. Shortcuts are minimal. The "Ctrl+K" claim is **wrong** (it's `q`).

**Recommendation:**
1. **Phase 1 (Pre-v1.0):**
   - Add shortcut reference modal (`?` to open)
   - Add tooltips showing shortcuts on hover
   - Document existing shortcuts in help
2. **Phase 2 (v1.1):**
   - Add navigation shortcuts (j/k, vim-style)
   - Add action shortcuts (c/d/e)
   - Add view switching (1-7)
3. **Phase 3 (v1.2):**
   - Make shortcuts customizable
   - Add shortcut editor in Settings
   - Support chord bindings (e.g., `g h` for "go home")

---

## Priority Assessment

Based on this audit, here's the **revised critical path to v1.0:**

### 🔴 True Blockers (must fix before v1.0):

1. **Error Recovery UX (#3)** - 2-3 days
   - Migrate all fetch() calls to safeFetch()
   - Add global error boundary
   - Add network status detection
   - Polish rate limit messaging

2. **Keyboard Shortcuts (#6)** - 2 days
   - Add shortcut reference modal
   - Add tooltips for existing shortcuts
   - Document shortcuts in help

### ✅ Already Done (remove from roadmap):

3. **User Onboarding (#2)** - Complete, just needs testing/iteration
4. **Data Export (#4)** - Complete, scheduled exports can wait for v1.1

---

## Roadmap Update Recommendations

### Update V1-ROADMAP.md:

**Remove from Critical (🔴):**
- ~~#2: User Onboarding~~ → Move to "Polish & Testing" (it exists, needs iteration)
- ~~#4: Data Export~~ → Move to "Post-v1.0" (scheduled exports)

**Keep in Critical (🔴):**
- #3: Error Recovery UX (accurate assessment)

**Promote from Important (🟡) to Critical (🔴):**
- #6: Keyboard Shortcuts (power users will complain without this)

**New Critical Items to Consider:**
- **Mobile UX polish** (#1 in roadmap) - proactive gap surfacing, task-initiated scheduling
- **Performance profiling** (before Honeycomb investment, use built-in tools first)
- **Test coverage** (integration tests for critical workflows)

---

## Testing Checklist

Before declaring these features "done," verify:

### Onboarding (#2):
- [ ] Test wizard on fresh account (no data)
- [ ] Test wizard skip flows (calendar not connected, no Todoist)
- [ ] Test wizard resume (close mid-flow, come back)
- [ ] Test wizard on mobile (swipe navigation, keyboard handling)
- [ ] Verify no wizard on returning users
- [ ] Test wizard reset from Settings (if that exists)

### Error Recovery (#3):
- [ ] Test CSRF expiry (wait 1hr, submit form)
- [ ] Test network offline (disconnect, try action)
- [ ] Test rate limit (spam backup export 6+ times)
- [ ] Test 500 errors (trigger server error, check Sentry + user message)
- [ ] Test 404 errors (navigate to /nonexistent, check UX)
- [ ] Test Todoist import failure (revoke token, try import)

### Data Export (#4):
- [ ] Export with 0 tasks → verify valid JSON
- [ ] Export with 100+ tasks → verify completeness
- [ ] Export with encrypted data → verify decryption on import
- [ ] Import valid backup → verify all data restored
- [ ] Import invalid JSON → verify error message
- [ ] Import someone else's backup → verify multitenancy protection

### Keyboard Shortcuts (#6):
- [ ] Test `q` opens quick add (not in input field)
- [ ] Test `q` does NOT open quick add (in input field)
- [ ] Test `n` opens task editor
- [ ] Test `Escape` closes all dialogs
- [ ] Test `Enter` in wizard forms
- [ ] Document all shortcuts in help page

---

## Next Steps

1. **Update V1-ROADMAP.md** with revised critical items
2. **Create GitHub issues** for:
   - Error recovery audit & migration (#3)
   - Keyboard shortcut reference modal (#6)
3. **Run testing checklist** for onboarding & data export
4. **Communicate to stakeholders:** "2 critical items already done, 2 need work"

---

*Last updated: February 2026*
