import { useQueryClient } from "@tanstack/react-query";
import { Loader2, X } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import type { DomainResponse, TaskCreate } from "@/api/model";
import {
  useCreateTaskApiV1TasksPost,
  useDeleteTaskApiV1TasksTaskIdDelete,
} from "@/api/queries/tasks/tasks";
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
import { useCrypto } from "@/hooks/use-crypto";
import { dashboardTasksKey } from "@/lib/query-keys";
import {
  type AutocompleteSuggestion,
  EMPTY_PARSED,
  getAutocompleteSuggestions,
  type ParsedTaskMetadata,
  type ParsedToken,
  parseTaskInput,
} from "@/lib/task-parser";

// ─── Types ──────────────────────────────────────────────────────────────────

interface TaskQuickAddProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  domains: DomainResponse[];
}

// ─── Pill colors per token type ─────────────────────────────────────────────

const PILL_STYLES: Record<string, string> = {
  domain: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  impact: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  clarity: "bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300",
  duration: "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300",
  date: "bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
  description: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
};

const PILL_ICONS: Record<string, string> = {
  domain: "@",
  impact: "!",
  clarity: "?",
  duration: "\u23F1", // stopwatch
  date: "\uD83D\uDCC5", // calendar
  description: "//",
};

// ─── Component ──────────────────────────────────────────────────────────────

