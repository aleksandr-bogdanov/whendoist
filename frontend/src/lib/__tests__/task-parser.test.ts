/**
 * Comprehensive tests for task-parser.ts — the smart input parser.
 *
 * Covers: impact (priority), clarity, duration, domain, parent, description,
 * date/time parsing, autocomplete suggestions, and edge cases.
 */

import { describe, expect, it } from "vitest";
import type { DomainResponse } from "@/api/model";
import {
  type AutocompleteResult,
  getAutocompleteSuggestions,
  IMPACT_KEYWORDS,
  IMPACT_TOKEN_PATTERN,
  type ParentTaskOption,
  parseTaskInput,
} from "@/lib/task-parser";

// ─── Test Fixtures ───────────────────────────────────────────────────────────

const DOMAINS: DomainResponse[] = [
  { id: 1, name: "Work", icon: "💼", color: "#ff0000", is_archived: false, position: 0 },
  {
    id: 2,
    name: "Health and Fitness",
    icon: "🏋️",
    color: "#00ff00",
    is_archived: false,
    position: 1,
  },
  { id: 3, name: "Archived Domain", icon: null, color: "#cccccc", is_archived: true, position: 2 },
];

const PARENT_TASKS: ParentTaskOption[] = [
  { id: 10, title: "Big Project", domain_id: 1 },
  { id: 20, title: "Side Quest", domain_id: null },
];

/** Helper: parse with default domains, no dismissals */
function parse(input: string) {
  return parseTaskInput(input, DOMAINS);
}

/** Helper: parse with parent tasks available */
function parseWithParents(input: string) {
  return parseTaskInput(input, DOMAINS, undefined, PARENT_TASKS);
}

/** Helper: get autocomplete suggestions at end of input */
function autocomplete(input: string): AutocompleteResult | null {
  return getAutocompleteSuggestions(input, input.length, DOMAINS, PARENT_TASKS);
}

/** Helper: get autocomplete at a specific cursor position */
function autocompleteAt(input: string, cursor: number): AutocompleteResult | null {
  return getAutocompleteSuggestions(input, cursor, DOMAINS, PARENT_TASKS);
}

// ═══════════════════════════════════════════════════════════════════════════════
// IMPACT / PRIORITY
// ═══════════════════════════════════════════════════════════════════════════════

describe("impact: word syntax (!high, !mid, !low, !min)", () => {
  it("parses !high as impact 1", () => {
    const r = parse("Do laundry !high");
    expect(r.impact).toBe(1);
    expect(r.title).toBe("Do laundry");
  });

  it("parses !mid as impact 2", () => {
    const r = parse("Do laundry !mid");
    expect(r.impact).toBe(2);
    expect(r.title).toBe("Do laundry");
  });

  it("parses !low as impact 3", () => {
    const r = parse("Do laundry !low");
    expect(r.impact).toBe(3);
    expect(r.title).toBe("Do laundry");
  });

  it("parses !min as impact 4", () => {
    const r = parse("Do laundry !min");
    expect(r.impact).toBe(4);
    expect(r.title).toBe("Do laundry");
  });

  it("is case-insensitive", () => {
    expect(parse("task !HIGH").impact).toBe(1);
    expect(parse("task !Mid").impact).toBe(2);
    expect(parse("task !LOW").impact).toBe(3);
    expect(parse("task !MIN").impact).toBe(4);
  });

  it("works at the beginning of input", () => {
    const r = parse("!high Do laundry");
    expect(r.impact).toBe(1);
    expect(r.title).toBe("Do laundry");
  });

  it("works in the middle of input", () => {
    const r = parse("Do !high laundry");
    expect(r.impact).toBe(1);
    expect(r.title).toBe("Do laundry");
  });

  it("last-wins when multiple impacts are present", () => {
    const r = parse("!low task !high");
    expect(r.impact).toBe(1); // !high is last
  });

  it("creates an impact token with correct label", () => {
    const r = parse("task !high");
    const token = r.tokens.find((t) => t.type === "impact");
    expect(token).toBeDefined();
    expect(token!.label).toBe("High");
  });
});

