---
version:
pr:
created: 2026-03-12
---

# Verified Audit Findings — v0.64.2 → v0.65.20

**Audit date:** 2026-03-12
**Previous audit:** 2026-03-06 (v0.57.0 → v0.64.1, see `2026-03-06-audit-5-verified.md`)
**Method:** 6 parallel agents audited security, data integrity, frontend UX, parser quality, mobile/Tauri, and performance. Each read actual source code. Cross-referenced and deduplicated below.

## Summary

| Severity | Count |
|----------|-------|
| High     | 0     |
| Medium   | 8     |
| Low      | 9     |
| **Total**| **17**|

**Previous audit fix verification (v0.64.3):** All 8 checked fixes confirmed working:
- ✓ Offline mutation retry on 5xx
- ✓ Biometric IPC timeout (1.5s checks / 30s prompts)
- ✓ Push `reminder_sent_at` only set when push succeeds
- ✓ Cache cleared on 401/session expiry
- ✓ Global `MutationCache.onError` fallback
- ✓ Circuit breaker 30s cooldown (half-open pattern)
- ✓ `clear_encryption_key` requires biometric auth on mobile
- ✓ Push token persistence across app restarts

**Clean areas (no issues):**
- ✓ Security: Parent task multitenancy — all endpoints filter by `user_id`
- ✓ Security: CSP — nonce-based, no `unsafe-inline` scripts, no Google Fonts domains
- ✓ Security: XSS — all user content rendered via React JSX auto-escaping, no `dangerouslySetInnerHTML`
- ✓ Security: i18n interpolation injection — React handles escaping, i18next `escapeValue: false` is safe with JSX
- ✓ Security: Font serving — Starlette `StaticFiles` prevents directory traversal
- ✓ Security: Error messages — generic, no internal detail leakage
- ✓ Data: Circular parent refs — impossible by depth-1 constraint
- ✓ Data: Parent deletion cascade — hard delete cascades via FK, soft delete/archive recurses children
- ✓ Data: Parent completion — cascades to pending children; recurring tasks cannot have subtasks (enforced)
- ✓ Data: `data_version` savepoint — 2s timeout with graceful fallback, correct under contention
- ✓ Parser: `^` token boundary checks — consistent between parser and autocomplete
- ✓ Parser: `!0`/`!5` rejection — regex `[1-4]` with `\b` boundary, tested
- ✓ Parser: Autocomplete race conditions — synchronous in-memory design, no network calls
- ✓ Mobile: PWA viewport rules — no violations found in new components
- ✓ Mobile: Keyboard avoidance — drawer `keyboard-aware` class + native bridge working
- ✓ Mobile: Native tab bar — route sync, keyboard hide, login hide all correct
- ✓ Performance: Calendar algorithm — O(n log n), capped at 3 columns, memoized
- ✓ Performance: Vite bundle splitting — proper manual chunks, route-level lazy loading
- ✓ Performance: Font loading — self-hosted, `font-display: swap`, unicode-range subsetting

---

## Medium Severity (8)

### M1. Parent domain change does not cascade to children

- **File(s):** `app/services/task_service.py:496-502`
- **Description:** When a parent task's `domain_id` is updated via `update_task`, the change applies only to the parent. Existing children retain their old `domain_id`. Domain sync is enforced only on create (line 349) and reparent (line 487), not on parent domain change.
- **Impact:** Children appear in wrong domain grouping after parent is moved to a different domain.
- **Recommended fix:** After applying `domain_id` change to a parent, cascade: `UPDATE tasks SET domain_id = :new WHERE parent_id = :task_id AND user_id = :user_id`.

### M2. Batch schedule action does not reset `reminder_sent_at`

- **File(s):** `app/routers/tasks.py:994-1007`
- **Description:** The batch-action "schedule" path sets `task.scheduled_date` directly (line 1006) without resetting `task.reminder_sent_at`. The single-task update endpoint does reset it (lines 587-594), but the batch path bypasses that logic.
- **Impact:** Bulk-rescheduled tasks with existing reminders won't re-fire for the new date.
- **Recommended fix:** Add `task.reminder_sent_at = None` after line 1006 when the task has `reminder_minutes_before` set.

### M3. Offline queue discards 429 (rate-limited) mutations as permanent failures

- **File(s):** `frontend/src/hooks/use-offline-sync.ts:169-176`
- **Description:** The drain logic treats `status >= 400 && status < 500` as permanent failures. HTTP 429 falls in this range but is transient — the request would succeed after the rate limit window.
- **Impact:** Offline mutations hitting rate limits are permanently lost instead of retried.
- **Recommended fix:** Add `&& status !== 429` to the permanent failure check.

