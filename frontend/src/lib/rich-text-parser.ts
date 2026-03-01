/**
 * Rich-text parser — extracts markdown links and bare URLs from plain text.
 *
 * Returns an array of segments that can be rendered as React elements
 * (see components/ui/rich-text.tsx).  Zero dependencies.
 */

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type RichTextSegment =
  | { type: "text"; content: string }
  | { type: "link"; text: string; href: string }
  | { type: "bare-url"; href: string; display: string };

/* ------------------------------------------------------------------ */
/*  Regex                                                              */
/* ------------------------------------------------------------------ */

/**
 * Two alternatives:
 *   1. Markdown link: [text](https://...)
 *   2. Bare URL:      https://...
 *
 * Bare URLs exclude whitespace, angle brackets, quotes, and `]`
 * (to avoid consuming the closing bracket of a markdown link).
 */
const RICH_TEXT_RE = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)|(https?:\/\/[^\s<>"'\]]+)/g;

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Strip trailing sentence punctuation and unbalanced closing parens. */
function cleanTrailing(url: string): string {
  let cleaned = url;
  // Trailing .,;:!?
  while (/[.,;:!?]$/.test(cleaned)) {
    cleaned = cleaned.slice(0, -1);
  }
  // Trailing ) only if unbalanced (keeps Wikipedia-style URLs)
  while (cleaned.endsWith(")")) {
    const opens = (cleaned.match(/\(/g) || []).length;
    const closes = (cleaned.match(/\)/g) || []).length;
    if (closes > opens) {
      cleaned = cleaned.slice(0, -1);
    } else {
      break;
    }
  }
  return cleaned;
}

/** Truncate a URL for display: `domain.com/path…` */
function truncateUrl(href: string, maxLen = 40): string {
  try {
    const url = new URL(href);
    const host = url.hostname.replace(/^www\./, "");
    const rest = url.pathname + url.search + url.hash;
    if (rest === "/" || rest === "") return host;
    const full = host + rest;
    if (full.length <= maxLen) return full;
    const available = maxLen - host.length - 2; // 2 for "/…"
    if (available <= 0) return `${host}/\u2026`;
    return `${host}${rest.slice(0, available)}\u2026`;
  } catch {
    return href.length > maxLen ? `${href.slice(0, maxLen)}\u2026` : href;
  }
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/** Fast check — avoids running the regex when there are no links. */
export function hasLinks(input: string | null | undefined): boolean {
  if (!input) return false;
  return input.includes("](http") || input.includes("http://") || input.includes("https://");
}

/** Parse a string into segments of text, markdown links, and bare URLs. */
export function parseRichText(input: string): RichTextSegment[] {
  if (!input) return [];

  const segments: RichTextSegment[] = [];
  let lastIndex = 0;

  RICH_TEXT_RE.lastIndex = 0;
  let match = RICH_TEXT_RE.exec(input);

  while (match !== null) {
    // Preceding plain text
    if (match.index > lastIndex) {
      segments.push({ type: "text", content: input.slice(lastIndex, match.index) });
    }

    if (match[1] != null && match[2] != null) {
      // Markdown link [text](url)
      segments.push({ type: "link", text: match[1], href: match[2] });
      lastIndex = match.index + match[0].length;
    } else if (match[3] != null) {
      // Bare URL — clean trailing punctuation, then adjust lastIndex
      const raw = match[3];
      const cleaned = cleanTrailing(raw);
      segments.push({
        type: "bare-url",
        href: cleaned,
        display: truncateUrl(cleaned),
      });
      // Advance past the cleaned portion only (trailing chars become plain text)
      lastIndex = match.index + cleaned.length;
      RICH_TEXT_RE.lastIndex = lastIndex;
    }

    match = RICH_TEXT_RE.exec(input);
  }

  // Trailing plain text
  if (lastIndex < input.length) {
    segments.push({ type: "text", content: input.slice(lastIndex) });
  }

  return segments;
}
