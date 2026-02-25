/**
 * Inline task input parser for Smart Quick Add V2.
 *
 * Parses a single text input to extract task metadata tokens:
 *   @Domain   → domain assignment (fuzzy autocomplete)
 *   !high/!mid/!low/!min → impact 1-4
 *   ?auto/?brain/?normal → clarity mode
 *   30m / 1h / 2h30m → duration in minutes
 *   Natural language → scheduled date/time (via chrono-node)
 *   // → description separator
 */

import * as chrono from "chrono-node";
import type { DomainResponse } from "@/api/model";
import { toDateString } from "@/lib/calendar-utils";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ParsedToken {
  type: "domain" | "impact" | "clarity" | "duration" | "date" | "description";
  raw: string;
  label: string;
  startIndex: number;
  endIndex: number;
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
  tokens: ParsedToken[];
}

export interface AutocompleteSuggestion {
  type: "domain" | "clarity" | "impact";
  value: string | number;
  label: string;
  icon?: string | null;
  colorClass?: string | null;
}

export interface AutocompleteResult {
  suggestions: AutocompleteSuggestion[];
  triggerStart: number;
  triggerEnd: number;
  type: "domain" | "clarity" | "impact";
}

// ─── Constants ──────────────────────────────────────────────────────────────

const IMPACT_PATTERN = /!(high|mid|low|min|p[1-4])\b/gi;
const IMPACT_MAP: Record<string, number> = {
  high: 1,
  mid: 2,
  low: 3,
  min: 4,
  p1: 1,
  p2: 2,
  p3: 3,
  p4: 4,
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

const DURATION_PATTERN = /(?<![a-zA-Z])(\d+h\d+m|\d+h|\d+m)(?![a-zA-Z])/g;

const DOMAIN_PATTERN = /@(\S+)/g;

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
  tokens: [],
};

export function parseTaskInput(
  input: string,
  domains: DomainResponse[],
  dismissedTypes?: Set<string>,
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

  // Step 2: Domain (@Name) — last matched wins, only last removed from title
  if (!dismissed.has("domain")) {
    const activeDomains = domains.filter((d) => !d.is_archived);
    let lastDomainMatch: { match: RegExpExecArray; domain: DomainResponse } | null = null;
    for (const domainMatch of working.matchAll(new RegExp(DOMAIN_PATTERN.source, "g"))) {
      const matchStart = domainMatch.index ?? 0;
      // Skip if @ is not at start or preceded by whitespace (avoids emails like user@domain)
      if (matchStart > 0 && !/\s/.test(working[matchStart - 1])) continue;
      const query = domainMatch[1].toLowerCase();
      const matched = activeDomains.find(
        (d) => d.name.toLowerCase() === query || d.name.toLowerCase().startsWith(query),
      );
      if (matched) {
        lastDomainMatch = { match: domainMatch as unknown as RegExpExecArray, domain: matched };
      }
    }
    if (lastDomainMatch) {
      const { match: dm, domain: d } = lastDomainMatch;
      domainId = d.id;
      domainName = d.name;
      const start = dm.index ?? 0;
      const end = start + dm[0].length;
      tokens.push({
        type: "domain",
        raw: dm[0],
        label: `${d.icon ? `${d.icon} ` : ""}${d.name}`,
        startIndex: start,
        endIndex: end,
      });
      working = working.slice(0, start) + working.slice(end);
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
): AutocompleteResult | null {
  // Scan backwards from cursor to find @ or ? trigger
  let i = cursorPos - 1;
  while (i >= 0 && /[a-zA-Z0-9_-]/.test(input[i])) {
    i--;
  }

  if (i < 0) return null;

  const triggerChar = input[i];
  if (triggerChar !== "@" && triggerChar !== "?" && triggerChar !== "!") return null;

  // Ensure trigger is at start of input or preceded by whitespace
  if (i > 0 && !/\s/.test(input[i - 1])) return null;

  const prefix = input.slice(i + 1, cursorPos).toLowerCase();
  const triggerStart = i;
  const triggerEnd = cursorPos;

  if (triggerChar === "@") {
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
    const filtered = prefix
      ? IMPACT_SUGGESTIONS.filter((s) => s.label.toLowerCase().startsWith(prefix))
      : IMPACT_SUGGESTIONS;

    return {
      suggestions: filtered,
      triggerStart,
      triggerEnd,
      type: "impact",
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
  const match = raw.match(/^(?:(\d+)h)?(?:(\d+)m)?$/);
  if (!match) return null;
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

/** Abbreviations chrono-node doesn't handle natively */
const DATE_ABBR_PATTERN = /\b(tmr|tmrw)\b/gi;

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

  // 1. Handle short abbreviations (tmr, tmrw → tomorrow)
  for (const m of text.matchAll(DATE_ABBR_PATTERN)) {
    const d = new Date();
    d.setDate(d.getDate() + 1); // tmr, tmrw → tomorrow
    allMatches.push({
      date: toDateString(d),
      time: null,
      matchedText: m[0],
      startIndex: m.index ?? 0,
      endIndex: (m.index ?? 0) + m[0].length,
    });
  }

  // 2. Run chrono-node for natural language (today, tomorrow, next monday, jan 15 at 3pm, etc.)
  for (const result of chrono.parse(text)) {
    if (!isLikelyDate(result)) continue;
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
    label = "Today";
  } else if (dateD.getTime() === tomorrow.getTime()) {
    label = "Tomorrow";
  } else {
    label = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  if (time) {
    const [h, m] = time.split(":");
    const hour = Number.parseInt(h, 10);
    const minute = m;
    const ampm = hour >= 12 ? "PM" : "AM";
    const h12 = hour % 12 || 12;
    label += ` ${h12}:${minute} ${ampm}`;
  }

  return label;
}