### M4. No keyboard navigation or ARIA roles on ParentTaskDropdown

- **File(s):** `frontend/src/components/task/parent-task-dropdown.tsx:130-227`
- **Description:** No `role="listbox"`, `aria-selected`, `aria-activedescendant`, or ArrowUp/ArrowDown keyboard navigation. Domain chips lack `role="tablist"`. Screen readers see a flat list of unlabeled buttons.
- **Impact:** Keyboard-only and screen reader users cannot effectively navigate the parent picker.
- **Recommended fix:** Add ARIA roles and keyboard navigation with `activeIndex` state. Domain chips should be `role="tablist"`, tasks `role="option"`.

### M5. Calendar context menu does not close on resize or route change

- **File(s):** `frontend/src/components/calendar/calendar-context-menu.tsx:65-94`
- **Description:** The `useEffect` cleanup listens for click-outside, Escape, and scroll — but not `resize` or route navigation. After resize, the menu floats at stale coordinates. After navigation, it persists as a ghost element.
- **Impact:** Confusing UI glitch — menu appears detached or survives page transitions.
- **Recommended fix:** Add `window.addEventListener("resize", close)` and subscribe to router navigation events.

### M6. Calendar context menu has no long-press support on mobile

- **File(s):** `frontend/src/components/calendar/calendar-context-menu.tsx:57-62`
- **Description:** Context menu triggers only via `onContextMenu` (right-click). On iOS, `contextmenu` may be intercepted by dnd-kit's pointer capture for drag-and-drop, preventing the menu from opening on touch devices.
- **Impact:** Mobile users may have no way to access per-task context actions (complete, skip, delete) on calendar cards.
- **Recommended fix:** Add explicit long-press handler (500ms `touchstart`/`touchend` timer) that fires before dnd-kit's drag activation, or document that the floating action bar (multi-select) is the intended mobile pattern.

### M7. Two i18n keys missing from all non-English locales

- **File(s):** `frontend/src/locales/de.json`, `fr.json`, `es.json`, `it.json`, `pt.json`, `ru.json`
- **Description:** `task.allDomains` ("All") and `task.quickAdd.hintParent` ("^ parent task") exist only in `en.json`. i18next falls back to English silently, mixing English fragments into localized UI.
- **Impact:** Jarring UX for non-English users — "^ parent task" hint appears in English.
- **Recommended fix:** Add translations for both keys to all 6 locale files.

### M8. All 7 locale files loaded upfront in main bundle

- **File(s):** `frontend/src/lib/i18n.ts:4-10`, `frontend/src/locales/*.json`
- **Description:** All 7 locale JSON files (336 KB raw total) are statically imported and baked into the main JS chunk. Users only need 1 locale. The main bundle is 784 KB raw / 223 KB gzipped; ~60-70 KB gzipped is wasted translations.
- **Impact:** Slower initial page load, especially on mobile/3G connections.
- **Recommended fix:** Use dynamic `import()` for locale files: load only the detected language at startup, lazy-load others on switch.

---

## Low Severity (9)

### L1. Offline write queue has no retry cap or age expiry

- **File(s):** `frontend/src/hooks/use-offline-sync.ts:159-184`
- **Description:** Entries with 5xx errors retry indefinitely on every `online` event. No max-retry counter or `created_at` TTL check. Very old mutations could be replayed.
- **Impact:** Unlikely in practice (most mutations are near-idempotent), but stale mutations from days/weeks ago could conflict with newer data.
- **Recommended fix:** Discard entries older than 24 hours, or add a retry counter capping at N attempts.

### L2. `tom9:00` (no space) loses time component

- **File(s):** `frontend/src/lib/task-parser.ts:650-651`
- **Description:** `DATE_ABBR_PATTERN` requires `\s+` before the time capture group. `tom9:00` matches `tom` as tomorrow but `9:00` stays in the title as literal text.
- **Impact:** Users typing quickly without a space get date but lose time. `tom 9:00` (with space) works correctly.
- **Recommended fix:** Change `\s+` to `\s*` in the time portion, or document that a space is required.

### L3. Missing test coverage for parser edge cases

- **File(s):** `frontend/src/lib/__tests__/task-parser.test.ts`
- **Description:** Key untested scenarios: `^` in middle of word, multiple `^` tokens, `^` with no match, `tom9:00`, full combined input with all token types, token `startIndex`/`endIndex` correctness, `tmr` abbreviation.
- **Impact:** Edge cases could regress undetected. Index correctness is especially important for autocomplete insertion.
- **Recommended fix:** Add tests for the listed gaps, prioritizing index correctness and `^` edge cases.

