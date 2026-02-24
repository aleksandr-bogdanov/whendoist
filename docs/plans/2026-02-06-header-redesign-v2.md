# Header Redesign V2 — Brand-Aligned Refresh

**Status:** Planned
**Base version:** 0.34.0
**Target version:** 0.35.0
**PR title:** `v0.35.0/feat: Brand-aligned header — spectrum bar, clarity dots, segmented toggle`

## Overview

Four targeted changes to make the task list header distinctively Whendoist instead of generic. No structural rewrites — the two-row header from v0.34.0 stays. These are visual refinements grounded in the brand system.

**Mocks:** `docs/scratchpad/header-redesign-mocks.html`

| Change | What | Complexity | Files |
|--------|------|-----------|-------|
| **A** | Spectrum bar replaces flat border | CSS only | `dashboard.css` |
| **B** | Energy pills clarity-tinted + indicator dots | HTML + CSS + JS | `dashboard.html`, `dashboard.css`, `energy-selector.js` |
| **C** | Segmented view toggle replaces chips | HTML + CSS + JS | `dashboard.html`, `dashboard.css`, `task-list-options.js` |
| **D** | Dot-only clarity in task rows | CSS + token | `dashboard.css`, `tokens.css` |

## Implementation Order

```
Stage 1: D (dot-only clarity)     — CSS, zero risk, independent
Stage 2: A (spectrum bar)         — CSS, one rule, independent
Stage 3: B (energy pills + dots)  — template + CSS + JS
Stage 4: C (segmented toggle)     — template + CSS + JS
Stage 5: PR cleanup               — version, changelog, tests, lint
```

Stages 1–2 are independent. Stages 3–4 both modify `header-row2` in the template, so they run sequentially. Stage 5 is always last.

---

## Stage 1: Dot-Only Clarity in Task Rows

**Goal:** Remove "Clear"/"Defined"/"Open" text from the clarity column. Show only the colored 8px dot. Narrow the column from 80px to 42px to give task titles more space.

### What changes

**`static/css/tokens.css`** — Add a narrower column variable:
```css
--col-clarity: 42px;  /* Was 80px — dot-only needs less */
```

**`static/css/dashboard.css`** — Modify `.meta-clarity` to hide text and enlarge dot:
```css
/* Existing clarity text → hide it */
.meta-clarity {
    font-size: 0;  /* Hide text */
    /* keep: color, justify-content: center */
}

/* Existing ::before dot → bump to 8px */
.meta-clarity::before {
    width: 8px;
    height: 8px;
}
```

Remove the responsive breakpoint code (lines ~2788-2805) that does the same text-hiding at narrow widths — it becomes the default.

Also update the `.header-sort[data-sort="clarity"]` if it needs width adjustment for the narrower column.

### Thinking needed

Minimal. Verify that the grid column in `.header-row1` and `.task-item` both use `var(--col-clarity)` so changing the token propagates everywhere. Check that the responsive breakpoint removal doesn't break anything else in that media query block.

### Prompt

```
Read static/css/tokens.css (line 158, --col-clarity) and static/css/dashboard.css
lines 1668-1686 (meta-clarity styles) and lines 2788-2805 (responsive dot-only).

Change --col-clarity from 80px to 42px in tokens.css.

In dashboard.css, make the dot-only behavior the DEFAULT:
- Set .meta-clarity { font-size: 0; } to hide the text
- Set .meta-clarity::before width/height to 8px
- Remove the responsive @media block (lines 2788-2805) that duplicates
  this behavior at narrow widths — it's now always-on

Verify the grid columns in .header-row1 and .task-item both reference
var(--col-clarity) so the narrower column propagates automatically.

Do NOT change any other CSS. Do NOT touch the impact column.
```

**Model:** Sonnet

---

## Stage 2: Spectrum Bar

**Goal:** Replace the flat `border-bottom: 1px solid var(--border-default)` on `.task-list-header` with a 2px gradient bar using the three clarity colors at 35% opacity.

### What changes

