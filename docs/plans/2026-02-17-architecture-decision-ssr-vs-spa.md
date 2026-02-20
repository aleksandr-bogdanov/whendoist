# Architecture Decision: Server-Rendered vs SPA

> **Date:** 2026-02-17
> **Status:** Proposal
> **Context:** Recurring bugs from state inconsistencies between Python/Jinja2 server rendering and vanilla JS client-side DOM manipulation.

---

## The Problem

The app has a **dual-source-of-truth rendering** problem:

1. **Server** (Python/Jinja2) renders the initial HTML with correct task positions, subtask nesting, calendar placement, etc.
2. **Client** (vanilla JS) then manipulates the DOM for every interaction — sort, drag, complete, create subtask, reparent — and must **re-implement the same rendering logic** the server already knows.

Every recent bug confirms this pattern:

| PR | Bug |
|----|-----|
| #314 | JS modules must preserve subtask containers during sort, drag, and count |
| #313 | Completion cascade uses stale subtask relationship |
| #312 | Reparent and promote subtasks |
| #311 | Create subtasks from UI |
| #310 | Expand/collapse subtask containers |

These are all cases where JS had to replicate server-side knowledge about task hierarchy and got it wrong.

**The fix is making rendering logic live in one place.** There are three ways to do that.

---

## Option A: Full SPA (React/Vue/Svelte + Python API)

Move all rendering logic to the frontend. Backend becomes a pure JSON API.

### Pros

- **Single source of truth** for rendering (the frontend)
- Frameworks like React enforce structured state management — when state changes, the UI re-renders correctly *by definition*
- Rich ecosystem: `dnd-kit` for drag-and-drop, component libraries, TypeScript catches bugs at compile time
- ~500 tasks is trivially small for client-side state — no performance concerns
- The backend already has `/api/v1/*` endpoints, so half the work is done
- Claude is excellent at writing React/TypeScript — arguably better than vanilla JS because the patterns are more constrained

### Cons

- **Massive rewrite.** Every template, every JS module, every CSS integration — all redone
- You can't review JS/TS code yourself, so bugs become harder for *you* to spot (though they'd be fewer in total)
- Adds a build step (Vite/webpack), complicates deployment slightly
- Two separate codebases to maintain (API + SPA)
- You lose Jinja2's simplicity for non-dashboard pages (login, settings, etc.)

### Verdict

Solves the core problem definitively, but the migration cost is enormous — probably weeks of work and a period of regression risk.

---

## Option B: HTMX (Keep Python, Eliminate JS Rendering Logic)

Instead of JS replicating server logic, every state change round-trips to the server, which returns re-rendered HTML fragments that HTMX swaps in.

### Pros

