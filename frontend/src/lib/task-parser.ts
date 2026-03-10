/**
 * Inline task input parser for Smart Quick Add V2.
 *
 * Parses a single text input to extract task metadata tokens:
 *   #Domain   → domain assignment (fuzzy autocomplete)
 *   !high/!mid/!low/!min → impact 1-4
 *   ?auto/?brain/?normal → clarity mode
 *   30m / 1h / 2h30m → duration in minutes
 *   Natural language → scheduled date/time (via chrono-node)
 *   // → description separator
 */

import * as chrono from "chrono-node";
import type { DomainResponse } from "@/api/model";
import { toDateString } from "@/lib/calendar-utils";
import i18n from "@/lib/i18n";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ParsedToken {
  type: "domain" | "impact" | "clarity" | "duration" | "date" | "description" | "parent";
  raw: string;
  label: string;
  startIndex: number;
  endIndex: number;
}

/** Minimal type for parent task candidates passed into the parser. */
export interface ParentTaskOption {
  id: number;
  title: string;
  domain_id?: number | null;
}

export interface ParsedTaskMetadata {
  title: string;
  description: string | null;
  domainId: number | null;
  domainName: string | null;
  impact: number | null;
  clarity: string | null;
  durationMinutes: number | null;
  scheduledDate: string | null;
  scheduledTime: string | null;
  parentId: number | null;
  parentName: string | null;
  tokens: ParsedToken[];
}

export interface AutocompleteSuggestion {
  type: "domain" | "clarity" | "impact" | "parent";
  value: string | number;
  label: string;
  icon?: string | null;
  colorClass?: string | null;
  secondaryLabel?: string | null;
}

export interface AutocompleteResult {
  suggestions: AutocompleteSuggestion[];
  triggerStart: number;
  triggerEnd: number;
  type: "domain" | "clarity" | "impact" | "parent";
}

// ─── Constants ──────────────────────────────────────────────────────────────

const IMPACT_PATTERN = /!(high|mid|low|min|p[1-4]|[1-4])\b/gi;
const IMPACT_MAP: Record<string, number> = {
  high: 1,
  mid: 2,
  low: 3,
  min: 4,
  p1: 1,
  p2: 2,
  p3: 3,
  p4: 4,
  "1": 1,
  "2": 2,
  "3": 3,
  "4": 4,
};

const IMPACT_LABEL_MAP: Record<number, string> = {
  1: "High",
  2: "Mid",
  3: "Low",
  4: "Min",
};

const CLARITY_PATTERN = /\?(auto(?:pilot)?|brain(?:storm)?|normal)\b/gi;
const CLARITY_MAP: Record<string, string> = {
  auto: "autopilot",
  autopilot: "autopilot",
  brain: "brainstorm",
  brainstorm: "brainstorm",
  normal: "normal",
};

const CLARITY_LABEL_MAP: Record<string, string> = {
  autopilot: "Autopilot",
  normal: "Normal",
  brainstorm: "Brainstorm",
};

const DURATION_PATTERN =
  /(?<![a-zA-Z])(\d+(?:hrs?|h)\s?\d+(?:mins?|m)|\d+(?:hrs?|h)|\d+(?:mins?|m))(?![a-zA-Z])/gi;

// ─── Triage token constants (exported for tapToken-based field pickers) ─────

/** Non-global impact pattern for single-match replacement via tapToken. */
export const IMPACT_TOKEN_PATTERN = /!(high|mid|low|min|p[1-4]|[1-4])\b/i;

/** Human-readable impact keywords by numeric level, for tapToken insertion. */
export const IMPACT_KEYWORDS: Record<number, string> = {
  1: "high",
  2: "mid",
  3: "low",
  4: "min",
};

/** Non-global clarity pattern for single-match replacement via tapToken. */
export const CLARITY_TOKEN_PATTERN = /\?(autopilot|normal|brainstorm)\b/i;

/** Non-global duration pattern for single-match replacement via tapToken. */
export const DURATION_TOKEN_PATTERN =
  /(?<![a-zA-Z])(\d+(?:hrs?|h)\s?\d+(?:mins?|m)|\d+(?:hrs?|h)|\d+(?:mins?|m))(?![a-zA-Z])/i;

/** Time token pattern for replacing time-of-day tokens via tapToken. */
export const TIME_TOKEN_PATTERN = /(?<![a-zA-Z\d])\d{1,2}:\d{2}(?:[ap]m)?(?![a-zA-Z])/i;

