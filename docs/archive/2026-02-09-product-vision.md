# Whendoist Product Vision

> Strategic insights on positioning, differentiation, and future direction.

*Compiled from product discussions, January 2026*

---

## The Core Question

Every productivity tool answers a different question:

| Tool | Question Answered |
|------|-------------------|
| **Todoist** | "WHAT do I need to do?" |
| **Notion** | "HOW do I organize everything?" |
| **Google Calendar** | "WHEN am I busy?" |
| **Motion / Reclaim** | "Let me schedule your life for you" |
| **Whendoist** | **"WHEN do I do this, given my reality right now?"** |

The name says it: **WHEN-do-ist**.

---

## The Problem with Existing Tools

### Todoist / Traditional Task Managers

- Great for capturing and organizing tasks
- Useless for answering "I have 45 minutes, what should I do?"
- You stare at your list, stare at your calendar, do mental gymnastics
- **No alignment between tasks and available time**

### Notion / Flexible Databases

- You can build anything
- Which means you spend time building systems instead of doing work
- Procrastination engine disguised as productivity
- **Flexibility becomes a liability**

### AI Schedulers (Motion, Reclaim, Clockwise)

- They take control: "I scheduled your day"
- For power users, this feels like:
  - Loss of agency
  - Black box decisions
  - "The app controls me, not the other way around"
- When the AI gets it wrong, you fight the system
- **Autonomy without transparency**

---

## The Whendoist Positioning

### Co-pilot, Not Autopilot

This is the key insight. Users who care about productivity want:

1. **Control** over their schedule
2. **Intelligence** to avoid doing the math themselves
3. **Transparency** in how decisions are made

Whendoist provides collaborative intelligence:

- You say "I have 2 hours" → app shows what fits
- You say "I'm tired" → app filters to zombie tasks
- You say "Fill this gap" → app suggests, **you approve**

**The user drives. The app navigates.**

### The Alignment Engine

Whendoist aligns four dimensions that no other tool combines explicitly:

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│    TASKS              TIME              ENERGY          │
│    (what you          (when you're      (what you're    │
│    want to do)        free)             capable of)     │
│                                                         │
│                    PRIORITY                             │
│                    (what matters most)                  │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

- **Todoist** has tasks and (weak) priority
- **Google Calendar** has time
- **Neither** has energy
- **Neither** does the alignment

---

## User Archetypes

### 1. The Optimizer

- Tasks are well-defined with duration, energy, priority
- Google Calendar connected
- Wants to maximize every free minute
- Primary question: **"What should I do NOW?"**
- Uses "Plan My Day" heavily
- Power user who has done the homework

### 2. The Planner

- Plans ahead (evening for tomorrow, Sunday for the week)
- Wants big picture view and time block allocation
- Tasks might be less granular
- Primary question: **"How should I structure tomorrow?"**
- Uses calendar view more than task list

### 3. The Tracker

- Just wants a task list with light scheduling
- May not have calendar connected
- Uses Whendoist like "Todoist with a calendar"
- Primary question: **"What's on my plate?"**
- Simpler needs, simpler workflow

### 4. The Overwhelmed

- Too many tasks, paralyzed by choice
- Needs the app to cut through the noise
- Primary question: **"Just tell me what to do"**
- Benefits most from smart filtering and suggestions
- Energy filter is crucial for this persona

---

## Mobile UX Insights

### The Current Problem

Desktop Whendoist: Two-column layout (tasks + calendar) with drag-and-drop.

Mobile challenge: Can't fit both, drag-and-drop is awkward on touch.

Current mobile: Tabs switching between Tasks and Schedule views. "Plan My Day" is hidden in the calendar view.

**Problem:** The killer feature (Plan My Day) is buried.

### Perspective Shift #1: Surface Free Time Proactively

Instead of making users go to calendar and select time:

```
┌────────────────────────────┐
│  ┌────────────────────────┐│
│  │ 2h 30m free until 14:00││
│  │                        ││
│  │   [✨ Plan This Gap]   ││
│  └────────────────────────┘│
├────────────────────────────┤
│  Tasks...                  │
└────────────────────────────┘
```

The app KNOWS your free time from the calendar. Surface it.

### Perspective Shift #2: Task-Initiated Scheduling

Instead of "calendar → find time → fill with tasks":

```
┌─────────────────────────────────┐
│ Review Q4 budget                │
│ 🧠 45m · P1 · Work              │
├─────────────────────────────────┤
│ When can you do this?           │
│                                 │
│ ● Now → 45m free until 11:00    │
│ ○ This afternoon → 15:00-17:00  │
│ ○ Tomorrow morning → 9:00-12:00 │
│                                 │
│ [Schedule]              [Later] │
└─────────────────────────────────┘
```

