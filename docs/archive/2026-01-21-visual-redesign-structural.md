# Visual Redesign: Structural Changes

> Template and layout changes deferred from v0.9.5 CSS polish. Target: v1.0

## Overview

The v0.9.5 visual redesign implemented CSS polish (animations, shadows, hover effects). These structural changes require template modifications and were deferred.

---

## 1. Energy Selector Relocation

**Current:** Energy selector lives inside the task list panel header.

**Target:** Move to a page-wide horizontal pill bar below the main site header.

### Files to Modify
- `app/templates/dashboard.html` - Move energy selector markup
- `static/css/dashboard.css` - New positioning styles

### Implementation
```html
<!-- After .site-header, before .tasks-layout -->
<div class="energy-bar">
    <div class="energy-bar__pills">
        <button class="energy-pill" data-energy="1">Zombie</button>
        <button class="energy-pill active" data-energy="2">Normal</button>
        <button class="energy-pill" data-energy="3">Focus</button>
    </div>
</div>
```

### CSS Needed
```css
.energy-bar {
    display: flex;
    justify-content: center;
    padding: 12px 24px;
    background: var(--bg-panel);
    border-bottom: 1px solid var(--border-subtle);
}

.energy-bar__pills {
    display: flex;
    gap: 8px;
    background: var(--bg-surface);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-full);
    padding: 4px;
}

.energy-pill {
    padding: 8px 16px;
    border-radius: var(--radius-full);
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    transition: all var(--duration-fast);
}

.energy-pill.active {
    background: var(--primary);
    color: white;
}
```

---

## 2. Settings Page Section Groupings

**Current:** Flat list of panels in two columns.

**Target:** Single column with labeled section groups: Connections, Data, Security, Account.

### Files to Modify
- `app/templates/settings.html` - Wrap panels in section groups
- `static/css/pages/settings.css` - Already has `.settings-section` styles

### Implementation
```html
<div class="settings-grid">
    <!-- Connections Section -->
    <section class="settings-section">
        <h2 class="settings-section-label">Connections</h2>
        <!-- Google Calendar panel -->
        <!-- Todoist panel -->
    </section>

    <!-- Data Section -->
    <section class="settings-section">
        <h2 class="settings-section-label">Data</h2>
        <!-- Domains panel -->
        <!-- Task Display panel -->
        <!-- Backup panel -->
    </section>

    <!-- Security Section -->
    <section class="settings-section">
        <h2 class="settings-section-label">Security</h2>
        <!-- Encryption panel -->
        <!-- Passkeys panel -->
        <!-- Build Provenance panel -->
    </section>

    <!-- Account Section (Danger Zone) -->
    <section class="settings-section settings-section--danger">
        <h2 class="settings-section-label">Account</h2>
        <!-- Maintenance panel -->
        <!-- Sign Out -->
    </section>
</div>
```

---

## 3. Analytics Page Section Groupings

**Current:** Grid of charts without visual hierarchy.

**Target:** Grouped sections with labels: Overview, Patterns, Details.

### Files to Modify
- `app/templates/analytics.html` - Wrap charts in section groups
- `static/css/pages/analytics.css` - Already has `.analytics-section` styles

### Implementation
```html
<!-- Overview Section -->
<section class="analytics-section">
    <h2 class="analytics-section-label">Overview</h2>
    <div class="stats-row">
        <!-- Stat cards, hero stat for Completed -->
    </div>
</section>

<!-- Patterns Section -->
<section class="analytics-section">
    <h2 class="analytics-section-label">Patterns</h2>
    <div class="charts-row">
        <!-- Completion heatmap -->
        <!-- Time of day chart -->
    </div>
</section>

<!-- Details Section -->
<section class="analytics-section">
    <h2 class="analytics-section-label">Details</h2>
    <div class="charts-row-2">
        <!-- Domain breakdown -->
        <!-- Recent completions -->
    </div>
</section>
```

### Hero Stat
Make the "Completed" stat card larger and centered:
```html
<div class="stat-card hero">
    <span class="stat-value success">{{ completed }}</span>
    <span class="stat-label">Tasks Completed</span>
</div>
```

---

## 4. Thoughts Page: Capture in Header

**Current:** Separate capture card above the thoughts panel.

**Target:** Merge capture input into the thoughts panel header for tighter layout.

### Files to Modify
- `app/templates/thoughts.html` - Move capture input into panel header
- `static/css/pages/thoughts.css` - Adjust header styles

### Implementation
```html
<div class="thoughts-panel">
    <div class="thoughts-panel-header thoughts-panel-header--with-input">
        <span class="thoughts-panel-title">Thought Cabinet</span>
        <input type="text"
               class="capture-input capture-input--inline"
               placeholder="Capture a thought..."
               id="thought-input">
    </div>
    <div class="thought-list">
        <!-- thoughts -->
    </div>
</div>
```

### CSS Needed
```css
.thoughts-panel-header--with-input {
    display: flex;
    align-items: center;
    gap: 16px;
}

.capture-input--inline {
    flex: 1;
    height: 36px;
    max-width: 400px;
}
```

---

## 5. ApexCharts Dark Mode Theming

**Current:** Charts may not fully adapt to dark mode.

**Target:** Complete theming for all chart types.

### Files to Modify
- `app/templates/analytics.html` - Chart configuration
- `static/js/analytics.js` (if exists) - Theme detection

### Implementation
```javascript
// Detect theme and apply chart options
const isDark = document.documentElement.dataset.theme === 'dark';

const chartTheme = {
    mode: isDark ? 'dark' : 'light',
    palette: 'palette1',
    monochrome: {
        enabled: false
    }
};

const chartColors = {
    background: isDark ? '#1E293B' : '#FFFFFF',
    foreColor: isDark ? '#F8FAFC' : '#0F172A',
    gridColor: isDark ? 'rgba(248, 250, 252, 0.08)' : 'rgba(15, 23, 42, 0.06)',
};

// Apply to each chart's options
chart: {
    background: chartColors.background,
    foreColor: chartColors.foreColor,
},
grid: {
    borderColor: chartColors.gridColor,
},
theme: chartTheme
```

---

## 6. Empty State Illustrations

**Current:** Text-only empty states or missing illustrations.

**Target:** SVG illustrations for each empty state context.

### Contexts Needing Illustrations
1. **Tasks page** - No tasks for today
2. **Thoughts page** - Empty thought cabinet
3. **Analytics page** - No data yet
4. **Settings/Domains** - No domains created

### Files to Create
- `static/img/illustrations/empty-tasks.svg`
- `static/img/illustrations/empty-thoughts.svg`
- `static/img/illustrations/empty-analytics.svg`
- `static/img/illustrations/empty-domains.svg`

### Style Guidelines
- Monochrome using `--primary` color
- Simple, minimal line art
- 120x120px viewBox
- Float animation applied via CSS

---

## Verification Checklist

After implementing each section:

- [ ] Test in light mode
- [ ] Test in dark mode
- [ ] Test on mobile (< 600px)
- [ ] Test on tablet (600-900px)
- [ ] Verify reduced motion is respected
- [ ] Run `uv run ruff format . && uv run ruff check . && uv run pyright app/ && just test`

---

## Notes

- CSS for sections 2-4 is already in place from v0.9.5
- Section 1 (energy bar) needs new CSS
- Section 5 may require JS changes for theme detection
- Section 6 requires design/illustration work