**`static/css/dashboard.css`** — Modify `.task-list-header`:
```css
.task-list-header {
    /* Remove: border-bottom: 1px solid var(--border-default); */
    /* ... keep everything else ... */
}

/* Add spectrum bar via ::after */
.task-list-header::after {
    content: "";
    display: block;
    height: 2px;
    background: linear-gradient(90deg,
        var(--clear-color),
        var(--clarity-defined),
        var(--open-color)
    );
    opacity: 0.35;
}
```

Note: `.task-list-header` already has a `::before` pseudo-element (lines 309-318, the bg panel cover for scroll). The `::after` is available. Verify this.

Dark mode: The clarity color tokens already adjust in dark mode (tokens.css lines 240-242), but verify the gradient looks good against the dark panel bg. May need `opacity: 0.5` in dark mode.

### Thinking needed

Minimal. Check that `::after` isn't already used on `.task-list-header`. Verify the gradient renders correctly with the existing `will-change: transform` on the header. Test dark mode.

### Prompt

```
Read static/css/dashboard.css lines 270-280 (.task-list-header) and
lines 308-318 (the ::before pseudo-element).

Replace the border-bottom on .task-list-header with a ::after pseudo-element:
- height: 2px
- background: linear-gradient(90deg, var(--clear-color), var(--clarity-defined), var(--open-color))
- opacity: 0.35

Remove the existing border-bottom.

For dark mode, check if the gradient needs different opacity. The dark mode
section starts around line 2850. Add a dark mode override if needed
(likely opacity: 0.5 for better visibility on dark backgrounds).

Do NOT change the ::before pseudo-element. Do NOT restructure the header.
```

**Model:** Sonnet

---

## Stage 3: Energy Pills Clarity-Tinted + Indicator Dots

**Goal:** (1) When an energy pill is active, tint its background with the appropriate clarity color instead of flat purple. (2) Add three small clarity-colored dots next to the pills that show which clarity levels are currently visible.

### What changes

**`app/templates/dashboard.html`** (lines 101-109, header-row2):

Add clarity dots markup after the pills container:
```html
<div class="header-energy__pills">
    <!-- existing pills unchanged -->
</div>
<div class="clarity-dots" id="clarity-dots">
    <span class="cdot cdot-clear"></span>
    <span class="cdot cdot-defined"></span>
    <span class="cdot cdot-open"></span>
</div>
```

**`static/css/dashboard.css`** — Modify energy pill active states + add dot styles:

Replace the single `.energy-wrapper .energy-pill.active` rule (line 57-60) with three clarity-specific rules:
```css
/* Replace flat purple with clarity tints */
.energy-pill.active[data-energy="1"] {
    background: var(--clear-tint);
    box-shadow: 0 0 0 1px rgba(22, 123, 255, 0.25);
}
.energy-pill.active[data-energy="2"] {
    background: var(--clarity-defined-tint);
    box-shadow: 0 0 0 1px rgba(109, 94, 246, 0.25);
}
.energy-pill.active[data-energy="3"] {
    background: var(--open-tint);
    box-shadow: 0 0 0 1px rgba(160, 32, 192, 0.25);
}
```

Add clarity dots CSS:
```css
.clarity-dots {
    display: flex;
    align-items: center;
    gap: 3px;
}

.cdot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    transition: opacity 0.2s ease;
}

.cdot-clear { background: var(--clear-color); }
.cdot-defined { background: var(--clarity-defined); }
.cdot-open { background: var(--open-color); }

.cdot.off { opacity: 0.12; }
```

Dark mode: The tint tokens and color tokens already have dark mode overrides in tokens.css. The `box-shadow` ring color may need an override. Check visibility.

**`static/js/energy-selector.js`** — Add dot state management:

In the `setEnergy(level)` function, after updating the pill active states, update the dots:
```javascript
function updateClarityDots(level) {
    const dots = document.getElementById('clarity-dots');
    if (!dots) return;
    const [blue, purple, magenta] = dots.children;
    blue.classList.remove('off');
    purple.classList.toggle('off', level < 2);
    magenta.classList.toggle('off', level < 3);
}
```

