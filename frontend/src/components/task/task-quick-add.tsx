import { Loader2, X } from "lucide-react";
import { useCallback, useState } from "react";
import type { DomainResponse } from "@/api/model";
import { SmartInputAutocomplete } from "@/components/task/smart-input-autocomplete";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useSmartInput } from "@/hooks/use-smart-input";
import { useTaskCreate } from "@/hooks/use-task-create";
import type { ParsedToken } from "@/lib/task-parser";

// ─── Types ──────────────────────────────────────────────────────────────────

interface TaskQuickAddProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  domains: DomainResponse[];
}

// ─── Pill colors per token type ─────────────────────────────────────────────

export const PILL_STYLES: Record<string, string> = {
  domain: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  impact: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  clarity: "bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300",
  duration: "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300",
  date: "bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
  description: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
};

export const PILL_ICONS: Record<string, string> = {
  domain: "#",
  impact: "!",
  clarity: "?",
  duration: "\u23F1", // stopwatch
  date: "\uD83D\uDCC5", // calendar
  description: "//",
};

// ─── Component ──────────────────────────────────────────────────────────────

export function TaskQuickAdd({ open, onOpenChange, domains }: TaskQuickAddProps) {
  const {
    inputRef,
    rawInput,
    parsed,
    acVisible,
    acSuggestions,
    acSelectedIndex,
    handleInputChange,
    handleAcSelect,
    handleDismissToken,
    handleKeyDown: handleAcKeyDown,
    reset: resetForm,
  } = useSmartInput({ domains });

  // Preferences (persisted to localStorage)
  const [keepOpen, setKeepOpen] = useState(() => localStorage.getItem("qa-keep-open") === "1");
  const [showHints, setShowHints] = useState(
    () => localStorage.getItem("qa-hints-dismissed") !== "1",
  );

  const { create, isPending } = useTaskCreate();

  // biome-ignore lint/correctness/useExhaustiveDependencies: inputRef is a stable ref
  const handleSave = useCallback(async () => {
    if (isPending) return;
    if (!parsed.title.trim()) return;

    await create(
      {
        title: parsed.title.trim(),
        description: parsed.description,
        domain_id: parsed.domainId,
        impact: parsed.impact ?? undefined,
        clarity: parsed.clarity ?? undefined,
        duration_minutes: parsed.durationMinutes,
        scheduled_date: parsed.scheduledDate,
        scheduled_time: parsed.scheduledTime,
      },
      {
        onSuccess: () => {
          if (keepOpen) {
            resetForm();
            requestAnimationFrame(() => inputRef.current?.focus());
          } else {
            resetForm();
            onOpenChange(false);
          }
        },
      },
    );
  }, [parsed, isPending, create, keepOpen, resetForm, onOpenChange]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (handleAcKeyDown(e)) return;
      if (e.key === "Enter" && !e.shiftKey && parsed.title.trim() && !isPending) {
        e.preventDefault();
        handleSave();
      }
    },
    [handleAcKeyDown, parsed.title, handleSave, isPending],
  );

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) resetForm();
        onOpenChange(v);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Quick Add Task</DialogTitle>
          <DialogDescription>
            Type naturally — metadata is detected automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2.5">
          {/* Input with autocomplete */}
          <div className="relative">
            <Input
              ref={inputRef}
              value={rawInput}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="e.g. Fix login #Work !high 30m tomorrow"
              autoFocus
            />
            <SmartInputAutocomplete
              suggestions={acSuggestions}
              visible={acVisible}
              selectedIndex={acSelectedIndex}
              onSelect={handleAcSelect}
            />
          </div>

          {/* Metadata pills */}
          {parsed.tokens.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {parsed.tokens.map((token) => (
                <MetadataPill
                  key={token.type}
                  token={token}
                  onDismiss={() => handleDismissToken(token)}
                />
              ))}
            </div>
          )}

          {/* Syntax hints */}
          {showHints && (
            <div className="flex items-start gap-1.5">
              <div className="flex-1 text-[11px] text-muted-foreground leading-relaxed space-y-0.5">
                <p>
                  <Kbd>#</Kbd> domain <Kbd>!</Kbd> impact <Kbd>?</Kbd> clarity
                </p>
                <p>
                  <Kbd>30m</Kbd> / <Kbd>1h</Kbd> duration
                </p>
                <p>
                  <Kbd>tomorrow</Kbd> / <Kbd>jan 15</Kbd> / <Kbd>feb 13 at 3</Kbd> scheduled
                  datetime
                </p>
                <p>
                  <Kbd>{"//"}</Kbd> description
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowHints(false);
                  localStorage.setItem("qa-hints-dismissed", "1");
                }}
                className="shrink-0 text-muted-foreground/50 hover:text-muted-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )}
        </div>

        <DialogFooter className="flex items-center justify-between sm:justify-between">
          <label
            htmlFor="qa-keep-open"
            className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none"
          >
            <Checkbox
              id="qa-keep-open"
              checked={keepOpen}
              onCheckedChange={(v) => {
                const val = !!v;
                setKeepOpen(val);
                localStorage.setItem("qa-keep-open", val ? "1" : "0");
              }}
            />
            Keep open
          </label>

          <Button onClick={handleSave} disabled={isPending || !parsed.title.trim()}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

export function MetadataPill({ token, onDismiss }: { token: ParsedToken; onDismiss: () => void }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${PILL_STYLES[token.type] ?? ""}`}
    >
      <span className="opacity-50">{PILL_ICONS[token.type]}</span>
      {token.label}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDismiss();
        }}
        className="ml-0.5 opacity-40 hover:opacity-100 transition-opacity"
      >
        <X className="h-2.5 w-2.5" />
      </button>
    </span>
  );
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center rounded border border-muted-foreground/20 bg-muted px-1 py-px text-[10px] font-mono">
      {children}
    </kbd>
  );
}
