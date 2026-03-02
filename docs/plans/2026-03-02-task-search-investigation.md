---
version:
pr:
created: 2026-03-02
---

# Task Search Investigation

Research into adding full-text task search to Whendoist. No implementation — findings only.

---

## Findings

### 1. Current Query Patterns (No Text Search Exists)

**Endpoint:** `GET /api/v1/tasks` — the sole task listing endpoint.

**Existing filters** (all metadata, no text):
| Parameter | Type | Notes |
|-----------|------|-------|
| `status` | string | `pending` / `completed` / `archived` / `all` |
| `domain_id` | int | Filter by domain |
| `scheduled_date` | date | Exact date match only |
| `is_recurring` | bool | Recurring flag |
| `clarity` | string | `autopilot` / `normal` / `brainstorm` |
| `parent_id` | int | Subtasks of a task |
| `limit` / `offset` | int | Offset-based pagination (1–200) |

**No `LIKE`, `ILIKE`, or `contains` queries exist anywhere in the backend.**
The only text search in the entire codebase is client-side in the parent task picker:
```typescript
// frontend/src/lib/task-utils.ts:350
.filter((t) => !q || t.title.toLowerCase().includes(q))
```

**Pagination:** Offset-based with `X-Total-Count` header when `limit` is set.

**Indexes** on the Task table (all B-tree, no text indexes):
- `(user_id, status)`, `(user_id, status, completed_at)`, `(user_id, scheduled_date)`
- `(user_id, domain_id)`, `(parent_id)`, `(user_id, parent_id)`

### 2. Database Layer

**Task.title** — `Text` column (not `String`; sized for encrypted values ~1.4x larger).
**Task.description** — `Text`, nullable.

Both are plain SQLAlchemy `Text` columns with no special search configuration — no `tsvector`, no trigram indexes, no GIN/GIST indexes.

**Production:** PostgreSQL 16 via `asyncpg`.
**Unit tests:** SQLite in-memory via `aiosqlite`.
**Integration tests:** PostgreSQL 16-alpine via testcontainers.

One PostgreSQL-specific feature already in use: `postgresql.JSON` for `recurrence_rule`.

### 3. Encryption Complication (The Hard Constraint)

Whendoist uses **client-side E2EE** for three fields only:
- `Task.title`
- `Task.description`
- `Domain.name`

**How it works:**
1. Browser encrypts plaintext with AES-256-GCM (PBKDF2-derived key, 600k iterations)
2. Server stores base64 ciphertext as-is — **cannot decrypt**
3. On fetch, browser decrypts before rendering
4. Toggle: single `UserPreferences.encryption_enabled` flag (no per-record flags)

**When encryption is ON, the server literally cannot search titles or descriptions.**
It sees strings like `eTh3qkLzU8PvW1mX2yZ9aB5cD7eF4gH6iJ8kL0nM9oP=`.

**When encryption is OFF** (likely the majority of users — opt-in feature added post-launch),
titles and descriptions are plaintext in the database and fully searchable.

**Current data loading pattern:** The dashboard loads ALL non-archived tasks in one query
(`status: "all"`, no pagination), decrypts client-side, and renders. This is the existing
"fetch everything" approach that makes client-side search trivially possible.

### 4. Frontend Patterns

**No search UI exists.** Specifically:
- No `Cmd+K` command palette
- No `cmdk` library installed
- No `fuse.js` or fuzzy search library
- No search state in Zustand stores
- No `shadcn/ui` Command component

**What does exist** (reusable infrastructure):
- Custom keyboard shortcuts system (`use-shortcuts.ts`) — global registry, easy to add `Cmd+K`
- Quick-add dialog pattern (`task-quick-add.tsx`) — dialog UI with `MetadataPill`, `Kbd` components
- Smart input system (`use-smart-input.ts`) — inline parsing, autocomplete
- shadcn/ui `Dialog`, `Input`, `ScrollArea` primitives

**Thoughts page** (`thoughts.lazy.tsx`) has no search or filtering at all.

### 5. Scale Considerations

**Demo seed:** ~86 tasks (21 scheduled + 10 backlog + 5 subtasks + 8 recurring + 30 completed + 6 archived + 6 thoughts).

**Current loading:** Dashboard fetches ALL tasks in one request — no pagination used on the main view.

**Batch update:** Supports up to 5,000 tasks per request (used for encryption toggle).

**Viability of client-side search:**
| User type | Task count | Client-side search? |
|-----------|-----------|---------------------|
| Casual | 50–200 | Easily viable |
| Regular | 200–500 | Viable |
| Power user | 500–1,000 | Viable with care |
| Heavy user | 1,000–5,000 | Performance risk — needs virtualization or server-side |

Since the dashboard already loads all tasks into memory, **client-side search costs nothing extra**
for the current user base. The data is already there.

### 6. PostgreSQL vs SQLite for Search

| Approach | SQLite | PostgreSQL | Performance | Complexity |
|----------|--------|------------|-------------|------------|
| `ILIKE '%term%'` | ✅ (LIKE is case-insensitive by default) | ✅ | O(n) scan | Trivial |
| `pg_trgm` trigram | ❌ | ✅ (needs extension) | Fast with GIN index | Low |
| `tsvector` FTS | ❌ | ✅ | Fast with GIN index | Medium |
| Client-side JS `.includes()` | N/A | N/A | Fast for <1k items | Trivial |
| External engine (Meilisearch etc.) | ✅ | ✅ | Fast at any scale | High |