export function TaskQuickAdd({ open, onOpenChange, domains }: TaskQuickAddProps) {
  const queryClient = useQueryClient();
  const { encryptTaskFields } = useCrypto();
  const inputRef = useRef<HTMLInputElement>(null);

  // Core state
  const [rawInput, setRawInput] = useState("");
  const [parsed, setParsed] = useState<ParsedTaskMetadata>({
    ...EMPTY_PARSED,
  });
  const [dismissedTokens, setDismissedTokens] = useState<Map<string, string>>(new Map());

  // Autocomplete state
  const [acVisible, setAcVisible] = useState(false);
  const [acSuggestions, setAcSuggestions] = useState<AutocompleteSuggestion[]>([]);
  const [acSelectedIndex, setAcSelectedIndex] = useState(0);
  const [acTriggerInfo, setAcTriggerInfo] = useState<{
    start: number;
    end: number;
    type: string;
  } | null>(null);

  // Preferences (persisted to localStorage)
  const [keepOpen, setKeepOpen] = useState(() => localStorage.getItem("qa-keep-open") === "1");
  const [showHints, setShowHints] = useState(
    () => localStorage.getItem("qa-hints-dismissed") !== "1",
  );

  const createMutation = useCreateTaskApiV1TasksPost();
  const deleteMutation = useDeleteTaskApiV1TasksTaskIdDelete();

  // ─── Handlers ───────────────────────────────────────────────────────────

  const resetForm = useCallback(() => {
    setRawInput("");
    setParsed({ ...EMPTY_PARSED });
    setDismissedTokens(new Map());
    setAcVisible(false);
    setAcSuggestions([]);
    setAcSelectedIndex(0);
    setAcTriggerInfo(null);
  }, []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setRawInput(value);

      // Prune stale dismissals — keep only those whose raw text is still in the input
      const stillValid = new Map<string, string>();
      for (const [type, rawText] of dismissedTokens) {
        if (value.includes(rawText)) stillValid.set(type, rawText);
      }
      setDismissedTokens(stillValid);

      // Parse metadata
      const result = parseTaskInput(value, domains, new Set(stillValid.keys()));
      setParsed(result);

      // Check for autocomplete trigger
      const cursorPos = e.target.selectionStart ?? value.length;
      const acResult = getAutocompleteSuggestions(value, cursorPos, domains);
      if (acResult && acResult.suggestions.length > 0) {
        setAcSuggestions(acResult.suggestions);
        setAcTriggerInfo({
          start: acResult.triggerStart,
          end: acResult.triggerEnd,
          type: acResult.type,
        });
        setAcVisible(true);
        setAcSelectedIndex(0);
      } else {
        setAcVisible(false);
      }
    },
    [domains, dismissedTokens],
  );

  const handleAcSelect = useCallback(
    (suggestion: AutocompleteSuggestion) => {
      if (!acTriggerInfo) return;

      const prefix = suggestion.type === "domain" ? "@" : suggestion.type === "impact" ? "!" : "?";
      const insertText =
        suggestion.type === "domain" ? suggestion.label : suggestion.label.toLowerCase();
      const before = rawInput.slice(0, acTriggerInfo.start);
      const after = rawInput.slice(acTriggerInfo.end);
      const newInput = `${before}${prefix}${insertText} ${after}`;

      setRawInput(newInput);
      setParsed(parseTaskInput(newInput, domains));
      setAcVisible(false);

      // Restore focus with cursor after inserted text
      requestAnimationFrame(() => {
        const cursorPos = acTriggerInfo.start + prefix.length + insertText.length + 1;
        inputRef.current?.focus();
        inputRef.current?.setSelectionRange(cursorPos, cursorPos);
      });
    },
    [acTriggerInfo, rawInput, domains],
  );

  const handleDismissToken = useCallback(
    (token: ParsedToken) => {
      const newDismissed = new Map(dismissedTokens);
      newDismissed.set(token.type, token.raw);
      setDismissedTokens(newDismissed);
      setParsed(parseTaskInput(rawInput, domains, new Set(newDismissed.keys())));
    },
    [dismissedTokens, rawInput, domains],
  );

  const handleSave = useCallback(async () => {
    if (createMutation.isPending) return;
    if (!parsed.title.trim()) return;

    const encrypted = await encryptTaskFields({
      title: parsed.title.trim(),
      description: parsed.description?.trim() || null,
    });

    const data: TaskCreate = {
      title: encrypted.title!,
      description: encrypted.description,
      domain_id: parsed.domainId,
      impact: parsed.impact ?? 4,
      clarity: parsed.clarity ?? "normal",
      duration_minutes: parsed.durationMinutes,
      scheduled_date: parsed.scheduledDate,
      scheduled_time: parsed.scheduledTime,
    };

    createMutation.mutate(
      { data },
      {
        onSuccess: (created) => {
          queryClient.invalidateQueries({
            queryKey: dashboardTasksKey(),
          });
          toast.success(`Created "${parsed.title.trim()}"`, {
            id: `create-${created.id}`,
            action: {
              label: "Undo",
              onClick: () => {
                deleteMutation.mutate(
                  { taskId: created.id },
                  {
                    onSuccess: () =>
                      queryClient.invalidateQueries({
                        queryKey: dashboardTasksKey(),
                      }),
                    onError: () => toast.error("Undo failed"),
                  },
                );
              },
            },
          });

          if (keepOpen) {
            resetForm();
            requestAnimationFrame(() => inputRef.current?.focus());
          } else {
            resetForm();
            onOpenChange(false);
          }
        },
        onError: () => toast.error("Failed to create task"),
      },
    );
  }, [
    parsed,
    encryptTaskFields,
    createMutation,
    deleteMutation,
    queryClient,
    keepOpen,
    resetForm,
    onOpenChange,
  ]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Autocomplete navigation takes priority
      if (acVisible && acSuggestions.length > 0) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setAcSelectedIndex((i) => Math.min(i + 1, acSuggestions.length - 1));
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setAcSelectedIndex((i) => Math.max(i - 1, 0));
          return;
        }
        if (e.key === "Enter" || e.key === "Tab") {
          e.preventDefault();
          handleAcSelect(acSuggestions[acSelectedIndex]);
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          setAcVisible(false);
          return;
        }
      }

      // Submit on Enter when autocomplete is not showing
      if (e.key === "Enter" && !e.shiftKey && parsed.title.trim() && !createMutation.isPending) {
        e.preventDefault();
        handleSave();
      }
    },
    [
      acVisible,
      acSuggestions,
      acSelectedIndex,
      handleAcSelect,
      parsed.title,
      handleSave,
      createMutation.isPending,
    ],
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
              placeholder="e.g. Fix login @Work !high 30m tomorrow"
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
                  <Kbd>@</Kbd> domain <Kbd>!</Kbd> impact <Kbd>?</Kbd> clarity
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

          <Button onClick={handleSave} disabled={createMutation.isPending || !parsed.title.trim()}>
            {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function MetadataPill({ token, onDismiss }: { token: ParsedToken; onDismiss: () => void }) {
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

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center rounded border border-muted-foreground/20 bg-muted px-1 py-px text-[10px] font-mono">
      {children}
    </kbd>
  );
}
