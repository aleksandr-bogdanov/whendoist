# PWA Offline Writes — v1.0 Gate Investigation

> Opus investigation, February 9 2026. Should Whendoist implement an IndexedDB offline write queue?

---

## Decision: Warn-only for v1.0. Defer full queue to v1.1+.

Implemented in PR #81 (v0.42.10).

## Current Offline Behavior (Before Fix)

| Operation | Optimistic UI? | Reverts? | UX |
|-----------|---------------|----------|----|
| Complete (click) | Yes | Yes | Checkbox flickers, error toast + Retry |
| Complete (swipe) | Partial | Yes | Swipe animation, error toast |
| Delete (swipe/dialog/drag) | Yes, 5s delay | Yes | Vanishes 5s, reappears |
| Create / Edit | No | N/A | Button flickers, dialog stays open |
| Skip instance | Yes | Yes | Visual flicker, error toast |
| Schedule (drag) | Yes | Yes | Appears in calendar, then vanishes |

**Key insight:** Safe but janky. No data loss — everything fails visibly with recovery.

## What Was Fixed (v0.42.10)

- Network check added BEFORE optimistic updates in: `task-complete.js`, `task-swipe.js`, `task-dialog.js`, `drag-drop.js`
- Shows "You're offline" toast and returns early — no flicker
- Consolidated duplicate network toasts (error-handler.js + mobile-core.js)
- Fixed misleading offline page text ("changes will sync" → "changes require a connection")

## Why Not a Full Queue

### Effort: ~14 days, ~1,090 lines of new/changed code

| Component | Days |
|-----------|------|
| IndexedDB wrapper | 1 |
| Queue manager (enqueue, dedup, merge) | 2 |
| Sync engine (process queue, conflicts) | 3 |
| UI feedback (pending indicator) | 0.5 |
| Modify 6 existing mutation handlers | 2 |
| Service worker sync integration | 0.5 |
| Testing (manual only — no JS test infra) | 3 |
| Edge cases & debugging | 2 |

### 4 High-Residual-Risk Items

1. **Browser storage eviction:** Safari aggressively evicts IndexedDB in Private Browsing and after 7 days of no visits. Queued operations could be silently lost.

2. **Temp ID resolution:** Create-then-edit offline requires mapping client-generated UUIDs to server IDs during sync. Off-by-one in ordering corrupts all subsequent operations.

3. **Encryption interaction:** Encrypted task titles queued in IndexedDB become unreadable if encryption key changes or feature is toggled. Requires key versioning.

4. **No JS test infrastructure:** Project philosophy (CLAUDE.md): "only write tests that run in CI automatically." An offline queue with dedup/conflict logic demands automated tests. Setting up vitest/jest is a prerequisite (+1-2 days).

### Additional Concerns

- Background Sync API has limited Safari/iOS support
- CSRF tokens expire — queued operations need fresh tokens at sync time
- Single-user app reduces offline queue value vs. collaborative apps

## When to Revisit

Consider implementing for v1.1 when:
- JS test infrastructure is in place (vitest, running in CI)
- User feedback indicates offline writes are top-requested
- Encryption system is stabilized with key management
- Safari Background Sync support improves

## Queue Design (For Future Reference)

### IndexedDB Schema
```
Store: pending_operations
  id: auto-increment
  type: complete|skip|create|edit|delete|schedule
  url: full API URL
  method: POST|PUT|DELETE
  body: JSON string
  timestamp: Date.now()
  retryCount: 0 (max 3)
  entityType: task|instance
  entityId: string|null
  tempId: string|null (for creates)
  status: pending|syncing|failed|conflict
```

### Dedup Rules
- Complete+Complete same entity → cancel both (toggle)
- Edit after Edit → keep latest only
- Delete after anything → delete wins
- Edit after Create → merge into single Create
- Delete after Create → remove both
