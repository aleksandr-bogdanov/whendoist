# Architecture Review: Whendoist

> **Date:** 2026-02-17
> **Reviewer:** Claude (Senior Web Architect perspective)
> **Input:** [ARCHITECTURE-DECISION.md](ARCHITECTURE-DECISION.md) + developer friend feedback

---

## 1. Current Architecture Rating: 4/10

**What's working:**
- Server routing for simple pages (login, settings) — Jinja2 is fine here
- Initial deployment simplicity (no build step)
- The API endpoints already exist at `/api/v1/*`
- CSS architecture is solid (custom properties, responsive design)

**What's fundamentally broken:**
- **You're fighting the architecture.** The app is a highly interactive dashboard with drag-and-drop, swipe gestures, subtask hierarchy, sort/filter, expand/collapse — this is an *application*, not a *document*. Jinja2 was designed for documents.
- **Encryption nullifies SSR's main advantage.** The server renders ciphertext. Then JS decrypts and replaces it. You're doing the rendering work *twice* — once on the server (wrong), once on the client (right). SSR is literally wasted effort for encrypted fields.
- **No component model.** Each IIFE module is an island. When `TaskDrag.js` moves a task, `TaskSubtask.js` doesn't know the hierarchy changed because there's no shared contract. You've documented this exact problem in PRs #310-#314.
- **Manual DOM manipulation doesn't scale.** Every new feature requires writing imperative `createElement` / `querySelector` / `appendChild` chains. This is exactly the code pattern that React was invented to eliminate in 2013.

---

## 2. Option Ratings

| Dimension | A: Full SPA | B: HTMX | C: Vanilla Store |
|-----------|:-----------:|:-------:|:----------------:|
| **Fitness for problem** | 9 | 2 | 5 |
| **Migration cost/risk** | 4 | 5 | 8 |
| **Long-term maintainability** | 9 | 3 | 4 |
| **AI code suitability** | 9 | 5 | 5 |
| **Weighted total** | **7.8** | **3.5** | **5.3** |

### Option A: Full SPA — 9/9/4/9

**Fitness (9):** Solves every stated problem. Single source of truth, component isolation, declarative rendering. E2E encryption fits naturally — decrypt into state, render from state, encrypt on save. The `dnd-kit` library alone would eliminate hundreds of lines of custom drag code.

