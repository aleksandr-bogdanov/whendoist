/**
 * RichText — renders plain text with clickable links.
 *
 * Handles markdown links [text](url) and bare URLs.
 * Returns raw children when no links are present (zero overhead).
 *
 * Usage:
 *   <RichText>{task.title}</RichText>
 *   <RichText className="whitespace-pre-wrap">{task.description}</RichText>
 */

import type { MouseEvent, PointerEvent } from "react";
import { useMemo } from "react";
import {
  type RichTextSegment,
  hasLinks,
  parseRichText,
} from "@/lib/rich-text-parser";

interface RichTextProps {
  children: string;
  className?: string;
}

const LINK_CLASS =
  "text-primary underline decoration-primary/30 hover:decoration-primary transition-colors";

/** Open link in new tab; prevent parent button/drag handlers from firing. */
function handleLinkClick(e: MouseEvent<HTMLAnchorElement>) {
  e.stopPropagation();
  e.preventDefault();
  window.open(e.currentTarget.href, "_blank", "noopener,noreferrer");
}

/** Prevent dnd-kit drag initiation when clicking a link. */
function handleLinkPointerDown(e: PointerEvent<HTMLAnchorElement>) {
  e.stopPropagation();
}

function renderSegment(seg: RichTextSegment, i: number) {
  switch (seg.type) {
    case "text":
      return <span key={i}>{seg.content}</span>;
    case "link":
      return (
        <a
          key={i}
          href={seg.href}
          target="_blank"
          rel="noopener noreferrer"
          className={LINK_CLASS}
          onClick={handleLinkClick}
          onPointerDown={handleLinkPointerDown}
          title={seg.href}
        >
          {seg.text}
        </a>
      );
    case "bare-url":
      return (
        <a
          key={i}
          href={seg.href}
          target="_blank"
          rel="noopener noreferrer"
          className={LINK_CLASS}
          onClick={handleLinkClick}
          onPointerDown={handleLinkPointerDown}
          title={seg.href}
        >
          {seg.display}
        </a>
      );
  }
}

export function RichText({ children, className }: RichTextProps) {
  const segments = useMemo(
    () => (hasLinks(children) ? parseRichText(children) : null),
    [children],
  );

  if (!segments) return <>{children}</>;

  return <span className={className}>{segments.map(renderSegment)}</span>;
}
