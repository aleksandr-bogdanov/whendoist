/**
 * usePasteUrl — auto-converts pasted URLs into markdown links.
 *
 * When the user pastes a bare URL into a description textarea, this hook:
 * 1. Immediately inserts `[…](url)` as a placeholder (instant feedback)
 * 2. Fetches the page title from the backend
 * 3. Replaces `…` with the actual title
 *
 * If the pasted text is not a bare URL, the default paste behavior is preserved.
 */

import type { ClipboardEvent, RefObject } from "react";
import { useCallback, useRef } from "react";
import { getUrlTitleApiV1UrlTitlePost } from "@/api/queries/url/url";

const URL_RE = /^https?:\/\/\S+$/;
const PLACEHOLDER = "\u2026"; // "…"

interface UsePasteUrlOptions {
  getValue: () => string;
  setValue: (v: string) => void;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  onDirty?: () => void;
}

export function usePasteUrl({ getValue, setValue, textareaRef, onDirty }: UsePasteUrlOptions) {
  const fetchingRef = useRef(false);

  const onPaste = useCallback(
    (e: ClipboardEvent<HTMLTextAreaElement>) => {
      const text = e.clipboardData?.getData("text/plain")?.trim();
      if (!text || !URL_RE.test(text)) return; // Not a URL — let default paste happen

      e.preventDefault();

      const el = textareaRef.current;
      const current = getValue();
      const start = el?.selectionStart ?? current.length;
      const end = el?.selectionEnd ?? current.length;

      // Insert placeholder markdown link at cursor position
      const placeholder = `[${PLACEHOLDER}](${text})`;
      const next = current.slice(0, start) + placeholder + current.slice(end);
      setValue(next);
      onDirty?.();

      // Position cursor after the inserted link
      const cursorPos = start + placeholder.length;
      requestAnimationFrame(() => {
        el?.setSelectionRange(cursorPos, cursorPos);
      });

      // Fetch real title in background
      if (fetchingRef.current) return;
      fetchingRef.current = true;

      getUrlTitleApiV1UrlTitlePost({ url: text })
        .then((resp) => {
          const title = resp.title;
          if (!title || title === PLACEHOLDER) return;

          // Replace the placeholder with the real title (re-read current value)
          const current = getValue();
          setValue(current.replace(`[${PLACEHOLDER}](${text})`, `[${title}](${text})`));
        })
        .catch(() => {
          // Keep the placeholder — user can edit it manually
        })
        .finally(() => {
          fetchingRef.current = false;
        });
    },
    [getValue, setValue, textareaRef, onDirty],
  );

  return { onPaste };
}