describe("impact: !p1-!p4 syntax", () => {
  it("parses !p1 as impact 1 (High)", () => {
    expect(parse("task !p1").impact).toBe(1);
  });

  it("parses !p2 as impact 2 (Mid)", () => {
    expect(parse("task !p2").impact).toBe(2);
  });

  it("parses !p3 as impact 3 (Low)", () => {
    expect(parse("task !p3").impact).toBe(3);
  });

  it("parses !p4 as impact 4 (Min)", () => {
    expect(parse("task !p4").impact).toBe(4);
  });

  it("shows human-readable label, not p-notation", () => {
    const r = parse("task !p1");
    const token = r.tokens.find((t) => t.type === "impact");
    expect(token!.label).toBe("High");
  });
});

describe("impact: bare number syntax !1-!4 (Todoist-style)", () => {
  it("parses !1 as impact 1 (High)", () => {
    const r = parse("Do laundry !1");
    expect(r.impact).toBe(1);
    expect(r.title).toBe("Do laundry");
  });

  it("parses !2 as impact 2 (Mid)", () => {
    const r = parse("Do laundry !2");
    expect(r.impact).toBe(2);
    expect(r.title).toBe("Do laundry");
  });

  it("parses !3 as impact 3 (Low)", () => {
    const r = parse("Do laundry !3");
    expect(r.impact).toBe(3);
    expect(r.title).toBe("Do laundry");
  });

  it("parses !4 as impact 4 (Min)", () => {
    const r = parse("Do laundry !4");
    expect(r.impact).toBe(4);
    expect(r.title).toBe("Do laundry");
  });

  it("shows human-readable label, not the number", () => {
    const r = parse("task !1");
    const token = r.tokens.find((t) => t.type === "impact");
    expect(token).toBeDefined();
    expect(token!.label).toBe("High");
  });

  it("works at the beginning of input", () => {
    const r = parse("!1 Ship feature");
    expect(r.impact).toBe(1);
    expect(r.title).toBe("Ship feature");
  });

  it("works in the middle of input", () => {
    const r = parse("Ship !2 feature");
    expect(r.impact).toBe(2);
    expect(r.title).toBe("Ship feature");
  });

  it("is interchangeable with word syntax (last wins)", () => {
    // !high first, !1 last — !1 wins, same value
    expect(parse("!high task !1").impact).toBe(1);
    // !1 first, !low last — !low wins
    expect(parse("!1 task !low").impact).toBe(3);
    // !p2 first, !3 last — !3 wins
    expect(parse("!p2 task !3").impact).toBe(3);
  });
});

describe("impact: numbers that should NOT match", () => {
  it("does not match !0", () => {
    expect(parse("task !0").impact).toBeNull();
  });

  it("does not match !5 or higher", () => {
    expect(parse("task !5").impact).toBeNull();
    expect(parse("task !9").impact).toBeNull();
  });

  it("does not match !10 (multi-digit starting with 1)", () => {
    const r = parse("task !10");
    expect(r.impact).toBeNull();
  });

  it("does not match !1abc (digit followed by letters)", () => {
    const r = parse("task !1abc");
    expect(r.impact).toBeNull();
  });

  it("does not match !p0 or !p5", () => {
    expect(parse("task !p0").impact).toBeNull();
    expect(parse("task !p5").impact).toBeNull();
  });

  it("preserves unrecognized !-tokens in the title", () => {
    const r = parse("Fix bug !99");
    expect(r.impact).toBeNull();
    expect(r.title).toBe("Fix bug !99");
  });
});

describe("impact: IMPACT_TOKEN_PATTERN for tapToken", () => {
  it("matches !high", () => {
    expect(IMPACT_TOKEN_PATTERN.test("task !high rest")).toBe(true);
  });

  it("matches !p1", () => {
    expect(IMPACT_TOKEN_PATTERN.test("task !p1 rest")).toBe(true);
  });

  it("matches !1", () => {
    expect(IMPACT_TOKEN_PATTERN.test("task !1 rest")).toBe(true);
  });

  it("matches !4", () => {
    expect(IMPACT_TOKEN_PATTERN.test("task !4")).toBe(true);
  });

  it("does not match !5", () => {
    expect(IMPACT_TOKEN_PATTERN.test("task !5")).toBe(false);
  });

  it("does not match !10", () => {
    // Should NOT match because \b doesn't fire between "1" and "0"
    expect(IMPACT_TOKEN_PATTERN.test("!10")).toBe(false);
  });
});

