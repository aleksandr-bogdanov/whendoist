---
version:
pr:
created: 2026-02-24
---

# Task Dashboard UX Review — Pass 2

Second-pass visual/UX review after initial cleanup (sort controls moved to column headers,
removed dual gradients, removed redundant energy dots, removed Quick button, increased
section hierarchy separation).

---

## 1. Column Header Row

**Alignment is good on leaf tasks, breaks on parent tasks.** When a task shows
Clarity pill + Duration + Impact (e.g., the Вольер tasks), the three column headers
map cleanly to the data below. That works.

**But parent tasks break the contract.** Parent tasks show progress counters like
`3/3 ⏱ 6h/6h` or `1/6 2h/13h15m` under those same columns. These don't correspond
to CLARITY/DURATION/IMPACT at all. The header row promises a grid; parent tasks
violate it.

**Orphaned headers in collapsed state.** When all domains are collapsed,
CLARITY/DURATION/IMPACT float above domain group rows that show zero columns. The
headers label nothing. They only become useful after expanding a domain or scrolling
to Scheduled. In the default collapsed view, they're visual noise.

**Typography is appropriately subtle.** All-caps, light gray weight succeeds at
"orient without dominating." No complaints.

**Sticky behavior looks clean.** No double borders, no background bleed.

---

## 2. Toolbar Balance

**The toolbar is lopsided.** Three small energy icons on the far left, one prominent
dark button on the far right, canyon of dead space between. Visual weight is ~20/80
right-heavy. On wide desktop this is very noticeable.

The "ENERGY" label in the same all-caps gray as column headers creates a nice
stylistic link, but it's so small and left-flushed that it reads as an orphaned label.

**This is the emptiest horizontal band on the page.** When everything below has dense
content, the toolbar strip reads as a gap. Consider: center the energy selector,
reduce toolbar height, or add read-only info (task count, today's focus summary)
center without adding clutter.

---

## 3. Section Breaks

**The differentiation works.** Scheduled/Completed/Deleted have clearly more vertical
breathing room than domain-to-domain transitions. The `mt-6 pt-4` treatment creates a
visible "chapter break." Well-calibrated.

**Section headers vs. domain headers compete.** "Scheduled" (gear icon, ~16px semibold)
and "Вольер" (emoji, ~16px semibold) are at nearly identical typographic weight.
Sections are structural; domains are content-level. The hierarchy should reflect that.
Options: slightly larger section headers, different font weight, or full-width hairline
rule above sections.

**Date group labels ("Today", "Sun", "Tue") are nicely quiet.** Clearly subordinate to
both section headers and task titles.

---

## 4. Overall Cohesion

### Color Channels — Still Too Many

9 independent color systems in play:

1. Energy toggle icons (3 states, each colored)
2. Clarity pills (orange "Brainstorm", green "Autopilot", gray dash)
3. Impact text (red "High", olive/yellow "Mid", green "Low", gray "Min")
4. Left border accents on tasks (orange, red, pink — meaning unclear)
5. Domain emoji (each domain's icon)
6. Calendar event colors (yellow, green, olive, red/pink)
7. Completed green checkmarks
8. "Plan My Day" coral/red button
9. Navbar gradient logo (purple)

**Impact colors (red/green/yellow) and Clarity pill colors (orange/green) use
overlapping hues for unrelated meanings.** Adjacent columns, easily confused. Left-border
colors add a third color stream in the same visual zone.

### Left vs. Right Panel Disconnect

The task panel is structured, card-based, with clear vertical rhythm. The calendar panel
is freeform, colorful, with its own typography conventions. No shared design language —
no common card style, shared accent color, or mirrored spacing rhythm.

### Typography Hierarchy

Mostly sound but the middle tier is crowded — domain names, section headers, and parent
task titles all sit at ~15px semibold. Navbar → domain names: clear jump. Section
headers → date groups: clear jump. But the middle is undifferentiated.

---

## 5. What You're Not Seeing

### Mobile: Content Renders Below Bottom Tab Bar (BUG)

The Completed section and its task appear *beneath* the fixed bottom navigation
(Thoughts/Tasks/+/Analytics/Settings). User has to scroll past the tab bar to see it.
Either bottom padding is insufficient or sections need to be above the tab bar's scroll
boundary. **Functional bug, not cosmetic.**

### Left Task-Border Colors Have No Legend

Every task row has a colored left border (orange, red, pink, purple). The meaning is
never surfaced. For a new user, they're attractive but meaningless — decoration that
looks like it should be information.

### "Plan My Day" Is the Loudest Element on the Page

Filled coral/red button with sparkle icon in the calendar panel top-right. Draws the
eye before anything in the task panel. If the task list is primary, the most prominent
CTA shouldn't be in the secondary panel. Consider toning down (outline style, or muted
until hovered).

### ANYTIME Pill Row Is Dense and Truncated

Four truncated task names in small pills, wrapping to two lines. Hard to read and
doesn't match the style of anything else — not task list cards, not calendar event
blocks. A third visual language.

### Subtask Indentation on Mobile Eats Too Much Width

Subtasks indented ~40px from left edge of an already narrow viewport. Completed subtask
text + strikethrough + indentation leaves very little room for readable task names.

---

## Top 3 Priority Fixes

1. **Mobile bottom-nav overlap** — functional bug, content is hidden
2. **Parent task metadata breaks column alignment** — header row promises a grid that
   parent rows (with progress counters) don't keep
3. **Color channel consolidation** — pick one color system for task metadata (either
   impact or clarity gets color, the other goes monochrome) and ensure left-border
   colors map to something the user already knows