- Single source of truth stays in Python (where you're comfortable)
- Minimal JS — most interactions become HTML attributes (`hx-post`, `hx-swap`)
- Incremental adoption — you can migrate one interaction at a time
- No build step, no new framework to learn
- Existing Jinja2 templates mostly stay

### Cons

- **Drag-and-drop, swipe gestures, animations, real-time sorting** — these still need JS regardless. HTMX handles CRUD well but struggles with complex interactions
- Every interaction has a network round-trip. On fast connections it's fine; on slow mobile it feels sluggish
- You'd still need custom JS for the hardest parts (the exact parts that have the most bugs)
- PWA/offline behavior becomes harder

### Verdict

Good for simple apps, but Whendoist has exactly the kind of rich interactions (drag, swipe, sort, expand/collapse) that HTMX handles poorly. It would reduce bugs in simple cases but wouldn't fix the hardest ones.

---

## Option C: Client-Side State Store *(Recommended)*

Keep everything. Add a central `TaskStore` that owns all task state client-side.

The problem isn't the language or the framework — it's that **the JS has no central state**. Each module directly manipulates the DOM based on its own local understanding of the world. When module A moves a task, module B doesn't know the hierarchy changed.

### How It Works

```
Server renders initial HTML (unchanged)
     ↓
On load: tasks JSON hydrates TaskStore
     ↓
User action → update TaskStore → re-render affected DOM from store
     ↓
POST change to API (optimistic update, rollback on failure)
```

### What It Looks Like

```js
// TaskStore.js — single source of truth for client-side task state
window.TaskStore = {
    tasks: {},              // id → task object (with parent_id, children, etc.)

    load(tasksJson) { },    // hydrate from server on page load

    complete(id) {          // update state + cascade to children
        // ONE place that knows completion logic
    },

    reparent(id, newParentId) {   // ONE place that knows hierarchy
    },

    getSubtasks(parentId) { },    // query the store, not the DOM

    onChange(callback) { }        // notify renderers when state changes
};
```

Every module that currently manipulates the DOM for task state would instead call `TaskStore.complete(id)`, and a renderer would update the DOM based on the new store state.

### Pros

- **Smallest migration cost** — keep all templates, all CSS, all existing infrastructure
- **Fixes the root cause:** rendering decisions come from one place (the store), not scattered across modules
- **Incremental:** migrate one operation at a time (start with subtask operations, then sort, then drag)
- The API endpoints already exist
- The store becomes the single source of truth client-side, just like the DB is server-side
- No new framework, no build step, no deployment changes
- Claude can write a `TaskStore` module following the existing IIFE pattern

### Cons

- Still vanilla JS (no TypeScript safety, no component model)
- You're building a mini-framework, which is essentially what React already is
- Over time, if the app keeps growing in complexity, you'll eventually want a real framework anyway

### Verdict

80% of the benefit of an SPA at 20% of the cost. Directly addresses the dual-source-of-truth problem without a rewrite.

---

## Recommendation

**Start with Option C (TaskStore), and if the app keeps growing, migrate to Option A (SPA) later.**

### Rationale

1. **The problem is architectural, not technological.** Switching to React doesn't magically fix bugs — it forces you into a pattern (centralized state → render) that you can adopt with vanilla JS too.

2. **Python/Jinja2 handles the initial render correctly.** An SPA would give up the one part that already works and move everything into JS — the language you can't review.

3. **Migration risk.** A full SPA rewrite means weeks where the app is in a broken intermediate state. The TaskStore approach can be adopted one module at a time with zero downtime.

4. **TaskStore is a stepping stone.** If you later decide you need React, having a centralized store makes that migration much easier — you're replacing the renderer, not rearchitecting state management.

5. **500 tasks is not complex enough to justify React.** React shines with deeply nested component trees, complex shared state across many views, and SSR for SEO. Whendoist is a single-page dashboard with a flat-ish task list.

### Migration Path

| Phase | Scope | Bugs Fixed |
|-------|-------|------------|
| 1 | Build `TaskStore.js`, hydrate from server JSON | Foundation |
| 2 | Migrate subtask operations (create, reparent, promote) | #311, #312 |
| 3 | Migrate completion cascade | #313 |
| 4 | Migrate sort and drag operations | #314 |
| 5 | Migrate expand/collapse | #310 |

Each phase immediately reduces bugs without touching working code.

---

## Encryption Impact Analysis

Whendoist uses **true client-side E2E encryption** — this turns out to be a critical factor in the architecture decision.

### Current Encryption Architecture

| Aspect | Detail |
|--------|--------|
| **Where encryption happens** | Browser only (`static/js/crypto.js`, Web Crypto API, AES-256-GCM) |
| **Server's role** | Stores/returns ciphertext as-is. **Never sees plaintext.** |
| **Encrypted fields** | `Task.title`, `Task.description`, `Domain.name` (3 fields only) |
| **Key storage** | `sessionStorage` (cleared on tab close) |
| **Toggle** | Single global `user.encryption_enabled` flag |
| **Detection** | `looksEncrypted()` — checks if value is 38+ base64 chars |

```
Browser                          Server                        Database
───────                          ──────                        ────────
User types "Buy milk"
    ↓
Crypto.encryptField("Buy milk")
    → "YWJjZGVm..."
        ────── POST ──────→
                             Stores as-is
                                 ──────── INSERT ────────→  "YWJjZGVm..."
                             Returns as-is
        ←───── JSON ───────
    "YWJjZGVm..."
Crypto.decryptField(...)
    → "Buy milk"
    ↓
Renders in DOM
```

### How Encryption Affects Each Option

#### Option A: Full SPA — Natural fit

An SPA is the **architecturally natural** home for E2E encryption:

- The client already owns all encryption/decryption
- An SPA would formalize this: decrypt on fetch, encrypt on save, work with plaintext in between
- The existing `Crypto` module would plug directly into an SPA's data layer
- React/Svelte component state would always hold decrypted data — no risk of rendering ciphertext
- **Bonus:** easier to add features like encrypted search (client-side index) since all data is already client-side

**Encryption verdict: Perfect alignment.** E2E encryption and SPAs are designed for each other.

#### Option B: HTMX — Fundamentally incompatible

HTMX's model is "server renders HTML fragments, client swaps them in." But with E2E encryption:

- The server **cannot render task titles** — it only has ciphertext
- HTMX would swap in HTML containing `YWJjZGVm...` instead of "Buy milk"
- You'd need post-swap JS hooks to find and decrypt every encrypted field in the new HTML
- This defeats the entire purpose of HTMX (minimal JS)
- Every HTMX fragment swap becomes: swap → find encrypted elements → decrypt → re-render
- Race conditions, flash-of-ciphertext, mutation observers — it's a nightmare

**Encryption verdict: Disqualified.** HTMX assumes the server can render final HTML. E2E encryption makes that impossible for encrypted fields.

#### Option C: TaskStore — Clear benefit

The TaskStore approach creates a clean encryption boundary:

```
API response (ciphertext)
    ↓
TaskStore.load() ← decrypt ALL titles/descriptions once
    ↓
Store holds plaintext ← all modules read from here
    ↓
TaskStore.save() → encrypt before sending to API
```

**Benefits over current approach:**

1. **Decrypt once, use everywhere.** Currently, every JS module that touches a task title must independently call `looksEncrypted()` + `Crypto.decryptField()`. Miss one spot → ciphertext flashes on screen. With the store, decryption happens once at the boundary.

2. **No scattered `looksEncrypted()` checks.** The store guarantees plaintext internally. Modules never see ciphertext.

3. **Encryption toggle is trivial.** Enable encryption → `TaskStore.reEncryptAll()` → batch POST. Disable → `TaskStore.decryptAll()` → batch POST. One method, one place.

4. **New features don't need encryption awareness.** A developer (or Claude) adding a new sort method or view doesn't need to think about encryption at all — the store already holds plaintext.

**Encryption verdict: Significant improvement.** Centralizes the encrypt/decrypt boundary instead of scattering it across every module.

### Encryption Summary

| Option | Encryption Compatibility | Key Issue |
|--------|-------------------------|-----------|
| **A: SPA** | Excellent | Natural fit for E2E — client owns everything |
| **B: HTMX** | **Incompatible** | Server can't render decrypted HTML |
| **C: TaskStore** | **Good — clear improvement** | Decrypt once at boundary, not in every module |

This analysis **eliminates Option B entirely** and **strengthens both Options A and C.** The recommendation remains Option C as the pragmatic next step, with Option A as the long-term direction if the app continues to grow in complexity.