Start from the task. Show available slots in context.

### Perspective Shift #3: Anti-Calendar (Show Only Gaps)

Users don't care about meetings—they care about space between them:

```
┌─────────────────────────────────┐
│ Today's free time               │
│                                 │
│ ▓▓▓░░░▓▓░░░░░░░░▓▓▓░░░░░░░░░░ │
│ 8   10   12   14   16   18   20│
│                                 │
│     2h      3h30       2h30     │
│                                 │
│ Tap a gap to plan it            │
└─────────────────────────────────┘
```

Make free time the hero, not events.

### Perspective Shift #4: Decision Interface

If the core value is "align my reality and tell me what to do"...

The mobile home screen shouldn't be a list or calendar. It should be a **question**:

```
┌─────────────────────────────────┐
│                                 │
│   What's your situation?        │
│                                 │
│   ┌───────────────────────┐     │
│   │ I have [30m ▼] free   │     │
│   └───────────────────────┘     │
│                                 │
│   ┌─────┐  ┌─────┐  ┌─────┐    │
│   │ 🧟  │  │ ☕  │  │ 🧠  │    │
│   └─────┘  └─────┘  └─────┘    │
│                                 │
│        [What should I do?]      │
│                                 │
└─────────────────────────────────┘
```

One tap → aligned task suggestion → Go.

---

## Why Not Just an LLM/AI Tool?

Power users (the target audience) have a specific problem with AI tools:

1. **Black box** — Can't see why it made a decision
2. **Loss of control** — It decides, you comply
3. **Over-automation** — Feels like the tool owns your time
4. **Correction friction** — When it's wrong, fighting the system is painful

Whendoist philosophy:

- **Transparent** — You see the tasks, see the gaps, understand the match
- **Controlled** — You always approve, adjust, or override
- **Assistive** — Does the math, not the deciding
- **Correctable** — Easy to undo, reschedule, modify

---

## Competitive Differentiation

### vs. Todoist

| Aspect | Todoist | Whendoist |
|--------|---------|-----------|
| Task capture | Excellent | Good |
| Organization | Excellent | Good |
| Calendar integration | Weak (view only) | Strong (bidirectional) |
| "When to do this?" | No answer | Core feature |
| Energy levels | None | Built-in |
| Auto-scheduling | None | Plan My Day |

**Whendoist = Todoist + Calendar + "When"**

### vs. Motion

| Aspect | Motion | Whendoist |
|--------|--------|-----------|
| Auto-scheduling | Full AI control | User-controlled |
| Transparency | Black box | Full visibility |
| Price | $19/mo | Free tier available |
| Flexibility | Limited | High |
| Learning curve | Low (it decides) | Medium (you decide) |

**Whendoist = Motion's intelligence + User's control**

### vs. Notion

| Aspect | Notion | Whendoist |
|--------|--------|-----------|
| Flexibility | Infinite | Focused |
| Setup time | High | Low |
| Calendar | Manual/hacks | Native |
| Mobile | Slow | Fast |
| Purpose | Build systems | Get things done |

**Whendoist = Opinionated, fast, focused**

---

## Open Questions for Research

1. **Market size** — How big is the "task scheduling" niche vs. general task management?

2. **User pain points** — What do Todoist/Notion/Motion users complain about most?

3. **Pricing sensitivity** — What do power users pay for productivity tools?

4. **Feature priorities** — Which features matter most: calendar sync, auto-scheduling, mobile, collaboration?

5. **Acquisition channels** — How do productivity tools acquire users (content, referral, integrations)?

6. **Retention patterns** — Why do users churn from productivity apps?

7. **Energy/context features** — Are other tools exploring energy-based task filtering?

---

## Vision Statement (Draft)

> **Whendoist is a time alignment tool for people who want to be productive without losing control.**
>
> We answer the question other tools ignore: "When do I do this?"
>
> We believe in co-pilot, not autopilot. Your time, your decisions—we just do the math.

---

## Next Steps

1. **User research** — Interview power users of Todoist, Motion, Notion about pain points
2. **Competitive deep dive** — Analyze feature sets, pricing, positioning of top 10 competitors
3. **Mobile prototype** — Test perspective shifts with real users
4. **Messaging** — Refine "co-pilot not autopilot" positioning for landing page

---

*Last updated: January 2026*