Call `updateClarityDots(level)` inside `setEnergy()`. Also call it in `init()` for initial state.

### Thinking needed

Moderate. The energy-selector.js is an IIFE — need to add the dot update inside it without breaking the module pattern. The pill active state currently uses a single `.active` class — the CSS change uses `[data-energy]` attribute selectors which are already on the pills, so no HTML changes needed for the tints. The dots are new HTML + CSS + a few lines of JS.

Also note: task-list-options.js line 315 calls `window.EnergySelector.applyFilter()` which currently doesn't exist (it's an internal function). This is a pre-existing bug — do NOT fix it here unless it causes problems during testing.

### Prompt

```
Implement clarity-tinted energy pills and clarity indicator dots.

READ FIRST (understand before changing):
- app/templates/dashboard.html lines 100-109 (header-row2, energy pills)
- static/css/dashboard.css lines 10-78 (energy selector styles)
- static/js/energy-selector.js (entire file)

TEMPLATE CHANGE (dashboard.html):
After the .header-energy__pills div (around line 108), add:
<div class="clarity-dots" id="clarity-dots">
    <span class="cdot cdot-clear"></span>
    <span class="cdot cdot-defined"></span>
    <span class="cdot cdot-open"></span>
</div>

CSS CHANGES (dashboard.css):
1. Replace .energy-wrapper .energy-pill.active (lines 57-60) with three
   data-energy-specific rules using clarity tints:
   - [data-energy="1"]: background var(--clear-tint), ring rgba(22,123,255,0.25)
   - [data-energy="2"]: background var(--clarity-defined-tint), ring rgba(109,94,246,0.25)
   - [data-energy="3"]: background var(--open-tint), ring rgba(160,32,192,0.25)
   Ring = box-shadow: 0 0 0 1px <color>

2. Add .clarity-dots, .cdot, .cdot-clear/defined/open, .cdot.off styles
   (6px dots, gap 3px, .off = opacity 0.12)

3. Update dark mode equivalents (around line 62-78). The tint tokens already
   have dark mode values in tokens.css. Just verify the ring colors work.

JS CHANGE (energy-selector.js):
Inside the IIFE, add a function updateClarityDots(level) that:
- Gets #clarity-dots element
- Sets .off class on dots based on level (1=only first, 2=first two, 3=all)
Call it from setEnergy() and from init().

Do NOT change the pill HTML structure. Do NOT change the data-energy attributes.
Do NOT modify task-list-options.js in this stage.
```

**Model:** Sonnet

---

## Stage 4: Segmented View Toggle

**Goal:** Replace the three floating view chips (`📅 Sched`, `✓ Done`, `🗑`) with a segmented control containing "Scheduled" and "Completed" buttons inside a track, plus a separate trash icon button.

### What changes

**`app/templates/dashboard.html`** (lines 111-115):

Replace:
```html
<div class="view-chips">
    <button type="button" class="view-chip..." id="chip-sched" ...>📅 Sched</button>
    <button type="button" class="view-chip..." id="chip-done" ...>✓ Done</button>
    <button type="button" class="view-chip chip-delete" id="chip-deleted">🗑</button>
</div>
```

With:
```html
<div class="view-toggle">
    <div class="view-seg-track">
        <button type="button" class="view-seg-btn{% if user_prefs.show_scheduled_in_list %} active{% endif %}"
                id="chip-sched"
                aria-pressed="{{ 'true' if user_prefs.show_scheduled_in_list else 'false' }}">
            <span class="view-seg-icon">📅</span> Scheduled
        </button>
        <button type="button" class="view-seg-btn{% if user_prefs.show_completed_in_list %} active{% endif %}"
                id="chip-done"
                aria-pressed="{{ 'true' if user_prefs.show_completed_in_list else 'false' }}">
            <span class="view-seg-icon">◆</span> Completed
        </button>
    </div>
    <button type="button" class="view-trash-btn" id="chip-deleted">🗑</button>
</div>
```

