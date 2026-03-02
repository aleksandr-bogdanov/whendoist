import Fuse from "fuse.js";
import type { DomainResponse, TaskResponse } from "@/api/model";

export interface PaletteFilter {
  type: "date" | "domain" | "status";
  label: string;
  predicate: (task: TaskResponse, domain?: DomainResponse | null) => boolean;
}

/** All supported @-filter tokens with their display labels. */
export const FILTER_TOKENS = [
  "@today",
  "@tomorrow",
  "@overdue",
  "@unscheduled",
  "@week",
  "@completed",
] as const;

const todayStr = () => new Date().toISOString().split("T")[0];
const tomorrowStr = () => new Date(Date.now() + 86400000).toISOString().split("T")[0];

function weekEndStr(): string {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.toISOString().split("T")[0];
}

const DATE_FILTERS: Record<string, (task: TaskResponse) => boolean> = {
  "@today": (t) => t.scheduled_date === todayStr(),
  "@tomorrow": (t) => t.scheduled_date === tomorrowStr(),
  "@overdue": (t) =>
    t.status !== "completed" && t.scheduled_date !== null && t.scheduled_date < todayStr(),
  "@unscheduled": (t) => t.status !== "completed" && t.scheduled_date === null,
  "@week": (t) => {
    if (!t.scheduled_date) return false;
    const today = todayStr();
    const end = weekEndStr();
    return t.scheduled_date >= today && t.scheduled_date <= end;
  },
};

const STATUS_FILTERS: Record<string, (task: TaskResponse) => boolean> = {
  "@completed": (t) => t.status === "completed",
};

/**
 * Parse filter tokens from a search query.
 *
 * Extracts `@today`, `@tomorrow`, `@overdue`, `@unscheduled`, `@week`,
 * `@completed`, and `#DomainName` tokens. Returns the remaining query
 * text with filter tokens stripped.
 */
export function parseFilterTokens(
  query: string,
  domains: DomainResponse[],
): { cleanQuery: string; filters: PaletteFilter[] } {
  const filters: PaletteFilter[] = [];
  let remaining = query;

  // Extract @-filters
  for (const token of FILTER_TOKENS) {
    const regex = new RegExp(`${token}\\b`, "i");
    if (regex.test(remaining)) {
      remaining = remaining.replace(regex, "").trim();

      if (DATE_FILTERS[token]) {
        filters.push({
          type: "date",
          label: token,
          predicate: DATE_FILTERS[token],
        });
      } else if (STATUS_FILTERS[token]) {
        filters.push({
          type: "status",
          label: token,
          predicate: STATUS_FILTERS[token],
        });
      }
    }
  }

  // Extract #DomainName filter — fuzzy match against known domains
  const hashMatch = remaining.match(/#(\S+)/);
  if (hashMatch) {
    const domainQuery = hashMatch[1];
    const fuse = new Fuse(domains, {
      keys: ["name"],
      threshold: 0.4,
      ignoreLocation: true,
    });
    const results = fuse.search(domainQuery, { limit: 1 });
    if (results.length > 0) {
      const matchedDomain = results[0].item;
      remaining = remaining.replace(hashMatch[0], "").trim();
      filters.push({
        type: "domain",
        label: `#${matchedDomain.name}`,
        predicate: (_t, domain) => domain?.id === matchedDomain.id,
      });
    }
  }

  return {
    cleanQuery: remaining.replace(/\s{2,}/g, " ").trim(),
    filters,
  };
}
