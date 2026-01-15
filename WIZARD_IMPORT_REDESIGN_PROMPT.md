# Wizard Import Step Redesign Prompt

## Context

You are redesigning Step 5 (Todoist Import) of the Whendoist onboarding wizard. The current implementation shows basic import results, but users need more detailed feedback especially when items are skipped (duplicates) or need attention.

## Current Wizard Stack

- **Framework**: Vanilla JS class (`WhenWizard` in `static/js/wizard.js`)
- **Styling**: CSS in `static/css/wizard.css`
- **Design system**: Uses CSS custom properties from `static/css/app.css`:
  - `--primary`: #6D5EF6 (purple)
  - `--text`, `--text-muted`, `--text-faint`
  - `--light-bg`, `--grey-bg`, `--dark-bg`
  - `--border`, `--border-hair`, `--border-strong`
- **Mobile-first**: Base styles for mobile, media queries for tablet (600px+) and desktop (900px+)

## Current Step 5 States

### State 1: Source Selection (Not Connected)
Shows Todoist logo, "Connect Todoist" button, and "Start fresh instead" ghost link.

### State 2: Connected (Ready to Import)
Shows checkmark, "Todoist Connected" message, "Import Tasks" button.

### State 3: Import Complete
Current implementation (needs redesign):
```html
<div class="wizard-import-complete">
    <div class="wizard-import-success-icon">✓</div>
    <div class="wizard-stat-cards">
        <div class="wizard-stat-card">
            <div class="wizard-stat-value">{tasksImported}</div>
            <div class="wizard-stat-label">tasks</div>
        </div>
        <div class="wizard-stat-card">
            <div class="wizard-stat-value">{projectsImported}</div>
            <div class="wizard-stat-label">projects</div>
        </div>
    </div>
    <p class="wizard-import-complete-note">
        Your Todoist projects are now Domains.
        Rename or reorganize them anytime.
    </p>
</div>
```

## API Response Data

The `/api/import/todoist` endpoint returns:
```typescript
{
    success: boolean;
    domains_created: number;      // Projects → Domains
    domains_skipped: number;      // Already imported
    tasks_created: number;        // New tasks imported
    tasks_skipped: number;        // Already imported (duplicates)
    tasks_completed: number;      // Completed tasks (for analytics)
    parents_flattened: number;    // Parent tasks merged into subtasks
    tasks_need_clarity: number;   // Tasks without clarity label
    errors: string[];             // Any errors during import
}
```

## Design Requirements

### Primary Display (Always Visible)
1. **Success indicator** - Green checkmark or similar
2. **Main stats** - Tasks and domains created (current stat cards are good)
3. **Brief note** - "Your Todoist projects are now Domains"

### Secondary Details (Collapsed by Default)
Create a collapsible "Details" or "Import Log" section that shows:

1. **Skipped items** (if any):
   - "X tasks already imported (skipped)"
   - "X domains already imported (skipped)"

2. **Completed tasks** (if imported):
   - "X completed tasks imported for analytics"

3. **Parent tasks flattened** (if any):
   - "X parent tasks merged with subtasks"

4. **Tasks needing attention** (if any):
   - "X tasks need clarity levels assigned"
   - This is actionable info - maybe a subtle link to dashboard?

5. **Errors** (if any):
   - Show in red/warning style
   - List each error message

### Interaction Pattern
- Clicking "Show details" / "Hide details" toggles the section
- Use chevron or similar to indicate expandable
- Animate expand/collapse smoothly (CSS transitions)

### Visual Style Reference (from Settings)
The settings page import shows logs like:
```
✓ Imported 171 tasks, 7 domains
📊 Imported 45 completed tasks for analytics
⊘ 23 already imported (skipped)
⚠ 12 tasks need clarity levels
```

But for the wizard, make it **nicer and more visual**:
- Use subtle backgrounds for each detail row
- Icons/emojis for each category
- Muted colors, don't overwhelm the success state
- Consider a compact pill/tag style for numbers

## CSS Classes Available

From wizard.css you can use/extend:
- `.wizard-card` - Card container
- `.wizard-stat-card`, `.wizard-stat-value`, `.wizard-stat-label` - Stats display
- `.wizard-import-complete` - Complete state container
- `.wizard-import-success-icon` - Success checkmark
- `.wizard-section-title` - Small uppercase label

## Example Mockup Structure

```
┌─────────────────────────────────────────┐
│              ✓ (big green)              │
│                                         │
│    ┌─────────┐     ┌─────────┐          │
│    │   171   │     │    7    │          │
│    │  tasks  │     │ domains │          │
│    └─────────┘     └─────────┘          │
│                                         │
│  Your Todoist projects are now Domains. │
│  Rename or reorganize them anytime.     │
│                                         │
│  ┌───────────────────────────────────┐  │
│  │ ▾ View import details             │  │
│  ├───────────────────────────────────┤  │
│  │ 📊 45 completed for analytics     │  │
│  │ ⊘ 23 skipped (already imported)   │  │
│  │ ⚠ 12 need clarity levels          │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

## Implementation Notes

1. Store the full import result in `this.state.data.importResult` (currently only stores `tasksImported` and `projectsImported`)

2. The wizard JavaScript renders HTML strings, so provide the complete HTML structure

3. Include the toggle JavaScript function inline or as a method of WhenWizard class

4. Collapsed state should be the default (details hidden)

5. Consider the mobile experience - details section should work well on small screens

## Files to Modify

- `static/js/wizard.js` - `renderStep5Complete()` method and import result storage
- `static/css/wizard.css` - Add styles for details section

## Deliverables

1. Updated HTML template for the import complete state
2. CSS for the new details section (collapsible, icons, etc.)
3. JavaScript for toggle functionality
4. Any updates to the import result storage to capture full API response