/** Date token pattern for replacing schedule tokens via tapToken. */
export const SCHEDULE_DATE_PATTERN =
  /\b(today|tod|tomorrow|tom|tmrw?|yes|yest|(?:mon|tue|wed|thu|fri|sat|sun)(?:day)?|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+\d{1,2})\b/i;

// ─── Parser ─────────────────────────────────────────────────────────────────

export const EMPTY_PARSED: ParsedTaskMetadata = {
  title: "",
  description: null,
  domainId: null,
  domainName: null,
  impact: null,
  clarity: null,
  durationMinutes: null,
  scheduledDate: null,
  scheduledTime: null,
  parentId: null,
  parentName: null,
  tokens: [],
};

export function parseTaskInput(
  input: string,
  domains: DomainResponse[],
  dismissedTypes?: Set<string>,
  parentTasks?: ParentTaskOption[],
): ParsedTaskMetadata {
  if (!input.trim()) return { ...EMPTY_PARSED };

  const tokens: ParsedToken[] = [];
  const dismissed = dismissedTypes ?? new Set<string>();
  let working = input;

  // Result accumulators
  let description: string | null = null;
  let domainId: number | null = null;
  let domainName: string | null = null;
  let impact: number | null = null;
  let clarity: string | null = null;
  let durationMinutes: number | null = null;
  let scheduledDate: string | null = null;
  let scheduledTime: string | null = null;

  // Step 1: Description separator (//) — must be preceded by whitespace or at start (avoids URLs)
  if (!dismissed.has("description")) {
    const descMatch = working.match(/(^|\s)\/\//);
    if (descMatch) {
      const descIdx = (descMatch.index ?? 0) + descMatch[1].length;
      const descText = working.slice(descIdx + 2).trim();
      if (descText) {
        description = descText;
        tokens.push({
          type: "description",
          raw: working.slice(descIdx),
          label: descText.length > 30 ? `${descText.slice(0, 30)}...` : descText,
          startIndex: descIdx,
          endIndex: working.length,
        });
      }
      working = working.slice(0, descIdx);
    }
  }

  // Step 2: Domain (#Name) — greedy match against known domain names (handles multi-word)
  if (!dismissed.has("domain")) {
    const activeDomains = domains.filter((d) => !d.is_archived);
    // Sort longest name first for greedy matching
    const sortedDomains = [...activeDomains].sort((a, b) => b.name.length - a.name.length);

    let lastDomainMatch: {
      start: number;
      end: number;
      domain: DomainResponse;
      raw: string;
    } | null = null;

    for (let pos = 0; pos < working.length; pos++) {
      if (working[pos] !== "#") continue;
      if (pos > 0 && !/\s/.test(working[pos - 1])) continue;

      const afterHash = working.slice(pos + 1);
      let matched = false;

      // Try exact multi-word match against known domain names (longest first)
      for (const d of sortedDomains) {
        const dName = d.name.toLowerCase();
        if (afterHash.toLowerCase().startsWith(dName)) {
          const charAfter = afterHash[dName.length];
          if (charAfter === undefined || /\s/.test(charAfter)) {
            lastDomainMatch = {
              start: pos,
              end: pos + 1 + d.name.length,
              domain: d,
              raw: working.slice(pos, pos + 1 + d.name.length),
            };
            matched = true;
            break;
          }
        }
      }

      // Fall back to single-word fuzzy match (#hea → "Health and Fitness")
      if (!matched) {
        const wordMatch = afterHash.match(/^(\S+)/);
        if (wordMatch) {
          const query = wordMatch[1].toLowerCase();
          const d = activeDomains.find(
            (dd) => dd.name.toLowerCase() === query || dd.name.toLowerCase().startsWith(query),
          );
          if (d) {
            lastDomainMatch = {
              start: pos,
              end: pos + 1 + wordMatch[1].length,
              domain: d,
              raw: working.slice(pos, pos + 1 + wordMatch[1].length),
            };
          }
        }
      }
    }

    if (lastDomainMatch) {
      domainId = lastDomainMatch.domain.id;
      domainName = lastDomainMatch.domain.name;
      tokens.push({
        type: "domain",
        raw: lastDomainMatch.raw,
        label: `${lastDomainMatch.domain.icon ? `${lastDomainMatch.domain.icon} ` : ""}${lastDomainMatch.domain.name}`,
        startIndex: lastDomainMatch.start,
        endIndex: lastDomainMatch.end,
      });
      working = working.slice(0, lastDomainMatch.start) + working.slice(lastDomainMatch.end);
    }
  }

  // Step 2.5: Parent (^TaskTitle) — greedy match against known task titles
  let parentId: number | null = null;
  let parentName: string | null = null;
  if (!dismissed.has("parent") && parentTasks && parentTasks.length > 0) {
    const sortedTasks = [...parentTasks].sort((a, b) => b.title.length - a.title.length);
    let lastParentMatch: {
      start: number;
      end: number;
      task: ParentTaskOption;
      raw: string;
    } | null = null;

    for (let pos = 0; pos < working.length; pos++) {
      if (working[pos] !== "^") continue;
      if (pos > 0 && !/\s/.test(working[pos - 1])) continue;

      const afterCaret = working.slice(pos + 1);
      let matched = false;

      // Try exact match against known task titles (longest first)
      for (const t of sortedTasks) {
        const tName = t.title.toLowerCase();
        if (afterCaret.toLowerCase().startsWith(tName)) {
          const charAfter = afterCaret[tName.length];
          if (charAfter === undefined || /\s/.test(charAfter)) {
            lastParentMatch = {
              start: pos,
              end: pos + 1 + t.title.length,
              task: t,
              raw: working.slice(pos, pos + 1 + t.title.length),
            };
            matched = true;
            break;
          }
        }
      }

      // Fall back to prefix match on single word
      if (!matched) {
        const wordMatch = afterCaret.match(/^(\S+)/);
        if (wordMatch) {
          const query = wordMatch[1].toLowerCase();
          const t = parentTasks.find(
            (tt) => tt.title.toLowerCase() === query || tt.title.toLowerCase().startsWith(query),
          );
          if (t) {
            lastParentMatch = {
              start: pos,
              end: pos + 1 + wordMatch[1].length,
              task: t,
              raw: working.slice(pos, pos + 1 + wordMatch[1].length),
            };
          }
        }
      }
    }

    if (lastParentMatch) {
      parentId = lastParentMatch.task.id;
      parentName = lastParentMatch.task.title;
      tokens.push({
        type: "parent",
        raw: lastParentMatch.raw,
        label: lastParentMatch.task.title,
        startIndex: lastParentMatch.start,
        endIndex: lastParentMatch.end,
      });
      working = working.slice(0, lastParentMatch.start) + working.slice(lastParentMatch.end);
    }
  }

  // Step 3: Impact (!high, !mid, !low, !min, !p1-!p4) — last wins, only last removed
  if (!dismissed.has("impact")) {
    let lastImpactMatch: RegExpMatchArray | null = null;
    for (const impactMatch of working.matchAll(new RegExp(IMPACT_PATTERN.source, "gi"))) {
      const keyword = impactMatch[1].toLowerCase();
      if (IMPACT_MAP[keyword] !== undefined) {
        lastImpactMatch = impactMatch;
      }
    }
    if (lastImpactMatch) {
      const keyword = lastImpactMatch[1].toLowerCase();
      impact = IMPACT_MAP[keyword];
      const start = lastImpactMatch.index ?? 0;
      const end = start + lastImpactMatch[0].length;
      tokens.push({
        type: "impact",
        raw: lastImpactMatch[0],
        label: IMPACT_LABEL_MAP[impact] ?? keyword,
        startIndex: start,
        endIndex: end,
      });
      working = working.slice(0, start) + working.slice(end);
    }
  }

  // Step 4: Clarity (?auto, ?brain, ?normal) — last wins, only last removed
  if (!dismissed.has("clarity")) {
    let lastClarityMatch: RegExpMatchArray | null = null;
    for (const clarityMatch of working.matchAll(new RegExp(CLARITY_PATTERN.source, "gi"))) {
      const keyword = clarityMatch[1].toLowerCase();
      if (CLARITY_MAP[keyword]) {
        lastClarityMatch = clarityMatch;
      }
    }
    if (lastClarityMatch) {
      const keyword = lastClarityMatch[1].toLowerCase();
      clarity = CLARITY_MAP[keyword];
      const start = lastClarityMatch.index ?? 0;
      const end = start + lastClarityMatch[0].length;
      tokens.push({
        type: "clarity",
        raw: lastClarityMatch[0],
        label: CLARITY_LABEL_MAP[clarity] ?? clarity,
        startIndex: start,
        endIndex: end,
      });
      working = working.slice(0, start) + working.slice(end);
    }
  }

  // Step 5: Duration (30m, 1h, 2h30m) — last wins, only last removed
  if (!dismissed.has("duration")) {
    let lastDurationMatch: { match: RegExpMatchArray; minutes: number } | null = null;
    for (const durationMatch of working.matchAll(new RegExp(DURATION_PATTERN.source, "g"))) {
      const parsed = parseDuration(durationMatch[1]);
      if (parsed !== null) {
        lastDurationMatch = { match: durationMatch, minutes: parsed };
      }
    }
    if (lastDurationMatch) {
      durationMinutes = lastDurationMatch.minutes;
      const start = lastDurationMatch.match.index ?? 0;
      const end = start + lastDurationMatch.match[0].length;
      tokens.push({
        type: "duration",
        raw: lastDurationMatch.match[0],
        label: formatDurationShort(durationMinutes),
        startIndex: start,
        endIndex: end,
      });
      working = working.slice(0, start) + working.slice(end);
    }
  }

  // Step 6: Date/time (chrono-node + abbreviations) — last wins, only last removed
  if (!dismissed.has("date")) {
    const dateResult = parseDateFromText(working);
    if (dateResult) {
      scheduledDate = dateResult.date;
      scheduledTime = dateResult.time;
      tokens.push({
        type: "date",
        raw: dateResult.matchedText,
        label: formatDateLabel(dateResult.date, dateResult.time),
        startIndex: dateResult.startIndex,
        endIndex: dateResult.endIndex,
      });
      working = working.slice(0, dateResult.startIndex) + working.slice(dateResult.endIndex);
    }
  }

  // Step 7: Clean title — collapse whitespace, trim
  // Keep only unique token types (last wins already handled above)
  const seenTypes = new Set<string>();
  const uniqueTokens: ParsedToken[] = [];
  for (let i = tokens.length - 1; i >= 0; i--) {
    if (!seenTypes.has(tokens[i].type)) {
      seenTypes.add(tokens[i].type);
      uniqueTokens.unshift(tokens[i]);
    }
  }

  const title = working.replace(/\s{2,}/g, " ").trim();

  return {
    title,
    description,
    domainId,
    domainName,
    parentId,
    parentName,
    impact,
    clarity,
    durationMinutes,
    scheduledDate,
    scheduledTime,
    tokens: uniqueTokens,
  };
}

// ─── Autocomplete ───────────────────────────────────────────────────────────

const CLARITY_SUGGESTIONS: AutocompleteSuggestion[] = [
  {
    type: "clarity",
    value: "autopilot",
    label: "Autopilot",
    icon: "\u{1F9DF}",
    colorClass: "text-[var(--autopilot-color)]",
  },
  {
    type: "clarity",
    value: "normal",
    label: "Normal",
    icon: "\u2615",
    colorClass: "text-[var(--normal-color)]",
  },
  {
    type: "clarity",
    value: "brainstorm",
    label: "Brainstorm",
    icon: "\u{1F9E0}",
    colorClass: "text-[var(--brainstorm-color)]",
  },
];

const IMPACT_SUGGESTIONS: AutocompleteSuggestion[] = [
  {
    type: "impact",
    value: "high",
    label: "High",
    icon: null,
    colorClass: "text-red-600 dark:text-red-400",
  },
  {
    type: "impact",
    value: "mid",
    label: "Mid",
    icon: null,
    colorClass: "text-amber-600 dark:text-amber-400",
  },
  {
    type: "impact",
    value: "low",
    label: "Low",
    icon: null,
    colorClass: "text-green-600 dark:text-green-400",
  },
  {
    type: "impact",
    value: "min",
    label: "Min",
    icon: null,
    colorClass: "text-gray-600 dark:text-gray-400",
  },
];

export function getAutocompleteSuggestions(
  input: string,
  cursorPos: number,
  domains: DomainResponse[],
  parentTasks?: ParentTaskOption[],
): AutocompleteResult | null {
  // Scan backwards from cursor to find trigger character
  let i = cursorPos - 1;
  while (i >= 0 && /[a-zA-Z0-9_-]/.test(input[i])) {
    i--;
  }

  if (i < 0) return null;

  const triggerChar = input[i];
  if (triggerChar !== "#" && triggerChar !== "?" && triggerChar !== "!" && triggerChar !== "^")
    return null;

  // Ensure trigger is at start of input or preceded by whitespace
  if (i > 0 && !/\s/.test(input[i - 1])) return null;

  const prefix = input.slice(i + 1, cursorPos).toLowerCase();
  const triggerStart = i;
  const triggerEnd = cursorPos;

  if (triggerChar === "#") {
    const activeDomains = domains.filter((d) => !d.is_archived);
    let matches: DomainResponse[];
    if (!prefix) {
      matches = activeDomains;
    } else {
      const prefixMatches = activeDomains.filter((d) => d.name.toLowerCase().startsWith(prefix));
      const includesMatches = activeDomains.filter(
        (d) => !d.name.toLowerCase().startsWith(prefix) && d.name.toLowerCase().includes(prefix),
      );
      matches = [...prefixMatches, ...includesMatches];
    }

    return {
      suggestions: matches.map((d) => ({
        type: "domain" as const,
        value: d.id,
        label: d.name,
        icon: d.icon,
      })),
      triggerStart,
      triggerEnd,
      type: "domain",
    };
  }

  if (triggerChar === "!") {
    let filtered: AutocompleteSuggestion[];
    if (!prefix) {
      filtered = IMPACT_SUGGESTIONS;
    } else if (/^[1-4]$/.test(prefix)) {
      // Bare digit: show only the matching priority (1→High, 2→Mid, 3→Low, 4→Min)
      filtered = [IMPACT_SUGGESTIONS[Number.parseInt(prefix, 10) - 1]];
    } else {
      filtered = IMPACT_SUGGESTIONS.filter((s) => s.label.toLowerCase().startsWith(prefix));
    }

    return {
      suggestions: filtered,
      triggerStart,
      triggerEnd,
      type: "impact",
    };
  }

  if (triggerChar === "^") {
    if (!parentTasks || parentTasks.length === 0) return null;

    let matches: ParentTaskOption[];
    if (!prefix) {
      matches = parentTasks;
    } else {
      const prefixMatches = parentTasks.filter((t) => t.title.toLowerCase().startsWith(prefix));
      const includesMatches = parentTasks.filter(
        (t) => !t.title.toLowerCase().startsWith(prefix) && t.title.toLowerCase().includes(prefix),
      );
      matches = [...prefixMatches, ...includesMatches];
    }

    // Sort by domain name (grouped), then alphabetically by title within each domain
    const domainMap = new Map(domains.map((d) => [d.id, d]));
    matches.sort((a, b) => {
      const da = a.domain_id != null ? domainMap.get(a.domain_id) : null;
      const db = b.domain_id != null ? domainMap.get(b.domain_id) : null;
      const nameA = da?.name ?? "";
      const nameB = db?.name ?? "";
      if (nameA !== nameB) return nameA.localeCompare(nameB);
      return a.title.localeCompare(b.title);
    });

    return {
      suggestions: matches.slice(0, 10).map((t) => {
        const domain = t.domain_id != null ? domainMap.get(t.domain_id) : null;
        return {
          type: "parent" as const,
          value: t.id,
          label: t.title,
          icon: domain?.icon ?? null,
          secondaryLabel: domain?.name ?? null,
        };
      }),
      triggerStart,
      triggerEnd,
      type: "parent",
    };
  }

  // triggerChar === "?"
  const filtered = prefix
    ? CLARITY_SUGGESTIONS.filter((s) => s.label.toLowerCase().startsWith(prefix))
    : CLARITY_SUGGESTIONS;

  return {
    suggestions: filtered,
    triggerStart,
    triggerEnd,
    type: "clarity",
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function parseDuration(raw: string): number | null {
  const match = raw.match(/^(?:(\d+)(?:hrs?|h))?\s?(?:(\d+)(?:mins?|m))?$/i);
  if (!match || (!match[1] && !match[2])) return null;
  const hours = match[1] ? Number.parseInt(match[1], 10) : 0;
  const minutes = match[2] ? Number.parseInt(match[2], 10) : 0;
  const total = hours * 60 + minutes;
  return total >= 5 && total <= 1440 ? total : null;
}

function formatDurationShort(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h${m}m` : `${h}h`;
}

/** Abbreviations chrono-node doesn't handle natively, with optional trailing time */
const DATE_ABBR_PATTERN =
  /\b(tmr|tmrw|tod|tom|yes|yest)(?:\s+(?:at\s+)?(\d{1,2}(?::\d{2})?(?:\s*[ap]m)?))?(?![a-zA-Z])/gi;

/** Reject ambiguous chrono results (bare month names like "Jan", "May", "March"). */
function isLikelyDate(result: chrono.ParsedResult): boolean {
  const text = result.text.trim();
  // Reject bare ordinals: "2nd", "the 3rd" — usually "2nd draft", not a date
  if (/^\d+(st|nd|rd|th)$/i.test(text)) return false;
  if (/^the\s+\d+(st|nd|rd|th)$/i.test(text)) return false;
  // Accept if chrono is certain about day, weekday, or hour
  if (result.start.isCertain("day")) return true;
  if (result.start.isCertain("weekday")) return true;
  if (result.start.isCertain("hour")) return true;
  // Reject everything else — bare month names like "Jan", "May", "March"
  return false;
}

interface DateMatch {
  date: string;
  time: string | null;
  matchedText: string;
  startIndex: number;
  endIndex: number;
}

function parseDateFromText(text: string): DateMatch | null {
  const allMatches: DateMatch[] = [];

  // 1. Handle short abbreviations (tod → today, tom/tmr/tmrw → tomorrow, yes/yest → yesterday)
  //    Also captures optional trailing time: "tom 9:00", "tod at 3pm", "tmrw 14:30"
  for (const m of text.matchAll(DATE_ABBR_PATTERN)) {
    const abbr = m[1].toLowerCase();
    const d = new Date();
    if (abbr === "tod") {
      // today — offset 0
    } else if (abbr === "yes" || abbr === "yest") {
      d.setDate(d.getDate() - 1);
    } else {
      d.setDate(d.getDate() + 1); // tom, tmr, tmrw → tomorrow
    }

    // Parse optional time from capture group 2 (e.g. "9:00", "3pm", "14:30")
    let timeStr: string | null = null;
    if (m[2]) {
      timeStr = parseTimeString(m[2]);
    }

    allMatches.push({
      date: toDateString(d),
      time: timeStr,
      matchedText: m[0],
      startIndex: m.index ?? 0,
      endIndex: (m.index ?? 0) + m[0].length,
    });
  }

  // 2. Run chrono-node for natural language (today, tomorrow, next monday, jan 15 at 3pm, etc.)
  //    Skip chrono results that overlap with abbreviation matches (abbr takes priority)
  for (const result of chrono.parse(text)) {
    if (!isLikelyDate(result)) continue;
    const chronoStart = result.index;
    const chronoEnd = result.index + result.text.length;
    // Skip if this chrono result overlaps with any abbreviation match
    const overlaps = allMatches.some(
      (am) => chronoStart < am.endIndex && chronoEnd > am.startIndex,
    );
    if (overlaps) continue;
    const jsDate = result.start.date();
    let timeStr: string | null = null;
    if (result.start.isCertain("hour")) {
      const h = result.start.get("hour") ?? 0;
      const min = result.start.get("minute") ?? 0;
      timeStr = `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
    }
    allMatches.push({
      date: toDateString(jsDate),
      time: timeStr,
      matchedText: result.text,
      startIndex: result.index,
      endIndex: result.index + result.text.length,
    });
  }

  if (allMatches.length === 0) return null;

  // 3. Last-wins: take the match with the highest start position.
  //    "Plan tomorrow's party tom" → only "tom" (last) becomes the date.
  allMatches.sort((a, b) => a.startIndex - b.startIndex);
  return allMatches[allMatches.length - 1];
}

/** Parse a short time string like "9", "9:00", "3pm", "14:30" into "HH:MM" format. */
function parseTimeString(raw: string): string | null {
  const cleaned = raw.trim().toLowerCase();
  const match = cleaned.match(/^(\d{1,2})(?::(\d{2}))?\s*([ap]m)?$/);
  if (!match) return null;

  let hour = Number.parseInt(match[1], 10);
  const minute = match[2] ? Number.parseInt(match[2], 10) : 0;
  const ampm = match[3];

  if (ampm === "pm" && hour < 12) hour += 12;
  if (ampm === "am" && hour === 12) hour = 0;
  if (hour > 23 || minute > 59) return null;

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function formatDateLabel(date: string, time: string | null): string {
  const d = new Date(`${date}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const dateD = new Date(d);
  dateD.setHours(0, 0, 0, 0);

  let label: string;
  if (dateD.getTime() === today.getTime()) {
    label = i18n.t("date.today");
  } else if (dateD.getTime() === tomorrow.getTime()) {
    label = i18n.t("date.tomorrow");
  } else {
    label = d.toLocaleDateString(i18n.resolvedLanguage ?? "en", { month: "short", day: "numeric" });
  }

  if (time) {
    const [h, m] = time.split(":");
    const hour = Number.parseInt(h, 10);
    const minute = m;
    const ampm = hour >= 12 ? i18n.t("date.pm") : i18n.t("date.am");
    const h12 = hour % 12 || 12;
    label += ` ${h12}:${minute} ${ampm}`;
  }

  return label;
}