**No cross-database FTS exists** — `tsvector` and `pg_trgm` are PostgreSQL-only.
Unit tests use SQLite, so any DB-level search must degrade gracefully or use ILIKE
(which works on both).

---

## Options

### Option A: Client-Side Search Only (Recommended for v1)

**How:** Add a `Cmd+K` search dialog that filters the already-loaded task array in the browser.
Use `String.includes()` or a lightweight fuzzy library (fuse.js is 7KB gzipped).

**Pros:**
- Works identically for encrypted AND non-encrypted users
- Zero backend changes — no migration, no new endpoint
- Data is already in memory (dashboard loads all tasks)
- Instant results (no network latency)
- Works on both SQLite and PostgreSQL (irrelevant — no DB queries)
- Simple to implement: ~1 new component + Zustand state + keyboard shortcut

**Cons:**
- Degrades with very large task counts (>2,000)
- Cannot search archived tasks (not loaded by default)
- No relevance ranking beyond basic fuzzy scoring

**Estimated scope:** 1 new component (`SearchPalette`), 1 store field (`searchOpen`),
wire `Cmd+K` in `useShortcuts`, render results grouped by domain.

### Option B: Server-Side ILIKE Search (Non-Encrypted Users Only)

**How:** Add `?search=term` parameter to `GET /api/v1/tasks` that applies
`Task.title.ilike(f"%{term}%")` server-side.

**Pros:**
- Can search archived tasks and large datasets
- Leverages existing pagination
- Simple SQLAlchemy — works on both SQLite (LIKE) and PostgreSQL (ILIKE)

**Cons:**
- **Does not work for encrypted users** — server sees ciphertext
- O(n) table scan without trigram index (acceptable for <10k tasks per user)
- Requires a new migration if adding a search index
- Adds network latency vs. client-side

**Enhancement:** Add `pg_trgm` GIN index on PostgreSQL for better performance,
skip for SQLite tests.

### Option C: Hybrid (Client-Side + Server Fallback)

**How:** Client-side search for loaded tasks (pending + completed); server-side ILIKE
for archived/historical tasks on demand.

**Pros:**
- Best of both worlds — instant for current tasks, comprehensive for archive
- Encrypted users get client-side search; non-encrypted users also get archive search

**Cons:**
- More complex UX (two search modes or lazy-load archived results)
- Two code paths to maintain

### Option D: External Search Engine (Meilisearch/Typesense)

**How:** Index plaintext tasks into Meilisearch; search against it.

**Pros:**
- Typo-tolerant, fast, relevance-ranked
- Scales to millions of documents

**Cons:**
- New infrastructure dependency (hosting, syncing, cost)
- Cannot index encrypted tasks without breaking E2EE
- Overkill for a personal task manager
- Sync complexity (keep index in sync with DB)

---

## Open Questions

1. **Encryption adoption rate** — What percentage of users have encryption enabled?
   If <5%, server-side search could serve the majority, with client-side as fallback.
   No analytics exist in the codebase to answer this.

2. **Search scope** — Should search include archived tasks? Completed tasks?
   Currently, archived tasks aren't loaded on the dashboard. Including them would
   require either loading them (scale concern) or a server-side endpoint.

3. **Fuzzy vs. exact** — Is substring matching sufficient, or do users expect
   typo-tolerant fuzzy search? Fuzzy requires a library (fuse.js) or trigram search.

4. **Search targets** — Title only? Title + description? Domain names?
   Notes/description search is more expensive and produces noisier results.

5. **Result actions** — What happens when a user selects a search result?
   Navigate to the task? Open it in edit mode? Scroll to it on the dashboard?

6. **Thoughts inclusion** — Should the search include thoughts (tasks with no domain)?
   They're already loaded on the dashboard.

7. **Recurring instances** — Should search match TaskInstance records?
   Instances don't have their own titles (inherited from parent Task).

---

## Recommendation

**Start with Option A (client-side search) and iterate.**

### Rationale

1. **The data is already loaded.** The dashboard fetches all non-archived tasks into memory.
   Adding search on top costs essentially zero — it's just a JavaScript filter.

2. **Encryption compatibility.** Client-side search works identically whether encryption is
   on or off, because decryption happens before search. No compromise on E2EE.

3. **Minimal scope.** One component, one store field, one keyboard shortcut. No backend
   changes, no migration, no API versioning concerns.

4. **User scale fits.** For a personal task manager, even power users are unlikely to exceed
   1,000 active tasks. Client-side search handles this comfortably.

5. **Iterate later.** If users need archived task search or the app grows beyond client-side
   viability, add server-side ILIKE (Option C hybrid) as a v2.

### Suggested Implementation Shape

```
Cmd+K → opens SearchPalette dialog
├── Input field (auto-focused)
├── Results grouped by: Domain → Thoughts → Completed
├── Keyboard navigation (↑/↓ arrows, Enter to select)
├── Selected result → scrolls to task on dashboard or opens detail
└── Escape → closes
```

**Libraries to consider:**
- `fuse.js` (~7KB gzipped) for fuzzy matching with relevance scoring
- Or plain `.includes()` for simplicity — upgrade to fuzzy later if needed

**No backend changes needed for v1.**