### L4. Two inline-add components missing `closeAc` on blur

- **File(s):** `frontend/src/components/task/subtask-ghost-row.tsx:118-122`, `frontend/src/components/task/domain-group.tsx:346-351`
- **Description:** Both use `useSmartInput` but their `onBlur` handlers don't call `closeAc()`. Autocomplete popup stays visible after tabbing away (when input has text). Other consumers (`task-quick-add.tsx`, `task-fields-body.tsx`, `task-edit-drawer.tsx`) do call `closeAc`.
- **Impact:** Minor visual bug — autocomplete persists after focus loss in inline-add rows.
- **Recommended fix:** Add `closeAc()` to both `onBlur` handlers.

### L5. DomainGroup inline add missing `^` parent autocomplete

- **File(s):** `frontend/src/components/task/domain-group.tsx:93`
- **Description:** `useSmartInput({ domains: allDomains })` is called without `parentTasks`. Typing `^` does nothing, unlike quick add and editors which support it.
- **Impact:** Inconsistent behavior across input surfaces. May be intentional for lightweight inline add.
- **Recommended fix:** Pass `parentTasks` to `useSmartInput` if parent assignment from inline add is desired.

### L6. Context menu doesn't clamp to viewport edges

- **File(s):** `frontend/src/components/calendar/calendar-context-menu.tsx:116-127`
- **Description:** Menu positions at raw `clientX`/`clientY` without clamping. Right-clicking near the right or bottom edge causes the `min-w-[160px]` menu to overflow off-screen.
- **Impact:** Menu items unreachable near screen edges.
- **Recommended fix:** Measure menu dimensions via `useLayoutEffect` and clamp position within `window.innerWidth`/`window.innerHeight`.

### L7. ParentTaskDropdown not virtualized

- **File(s):** `frontend/src/components/task/parent-task-dropdown.tsx:191`
- **Description:** All filtered tasks render as DOM elements in a `max-h-60 overflow-y-auto` container. No virtualization. With 500+ tasks, all buttons mount.
- **Impact:** Low — mitigated by `max-h-60` scroll, `useMemo` filtering, and React Compiler. Only problematic at 1000+ tasks.
- **Recommended fix:** Add `@tanstack/react-virtual` if performance issues arise at scale.

### L8. Stale legacy references in documentation

- **File(s):** `docs/SECURITY.md:87`, `docs/DEMO-LOGIN.md:137-144`
- **Description:** Post-v0.65.20 legacy removal: SECURITY.md still mentions "Jinja2 auto-escaping", DEMO-LOGIN.md references deleted files (`app/routers/pages.py`, `app/templates/`, `static/css/`).
- **Impact:** Misleading documentation, no runtime impact.
- **Recommended fix:** Update docs to reflect React SPA architecture.

### L9. `black` formatter still in dev dependencies

- **File(s):** `pyproject.toml:35,53-55`, `justfile:20-21`
- **Description:** Project uses `ruff format` but `black>=24.10.0` is still in dev deps with a `[tool.black]` config section. `just fmt` runs `black` instead of `ruff format`.
- **Impact:** Unnecessary dependency, potential confusion with two formatters available.
- **Recommended fix:** Remove `black` from dev deps, delete `[tool.black]` section, update `just fmt` to `uv run ruff format .`.

---

## Not Verified (Informational)

These items were noted but are not actionable findings:

- **Empty `docs/plans/` directory in `frontend/dist/fonts/`** — build artifact from Vite, contains no files. No security or runtime impact. Worth investigating Vite's public dir copy behavior if it recurs.
- **`TOAST_DURATION_SHORT` undocumented in CLAUDE.md rule 11** — uses a named constant (not hardcoded), follows the spirit of the rule. CLAUDE.md should be updated to acknowledge it as a third permitted constant.
- **No font preloading in `index.html`** — `font-display: swap` already prevents render blocking. Adding `<link rel="preload">` for `nunito-latin.woff2` would save one round-trip but impact is minimal.
- **Cyrillic-ext unicode range not covered** — standard Russian/Ukrainian work fine. Only affects rare Cyrillic-script languages (Kazakh, Bashkir). Acceptable coverage for current user base.
- **All parent tasks filtered client-side** — acceptable at current scale (<500 tasks per user). If users report lag at 1000+, add server-side search endpoint.