**Keep the same IDs** (`chip-sched`, `chip-done`, `chip-deleted`) so the JS handlers in `task-list-options.js` continue to work without changes. The JS uses `classList.toggle('active')` and `setAttribute('aria-pressed')` which work with any class name.

**`static/css/dashboard.css`** — Replace `.view-chips` / `.view-chip` styles (lines 460-524):

Remove all `.view-chip*` rules. Add:
```css
.view-toggle {
    display: flex;
    align-items: center;
    gap: 6px;
}

.view-seg-track {
    display: flex;
    gap: 2px;
    padding: 2px;
    background: var(--border-subtle);
    border: 1px solid var(--border-default);
    border-radius: 7px;
}

.view-seg-btn {
    height: 22px;
    padding: 0 10px;
    border: none;
    border-radius: 5px;
    background: transparent;
    font-size: 0.6rem;
    font-weight: 550;
    color: var(--text-muted);
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 4px;
    transition: all 0.15s ease;
    white-space: nowrap;
}

.view-seg-btn:hover {
    background: rgba(15, 23, 42, 0.03);
    color: var(--text-primary);
}

.view-seg-btn.active {
    background: var(--interactive-active);
    color: var(--purple-600, #5B4CF0);
    font-weight: 600;
}

.view-seg-icon {
    font-size: 0.55rem;
    opacity: 0.7;
}

.view-seg-btn.active .view-seg-icon {
    opacity: 1;
}

.view-trash-btn {
    width: 24px;
    height: 22px;
    border: 1px solid var(--border-default);
    border-radius: 5px;
    background: transparent;
    font-size: 0.6rem;
    color: var(--text-muted);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s ease;
}

.view-trash-btn:hover {
    border-color: rgba(220, 38, 38, 0.3);
    color: #DC2626;
    background: rgba(220, 38, 38, 0.04);
}
```

Dark mode overrides for the new classes (replace the old `.view-chip` dark mode rules around lines 513-524).

**`static/js/task-list-options.js`** — Minimal changes:

The JS references elements by ID (`chip-sched`, `chip-done`, `chip-deleted`) and toggles the `.active` class. Since we keep the same IDs and the same `.active` class convention, the JS handler logic should work unchanged. Verify by reading the handler code.

The only potential issue: if the JS uses `.view-chip` as a selector anywhere. Search the file for `view-chip` — if found, update to `view-seg-btn`.

### Thinking needed

Moderate. The main risk is that task-list-options.js references `.view-chip` by class name somewhere (not just by ID). Need to verify. Also need to ensure the `.active` class on delete chip (`chip-deleted`) works — currently it has special red styling. The new trash button doesn't use `.active` for visual state (it's a mode switch), but the JS may set it. Check `showDeletedTasks()`.

### Prompt

```
Replace view chips with segmented toggle.

READ FIRST:
- app/templates/dashboard.html lines 111-115 (current view chips)
- static/css/dashboard.css lines 460-524 (view chip styles)
- static/js/task-list-options.js — search for ALL references to:
  'view-chip', 'chip-sched', 'chip-done', 'chip-deleted', 'chip-delete'
  Understand how the JS interacts with these elements before changing HTML.

TEMPLATE (dashboard.html):
Replace the .view-chips div (lines 111-115) with the segmented toggle.
CRITICAL: Keep the same element IDs (chip-sched, chip-done, chip-deleted)
so the JS handlers continue to work. Use .active class (same as current).

New structure:
.view-toggle > .view-seg-track > .view-seg-btn#chip-sched + .view-seg-btn#chip-done
             > .view-trash-btn#chip-deleted

Full words: "Scheduled" and "Completed" (not "Sched" / "Done").
Icons: 📅 for scheduled, ◆ for completed, 🗑 for trash.

CSS (dashboard.css):
Remove ALL .view-chip* rules (lines 460-524 and dark mode ~513-524).
Add .view-toggle, .view-seg-track, .view-seg-btn, .view-seg-icon,
.view-trash-btn with styles from the plan document.
Add dark mode overrides.

JS (task-list-options.js):
Search for any CSS class references ('view-chip', 'chip-delete').
If found, update to new class names ('view-seg-btn', 'view-trash-btn').
If only IDs are used, no JS changes needed.

The showDeletedTasks() function adds .active to #chip-deleted — verify this
still makes sense with the new trash button (it should just change color,
not add a purple tint). Add a .view-trash-btn.active rule if needed with
red styling instead of purple.
```