describe("impact: IMPACT_KEYWORDS for tapToken insertion", () => {
  it("maps 1 → high", () => expect(IMPACT_KEYWORDS[1]).toBe("high"));
  it("maps 2 → mid", () => expect(IMPACT_KEYWORDS[2]).toBe("mid"));
  it("maps 3 → low", () => expect(IMPACT_KEYWORDS[3]).toBe("low"));
  it("maps 4 → min", () => expect(IMPACT_KEYWORDS[4]).toBe("min"));
});

// ═══════════════════════════════════════════════════════════════════════════════
// IMPACT AUTOCOMPLETE
// ═══════════════════════════════════════════════════════════════════════════════

describe("impact autocomplete", () => {
  it("shows all 4 options when typing just !", () => {
    const r = autocomplete("task !");
    expect(r).not.toBeNull();
    expect(r!.type).toBe("impact");
    expect(r!.suggestions).toHaveLength(4);
  });

  it("filters by word prefix: !h → High", () => {
    const r = autocomplete("task !h");
    expect(r!.suggestions).toHaveLength(1);
    expect(r!.suggestions[0].label).toBe("High");
  });

  it("filters by word prefix: !mi → Mid, Min", () => {
    const r = autocomplete("task !mi");
    expect(r!.suggestions).toHaveLength(2);
    expect(r!.suggestions.map((s) => s.label)).toContain("Mid");
    expect(r!.suggestions.map((s) => s.label)).toContain("Min");
  });

  it("filters by word prefix: !l → Low", () => {
    const r = autocomplete("task !l");
    expect(r!.suggestions).toHaveLength(1);
    expect(r!.suggestions[0].label).toBe("Low");
  });

  it("shows matching suggestion for !1 → High", () => {
    const r = autocomplete("task !1");
    expect(r).not.toBeNull();
    expect(r!.suggestions).toHaveLength(1);
    expect(r!.suggestions[0].label).toBe("High");
    expect(r!.suggestions[0].value).toBe("high");
  });

  it("shows matching suggestion for !2 → Mid", () => {
    const r = autocomplete("task !2");
    expect(r!.suggestions).toHaveLength(1);
    expect(r!.suggestions[0].label).toBe("Mid");
  });

  it("shows matching suggestion for !3 → Low", () => {
    const r = autocomplete("task !3");
    expect(r!.suggestions).toHaveLength(1);
    expect(r!.suggestions[0].label).toBe("Low");
  });

  it("shows matching suggestion for !4 → Min", () => {
    const r = autocomplete("task !4");
    expect(r!.suggestions).toHaveLength(1);
    expect(r!.suggestions[0].label).toBe("Min");
  });

  it("shows no suggestions for !5 (out of range)", () => {
    const r = autocomplete("task !5");
    expect(r === null || r.suggestions.length === 0).toBe(true);
  });

  it("shows no suggestions for !0 (out of range)", () => {
    const r = autocomplete("task !0");
    expect(r === null || r.suggestions.length === 0).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// CLARITY
// ═══════════════════════════════════════════════════════════════════════════════

describe("clarity", () => {
  it("parses ?auto as autopilot", () => {
    expect(parse("task ?auto").clarity).toBe("autopilot");
  });

  it("parses ?autopilot as autopilot", () => {
    expect(parse("task ?autopilot").clarity).toBe("autopilot");
  });

  it("parses ?brain as brainstorm", () => {
    expect(parse("task ?brain").clarity).toBe("brainstorm");
  });

  it("parses ?brainstorm as brainstorm", () => {
    expect(parse("task ?brainstorm").clarity).toBe("brainstorm");
  });

  it("parses ?normal as normal", () => {
    expect(parse("task ?normal").clarity).toBe("normal");
  });

  it("creates token with correct label", () => {
    const r = parse("task ?brain");
    const token = r.tokens.find((t) => t.type === "clarity");
    expect(token!.label).toBe("Brainstorm");
  });
});

describe("clarity autocomplete", () => {
  it("shows all 3 options when typing just ?", () => {
    const r = autocomplete("task ?");
    expect(r).not.toBeNull();
    expect(r!.type).toBe("clarity");
    expect(r!.suggestions).toHaveLength(3);
  });

  it("filters by prefix: ?a → Autopilot", () => {
    const r = autocomplete("task ?a");
    expect(r!.suggestions).toHaveLength(1);
    expect(r!.suggestions[0].label).toBe("Autopilot");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// DURATION
// ═══════════════════════════════════════════════════════════════════════════════

describe("duration", () => {
  it("parses 30m", () => {
    expect(parse("task 30m").durationMinutes).toBe(30);
  });

  it("parses 1h", () => {
    expect(parse("task 1h").durationMinutes).toBe(60);
  });

  it("parses 2h30m", () => {
    expect(parse("task 2h30m").durationMinutes).toBe(150);
  });

  it("parses 1hr", () => {
    expect(parse("task 1hr").durationMinutes).toBe(60);
  });

  it("parses 45mins", () => {
    expect(parse("task 45mins").durationMinutes).toBe(45);
  });

  it("rejects durations under 5m", () => {
    expect(parse("task 2m").durationMinutes).toBeNull();
  });

  it("rejects durations over 24h", () => {
    expect(parse("task 1500m").durationMinutes).toBeNull();
  });

  it("does not match duration embedded in words", () => {
    // "item30m" should not trigger duration
    expect(parse("item30m").durationMinutes).toBeNull();
  });

  it("creates token with formatted label", () => {
    const r = parse("task 2h30m");
    const token = r.tokens.find((t) => t.type === "duration");
    expect(token!.label).toBe("2h30m");
  });

  it("formats whole hours without minutes", () => {
    const r = parse("task 2h");
    const token = r.tokens.find((t) => t.type === "duration");
    expect(token!.label).toBe("2h");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// DOMAIN
// ═══════════════════════════════════════════════════════════════════════════════

describe("domain", () => {
  it("parses #Work as domain id 1", () => {
    const r = parse("task #Work");
    expect(r.domainId).toBe(1);
    expect(r.domainName).toBe("Work");
  });

  it("is case-insensitive for lookup", () => {
    const r = parse("task #work");
    expect(r.domainId).toBe(1);
  });

  it("handles multi-word domains", () => {
    const r = parse("task #Health and Fitness");
    expect(r.domainId).toBe(2);
    expect(r.domainName).toBe("Health and Fitness");
  });

  it("does fuzzy prefix match: #hea → Health and Fitness", () => {
    const r = parse("task #hea");
    expect(r.domainId).toBe(2);
  });

  it("ignores archived domains", () => {
    const r = parse("task #Archived Domain");
    expect(r.domainId).toBeNull();
  });

  it("requires # at start or after whitespace", () => {
    const r = parse("foo#Work bar");
    expect(r.domainId).toBeNull();
  });

  it("creates token with icon in label", () => {
    const r = parse("task #Work");
    const token = r.tokens.find((t) => t.type === "domain");
    expect(token!.label).toContain("💼");
    expect(token!.label).toContain("Work");
  });
});

describe("domain autocomplete", () => {
  it("shows active domains when typing #", () => {
    const r = autocomplete("task #");
    expect(r).not.toBeNull();
    expect(r!.type).toBe("domain");
    // Should show 2 active domains (not the archived one)
    expect(r!.suggestions).toHaveLength(2);
  });

  it("filters by prefix: #w → Work", () => {
    const r = autocomplete("task #w");
    expect(r!.suggestions).toHaveLength(1);
    expect(r!.suggestions[0].label).toBe("Work");
  });

  it("includes substring matches: #fit → Health and Fitness", () => {
    const r = autocomplete("task #fit");
    expect(r!.suggestions).toHaveLength(1);
    expect(r!.suggestions[0].label).toBe("Health and Fitness");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PARENT TASKS
// ═══════════════════════════════════════════════════════════════════════════════

describe("parent", () => {
  it("parses ^Big Project as parent id 10", () => {
    const r = parseWithParents("subtask ^Big Project");
    expect(r.parentId).toBe(10);
    expect(r.parentName).toBe("Big Project");
  });

  it("does prefix match: ^side → Side Quest", () => {
    const r = parseWithParents("subtask ^side");
    expect(r.parentId).toBe(20);
  });

  it("ignores ^ when no parent tasks provided", () => {
    const r = parse("subtask ^Big Project");
    expect(r.parentId).toBeNull();
  });
});

describe("parent autocomplete", () => {
  it("shows parent tasks when typing ^", () => {
    const r = autocomplete("task ^");
    expect(r).not.toBeNull();
    expect(r!.type).toBe("parent");
    expect(r!.suggestions).toHaveLength(2);
  });

  it("filters by prefix: ^big → Big Project", () => {
    const r = autocomplete("task ^big");
    expect(r!.suggestions).toHaveLength(1);
    expect(r!.suggestions[0].label).toBe("Big Project");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// DESCRIPTION
// ═══════════════════════════════════════════════════════════════════════════════

describe("description (// separator)", () => {
  it("extracts description after //", () => {
    const r = parse("My task // some notes here");
    expect(r.description).toBe("some notes here");
    expect(r.title).toBe("My task");
  });

  it("does not trigger on URLs (no space before //)", () => {
    const r = parse("Visit https://example.com");
    expect(r.description).toBeNull();
  });

  it("works at the start of input", () => {
    const r = parse("// just a note");
    expect(r.description).toBe("just a note");
    expect(r.title).toBe("");
  });

  it("truncates long descriptions in token label", () => {
    const r = parse("task // this is a very long description that exceeds thirty characters");
    const token = r.tokens.find((t) => t.type === "description");
    expect(token!.label.length).toBeLessThanOrEqual(33); // 30 chars + "..."
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// DATE / TIME (chrono-node + abbreviations)
// ═══════════════════════════════════════════════════════════════════════════════

describe("date parsing", () => {
  it("parses 'tomorrow'", () => {
    const r = parse("task tomorrow");
    expect(r.scheduledDate).not.toBeNull();
  });

  it("parses 'tom' abbreviation", () => {
    const r = parse("task tom");
    expect(r.scheduledDate).not.toBeNull();
  });

  it("parses 'tmrw' abbreviation", () => {
    const r = parse("task tmrw");
    expect(r.scheduledDate).not.toBeNull();
  });

  it("parses 'today'", () => {
    const r = parse("task today");
    expect(r.scheduledDate).not.toBeNull();
  });

  it("parses 'tod' abbreviation", () => {
    const r = parse("task tod");
    expect(r.scheduledDate).not.toBeNull();
  });

  it("parses time with date abbreviation: 'tom 3pm'", () => {
    const r = parse("task tom 3pm");
    expect(r.scheduledDate).not.toBeNull();
    expect(r.scheduledTime).toBe("15:00");
  });

  it("rejects bare ordinals like '2nd'", () => {
    const r = parse("Finish 2nd draft");
    expect(r.scheduledDate).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// COMBINED TOKENS
// ═══════════════════════════════════════════════════════════════════════════════

describe("combined tokens", () => {
  it("parses multiple tokens in one input", () => {
    const r = parse("Deploy API !high ?auto 2h #Work");
    expect(r.impact).toBe(1);
    expect(r.clarity).toBe("autopilot");
    expect(r.durationMinutes).toBe(120);
    expect(r.domainId).toBe(1);
    expect(r.title).toBe("Deploy API");
  });

  it("parses !1 alongside other tokens", () => {
    const r = parse("Ship feature !1 30m #Work");
    expect(r.impact).toBe(1);
    expect(r.durationMinutes).toBe(30);
    expect(r.domainId).toBe(1);
    expect(r.title).toBe("Ship feature");
  });

  it("parses !3 with description", () => {
    const r = parse("Low priority thing !3 // not urgent at all");
    expect(r.impact).toBe(3);
    expect(r.description).toBe("not urgent at all");
    expect(r.title).toBe("Low priority thing");
  });

  it("handles all three impact syntaxes interchangeably", () => {
    // All resolve to the same value
    const a = parse("task !high");
    const b = parse("task !p1");
    const c = parse("task !1");
    expect(a.impact).toBe(b.impact);
    expect(b.impact).toBe(c.impact);
    expect(c.impact).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// EDGE CASES
// ═══════════════════════════════════════════════════════════════════════════════

describe("edge cases", () => {
  it("returns empty parsed for empty input", () => {
    const r = parse("");
    expect(r.title).toBe("");
    expect(r.impact).toBeNull();
    expect(r.tokens).toHaveLength(0);
  });

  it("returns empty parsed for whitespace-only input", () => {
    const r = parse("   ");
    expect(r.title).toBe("");
    expect(r.impact).toBeNull();
  });

  it("respects dismissed token types", () => {
    const r = parseTaskInput("task !high", DOMAINS, new Set(["impact"]));
    expect(r.impact).toBeNull();
    // The !high text remains in the title since it was dismissed
    expect(r.title).toContain("!high");
  });

  it("handles input that is only a token", () => {
    const r = parse("!high");
    expect(r.impact).toBe(1);
    expect(r.title).toBe("");
  });

  it("handles input that is only a bare number token", () => {
    const r = parse("!1");
    expect(r.impact).toBe(1);
    expect(r.title).toBe("");
  });

  it("collapses multiple spaces in title after token removal", () => {
    const r = parse("Do  !high  laundry");
    expect(r.title).toBe("Do laundry");
  });

  it("autocomplete returns null when cursor is not near a trigger", () => {
    const r = autocomplete("just plain text");
    expect(r).toBeNull();
  });

  it("autocomplete requires trigger at start or after whitespace", () => {
    // "a!" — the ! is not preceded by whitespace
    const r = autocompleteAt("a!", 2);
    expect(r).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PARENT EDGE CASES
// ═══════════════════════════════════════════════════════════════════════════════

describe("parent edge cases", () => {
  it("does not match ^ in the middle of a word (task^name)", () => {
    const r = parseWithParents("task^Big Project rest");
    expect(r.parentId).toBeNull();
    expect(r.title).toContain("task^Big");
  });

  it("last-wins when multiple ^ tokens are present", () => {
    const r = parseWithParents("^Big Project ^Side Quest");
    // Last match should win — Side Quest
    expect(r.parentId).toBe(20);
    expect(r.parentName).toBe("Side Quest");
  });

  it("ignores ^ with no matching parent task", () => {
    const r = parseWithParents("task ^nonexistent");
    expect(r.parentId).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// DATE ABBREVIATION EDGE CASES
// ═══════════════════════════════════════════════════════════════════════════════

describe("date abbreviation edge cases", () => {
  it("parses tom9:00 (no space) with both date and time", () => {
    const r = parse("meeting tom9:00");
    expect(r.scheduledDate).not.toBeNull();
    expect(r.scheduledTime).toBe("09:00");
    expect(r.title).toBe("meeting");
  });

  it("parses tmr abbreviation", () => {
    const r = parse("task tmr");
    expect(r.scheduledDate).not.toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// FULL COMBINED INPUT
// ═══════════════════════════════════════════════════════════════════════════════

describe("full combined input with all token types", () => {
  it("parses every token type in a single input", () => {
    const r = parseWithParents(
      "Deploy API #Work !high ?auto 2h tom 3pm ^Big Project // deploy notes",
    );
    expect(r.title).toBe("Deploy API");
    expect(r.domainId).toBe(1);
    expect(r.impact).toBe(1);
    expect(r.clarity).toBe("autopilot");
    expect(r.durationMinutes).toBe(120);
    expect(r.scheduledDate).not.toBeNull();
    expect(r.scheduledTime).toBe("15:00");
    expect(r.parentId).toBe(10);
    expect(r.description).toBe("deploy notes");
    expect(r.tokens.length).toBeGreaterThanOrEqual(6);
  });
});