**Migration cost (4):** The document is honest about this: weeks of work, regression risk. But I'll challenge the framing — the current approach is *also* costing weeks of work, it's just spread across endless bug-fix PRs (#310, #311, #312, #313, #314 — five PRs just for subtask operations).

**Maintainability (9):** TypeScript + components + established patterns. Every new feature follows the same recipe: define state, write component, connect to store. Claude doesn't need to figure out which DOM nodes to mutate.

**AI suitability (9):** LLMs write better React/TypeScript than vanilla JS. The patterns are more constrained — there are fewer ways to write a React component than to manipulate a DOM tree. TypeScript catches mismatches at compile time, which is critical when AI writes all code.

### Option B: HTMX — 2/5/3/5

The document correctly identifies this as incompatible with E2E encryption. HTMX is designed for server-rendered CRUD applications. Whendoist is a client-side interactive application that happens to have a server. **Eliminated.**

### Option C: Vanilla JS Store — 5/8/4/5

**Fitness (5):** Addresses *centralized state* but not *declarative rendering*. After `TaskStore.complete(id)`, you still need imperative code to:
- Find the DOM element
- Add the `completed` CSS class
- Move it to the completed section
- Update the subtask count badge
- Animate the transition
- Remove it from the drag sort order

The store tells you *what* changed. You still have to manually figure out *how* to update the DOM. This is the hard part. This is where the bugs live.

**Migration cost (8):** Genuinely low. But low cost for low benefit is not a good trade.

**Maintainability (4):** You're now maintaining a custom state management framework in vanilla JS without types. When bugs occur (and they will — the DOM manipulation code is unchanged), debugging requires understanding both the store AND the imperative rendering code. You've added a layer without removing the problematic one.

**AI suitability (5):** The TaskStore itself is easy for Claude to write. But every feature still requires bespoke DOM manipulation code — the exact code that's causing bugs today. The store doesn't make that code easier to write or review.

---

## 3. Framework-Agnostic Recommendation (Ignoring Developer Background)

If recommending purely on technical merit, with an AI writing all code:

**Svelte (or SvelteKit) with TypeScript. Not React. Not vanilla JS.**

Rationale:

1. **Svelte compiles away.** No virtual DOM overhead, tiny bundle — critical for a PWA. The output is vanilla JS, so you're not shipping a framework to the client.

2. **Svelte's reactivity model is simpler than React's.** No `useEffect` dependency arrays, no stale closure bugs, no `useMemo`/`useCallback` dance. State mutation just works: `task.completed = true` → UI updates. This matters enormously for AI-generated code — fewer footguns means fewer bugs.

3. **Svelte components read like enhanced HTML.** A developer who can read Jinja2 templates can read Svelte components. React's JSX-heavy style is a bigger cognitive jump.

4. **SvelteKit handles the full stack.** You could keep FastAPI as the API backend and use SvelteKit purely for the frontend, or eventually migrate server routes too. But you don't have to decide now.

5. **LLMs write excellent Svelte.** Smaller API surface, less boilerplate, more deterministic patterns.

If not Svelte, then **Preact** — it's 3KB, API-compatible with React, and can be used *without a build step* via HTM (tagged template literals). This means you could start using components *today* inside existing Jinja2 pages.

---

## 4. Missing Options

The document presents a false trichotomy. Several approaches were missed:

### Preact + HTM (No Build Step) — The Pragmatic Bridge
```html
<!-- Works TODAY in a Jinja2 template, no build step -->
<script type="module">
  import { h, render } from 'https://esm.sh/preact';
  import { useState } from 'https://esm.sh/preact/hooks';
  import htm from 'https://esm.sh/htm';
  const html = htm.bind(h);

  function TaskList({ tasks }) {
    const [items, setItems] = useState(tasks);
    return html`<ul>${items.map(t =>
      html`<li onClick=${() => complete(t.id)}>${t.title}</li>`
    )}</ul>`;
  }

  render(html`<${TaskList} tasks=${window.__TASKS__} />`,
    document.getElementById('task-list'));
</script>
```

This gives you components, virtual DOM diffing, and hooks with **zero build infrastructure changes**. Migrate one section at a time. When you outgrow CDN imports, add Vite (one config file).

### Alpine.js — A Better Option C
If the goal is "add reactivity without a framework migration," Alpine.js does what Option C proposes but *already built and tested*:
```html
<div x-data="taskStore()" x-init="load()">
  <template x-for="task in tasks">
    <div x-show="!task.completed" @click="complete(task.id)">
      <span x-text="task.title"></span>
    </div>
  </template>
</div>
```
Reactive state, declarative rendering, 15KB, no build step. But it tops out at moderate complexity — drag-and-drop and animations push its limits.

### Islands Architecture (Astro / Manual)
Keep Jinja2 for the page shell. Mount framework components (Svelte/Preact) only on interactive sections (task list, calendar). The static parts remain server-rendered HTML. This is the lowest-risk path to a real framework.

### The Friend's Suggestion: Separated Frontend + OpenAPI Codegen

The friend's advice is architecturally correct and particularly valuable for a vibecoded project:

```
FastAPI (auto-generates OpenAPI spec)
    ↓
openapi-typescript-codegen (generates TypeScript types + API client)
    ↓
React/Svelte frontend (type-safe API calls, impossible to use wrong field names)
```

The codegen point is underrated. When Claude writes API calls, TypeScript generated from the OpenAPI spec means **the compiler catches mismatches between frontend and backend**. This is a huge win for AI-generated code — you get a machine-verifiable contract.

However, skip Docker Compose and Next.js. Docker adds local dev complexity for no gain (Railway handles deployment). Next.js SSR is pointless when content is encrypted — the server can't render anything useful.

**Simpler version of the friend's advice:** Same repo, Vite + Svelte frontend, FastAPI backend, shared OpenAPI types. No Docker, no Next.js, no BFF.

---

## 5. Challenging the Recommendation: Is Option C a Stepping Stone or a Dead End?

**It's a dead end. Here's why.**

### The Store Is the Easy Part

The document frames the problem as "JS has no central state." That's true, but it's only half the problem. The other half is: **JS has no declarative rendering**.

A TaskStore tells every module *what* the current state is. Great. But every module still has to imperatively update the DOM:

```js
// WITH TaskStore — the "after" state
TaskStore.onChange((action, data) => {
  if (action === 'complete') {
    const el = document.querySelector(`[data-task-id="${data.id}"]`);
    el.classList.add('completed');
    el.querySelector('.checkbox').checked = true;
    const subtaskCount = el.closest('.subtask-container')
      ?.querySelector('.subtask-count');
    if (subtaskCount) {
      subtaskCount.textContent = TaskStore.getSubtasks(data.parentId)
        .filter(t => !t.completed).length;
    }
    // Move to completed section...
    // Update drag sort order...
    // Animate...
  }
});
```

Compare with a framework:

```svelte
<!-- WITH Svelte — same feature -->
{#each tasks.filter(t => !t.completed) as task}
  <TaskItem {task} on:complete={complete} />
{/each}
```

The Svelte version can't have the bug. There's no DOM node to forget to update. When state changes, the framework figures out what DOM operations are needed. This is the fundamental insight that Option C misses.

### Option C Doesn't Reduce Migration Cost to Option A

The document claims Option C is a "stepping stone" to Option A. But what do you actually reuse?

| Component | Reusable in Option A? |
|-----------|:--------------------:|
| TaskStore state shape | Partially — but React/Svelte has its own state management |
| Store's onChange listeners | No — replaced by reactive components |
| DOM manipulation code | No — replaced by JSX/templates |
| Event handler wiring | No — replaced by component event binding |
| CSS | Yes — mostly |
| API endpoints | Yes — fully |
| Jinja2 templates | No — replaced by components |

You reuse the API and the CSS. That's it. The entire TaskStore and its rendering logic get thrown away. **Option C is not a stepping stone — it's a detour.**

### The Total Effort Calculation

```
Option C then A:  [Build store] + [Migrate 5 phases to store] + [Maintain store]
                  + [Build SPA] + [Migrate 5 phases to SPA] + [Delete store]
                  = ~2x the migration work

Direct to SPA:    [Build SPA] + [Migrate 5 phases to SPA]
                  = 1x the migration work
```

Option C only makes sense if you believe you'll **never** need Option A. If the app's complexity stays constant and no new interaction patterns are needed, the store might be enough. But the app has shipped five subtask-related PRs in rapid succession — complexity is clearly *increasing*.

### Actual Recommendation

**Skip Option C. Migrate directly to Svelte + TypeScript with Vite.**

Migration path:

| Phase | What | Risk |
|-------|------|------|
| 0 | Set up Vite + Svelte + TS in `/frontend`. FastAPI serves the built SPA at `/`. Keep Jinja2 pages at their existing routes. | Zero — nothing changes for users |
| 1 | Build `TaskList` component reading from existing `/api/v1/tasks`. Mount it on the dashboard only. Keep all other pages as Jinja2. | Low — one page, side-by-side comparison |
| 2 | Move subtask operations into Svelte (create, reparent, promote, expand/collapse) | Medium — eliminates #310-#312 |
| 3 | Move completion cascade, sort, drag into Svelte | Medium — eliminates #313-#314 |
| 4 | Move calendar view, remaining interactions | Low — patterns established |
| 5 | Migrate login/settings to Svelte (optional — Jinja2 is fine for these) | Low |

Each phase ships independently. The Jinja2 dashboard and Svelte dashboard can coexist during migration (feature flag or A/B). If Phase 1 goes poorly, you revert one route and lose nothing.

**Why this works for vibecoding:** Claude writes excellent Svelte. TypeScript catches bugs at compile time. Components enforce isolation. The OpenAPI spec from FastAPI can generate TypeScript types automatically. Every feature follows the same pattern: define state → write component → connect to API. There's no "figure out which DOM nodes to update" step.

**Why this is less risky than it sounds:** You already have the API. The hardest part of an SPA migration is building the backend API — and it's done. The frontend is "just" building components that call existing endpoints. For an AI that writes all code, this is straightforward.

---

## Summary

| | Rating | Verdict |
|---|:---:|---|
| Current architecture | **4/10** | Fighting the architecture on every feature |
| Option A: Full SPA (React) | **7.8/10** | Right solution, slightly over-specified (React is heavier than needed) |
| Option B: HTMX | **3.5/10** | Eliminated by encryption requirement |
| Option C: Vanilla Store | **5.3/10** | Solves half the problem, dead-end for the other half |
| **Alt: Svelte + TS + Vite** | **8.5/10** | Right-sized framework, direct migration, no throwaway work |

The document is well-written and correctly identifies the problem. But it underestimates Option C's limitations (no declarative rendering) and overestimates its value as a stepping stone (almost nothing carries forward to a real framework). The recommendation should be: **migrate directly to a lightweight framework, one page at a time.**