**Model:** Sonnet

---

## Stage 5: PR Cleanup

**Goal:** Bump version, update lockfile, update changelog, run full checks, create PR.

### What changes

1. **`pyproject.toml`** — Bump version to `0.35.0`
2. **`uv lock`** — Sync lockfile
3. **`CHANGELOG.md`** — Add entry:

```markdown
## [0.35.0] - 2026-02-XX — Brand-Aligned Header Refresh

### Changed
- **Spectrum bar** — gradient border (blue → purple → magenta) replaces flat grey border on task list header
- **Clarity-tinted energy pills** — active energy pill background uses clarity color tints instead of flat purple; three indicator dots show which clarity levels are visible
- **Segmented view toggle** — "Scheduled" / "Completed" in a contained track replaces floating "Sched" / "Done" chips; trash icon separated as standalone button
- **Dot-only clarity** — task row clarity column shows only the colored dot (no text label); column narrows from 80px to 42px
```

4. **Run full checks:** `uv run ruff format . && uv run ruff check . && uv run pyright app/ && just test`
5. **Update `test_js_module_contract.py`** if any JS module exports changed
6. **Create PR** with title `v0.35.0/feat: Brand-aligned header — spectrum bar, clarity dots, segmented toggle`

### Prompt

```
Final PR cleanup for the header redesign v2.

1. Bump version in pyproject.toml to 0.35.0
2. Run: uv lock
3. Update CHANGELOG.md — add a [0.35.0] entry at the top following the
   existing format. Describe the four changes: spectrum bar, clarity-tinted
   energy pills with dots, segmented view toggle, dot-only clarity.
4. Run the full check suite:
   uv run ruff format . && uv run ruff check . && uv run pyright app/ && just test
5. If test_js_module_contract.py tests fail due to changed exports or
   class names, update the test expectations.
6. Fix any lint/format/type errors.
7. Create a PR branch and push. PR title:
   v0.35.0/feat: Brand-aligned header — spectrum bar, clarity dots, segmented toggle
```

**Model:** Sonnet

---

## Files Changed (Complete List)

| File | Stage | Change |
|------|-------|--------|
| `static/css/tokens.css` | 1 | `--col-clarity: 42px` |
| `static/css/dashboard.css` | 1, 2, 3, 4 | Clarity dot-only, spectrum bar, energy tints + dots, segmented toggle |
| `app/templates/dashboard.html` | 3, 4 | Clarity dots markup, segmented toggle markup |
| `static/js/energy-selector.js` | 3 | `updateClarityDots()` function |
| `static/js/task-list-options.js` | 4 | Class name updates (if needed) |
| `tests/test_js_module_contract.py` | 5 | Update if exports changed |
| `pyproject.toml` | 5 | Version bump |
| `uv.lock` | 5 | Lockfile sync |
| `CHANGELOG.md` | 5 | New entry |

## Risk Assessment

| Change | Risk | Mitigation |
|--------|------|------------|
| Dot-only clarity | Low — CSS-only, no logic change | Responsive code already does this |
| Spectrum bar | Very low — decorative ::after | No functional impact |
| Energy tints + dots | Low — additive HTML/CSS, small JS addition | Same pill size, same IDs |
| Segmented toggle | Medium — touches JS handler targets | Keep same IDs, verify all class refs |

## Design Reference

- **Mocks:** `docs/scratchpad/header-redesign-mocks.html`
- **Brand system:** `BRAND.md`, `docs/brand/COLOR-SYSTEM.md`, `docs/brand/UI-KIT.md`
- **Tokens:** `static/css/tokens.css`
- **Previous redesign:** `docs/TASK-LIST-HEADER-REDESIGN.md`
