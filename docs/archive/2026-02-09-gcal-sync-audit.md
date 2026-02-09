# GCal Sync System — v1.0 Gate Audit

> Opus investigation, February 9 2026. Failure mode analysis before v1.0.

---

## Scope

Files audited: `gcal_sync.py`, `gcal.py`, `google.py` (auth), `gcal_sync.py` (router), `tasks.py` (fire-and-forget), `recurring.py`, `models.py`, `constants.py`, `test_gcal.py`.

## Failure Mode Matrix

| # | Failure Mode | Likelihood | Severity | Status |
|---|---|---|---|---|
| 1 | Token refresh race (force-refresh bypasses lock) | Unlikely | Medium | Acceptable risk |
| 2 | **OAuth revocation → zombie sync** (TokenRefreshError uncaught) | Rare | **High** | **Fixed — PR #82 (v0.42.9)** |
| 3 | Rapid toggle drops second sync (lock still held by first) | Possible | Medium | Deferred |
| 4 | Calendar deleted externally | Possible | Low | Well-handled |
| 5 | Bulk sync timeout with 1000+ tasks | Possible | Medium | Partial state consistent |
| 6 | Memory during large sync | Unlikely | Low | Acceptable at scale |
| 7 | **Rate-limit crash → orphan events** (session not committed) | Possible | **Medium** | **Fixed — PR #82 (v0.42.9)** |
| 8 | Adaptive throttle recovery | Likely | Low | Works correctly |
| 9 | Orphan events (multiple scenarios) | Possible | Medium | Partially mitigated |
| 10 | Unexpected API responses | Rare | Low | Well-handled |

## Fix Details (PR #82)

### TokenRefreshError zombie state
- `TokenRefreshError` now caught alongside `httpx.HTTPStatusError` in `bulk_sync()`, `sync_task()`, `sync_task_instance()`
- Calls `_disable_sync_on_error()` with user-friendly message
- Fire-and-forget wrappers in `tasks.py` also handle it

### Periodic flush for crash safety
- `db.flush()` every 50 events in bulk sync loop
- If sync crashes at event #501, first 500 sync records survive → no duplicates on retry

## Deferred Items — Post-v1.0

**#3 Rapid toggle:** Enable→Disable→Enable quickly causes second sync to skip (lock held by first). User sees "enabled" with 0 events. Workaround: wait 1-2 min, then Full Re-sync. Fix: cancel-and-wait before starting new sync.

**#5 Bulk sync timeout:** 1000+ tasks with rate limiting can exceed materialization timeout. User-triggered syncs have no timeout at all. Consider `asyncio.wait_for()` with 15-min ceiling.

**#9 Orphan events:** Multiple scenarios remain:
- Fire-and-forget sync→unsync race (task archived right after sync started)
- Disable without `delete_events` leaves calendar events with no sync records
- Enable with existing calendar runs `clear_all_events` which mitigates on re-enable

**Unprotected bulk sync in tasks.py:** `_fire_and_forget_bulk_sync` doesn't use per-user lock from `gcal_sync.py`. Could run concurrent with protected sync.

## Operational Runbook

**Zombie sync symptoms:** User reports sync "enabled" but no events appear. Check logs for repeated `TokenRefreshError`.
**Recovery:** User: Settings → Disable Sync → Reconnect Google → Enable Sync.

**Duplicate events symptoms:** Fewer sync records than expected in DB.
**Recovery:** Disable sync with "Delete events" → Re-enable.

**Stalled sync after rapid toggle:** 0 synced events.
**Recovery:** Wait 1-2 min → Full Re-sync.
