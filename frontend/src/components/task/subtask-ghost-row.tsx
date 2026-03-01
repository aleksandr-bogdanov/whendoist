import { Plus } from "lucide-react";
import { motion } from "motion/react";
import { useCallback, useEffect, useState } from "react";
import type { TaskResponse } from "@/api/model";
import { useSmartInput } from "@/hooks/use-smart-input";
import { useTaskCreate } from "@/hooks/use-task-create";
import { useUIStore } from "@/stores/ui-store";
import { SmartInputAutocomplete } from "./smart-input-autocomplete";
import { MetadataPill } from "./task-quick-add";

interface SubtaskGhostRowProps {
  parentTask: TaskResponse;
  depth: number;
}

// Subtasks inherit parent's domain — #domain autocomplete is not needed.
// All other tokens (!impact, ?clarity, 30m, tomorrow, //) work without domains.
const EMPTY_DOMAINS: never[] = [];

export function SubtaskGhostRow({ parentTask, depth }: SubtaskGhostRowProps) {
  const [isEditing, setIsEditing] = useState(false);
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
    reset: resetSmartInput,
  } = useSmartInput({ domains: EMPTY_DOMAINS });
  const { create, isPending } = useTaskCreate();
  const { subtaskAddFocusId, clearSubtaskAddFocus, toggleExpandedSubtask } = useUIStore();

  const shouldAutoFocus = subtaskAddFocusId === parentTask.id;
  const hasRealSubtasks = (parentTask.subtasks?.length ?? 0) > 0;

  // biome-ignore lint/correctness/useExhaustiveDependencies: inputRef is a stable ref
  useEffect(() => {
    if (shouldAutoFocus) {
      setIsEditing(true);
      // Delay to let the expansion animation render the input
      const timer = setTimeout(() => {
        inputRef.current?.focus();
        clearSubtaskAddFocus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [shouldAutoFocus, clearSubtaskAddFocus]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: inputRef is a stable ref
  const handleCreate = useCallback(async () => {
    if (!parsed.title.trim()) return;

    resetSmartInput();
    requestAnimationFrame(() => inputRef.current?.focus());

    await create(
      {
        title: parsed.title.trim(),
        description: parsed.description,
        parent_id: parentTask.id,
        domain_id: parsed.domainId ?? parentTask.domain_id,
        impact: parsed.impact ?? undefined,
        clarity: parsed.clarity ?? undefined,
        duration_minutes: parsed.durationMinutes,
        scheduled_date: parsed.scheduledDate,
        scheduled_time: parsed.scheduledTime,
      },
      {
        toastMessage: `Created subtask "${parsed.title.trim()}"`,
        errorMessage: "Failed to create subtask",
      },
    );
  }, [parsed, parentTask.id, parentTask.domain_id, create, resetSmartInput]);

  const handleCancel = useCallback(() => {
    setIsEditing(false);
    resetSmartInput();
    // Collapse the expansion if parent has no real subtasks (was a temporary expand)
    if (!hasRealSubtasks) {
      toggleExpandedSubtask(parentTask.id);
    }
  }, [hasRealSubtasks, parentTask.id, toggleExpandedSubtask, resetSmartInput]);

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      transition={{ duration: 0.15, ease: "easeOut" }}
    >
      {isEditing ? (
        <div
          className="py-1.5 space-y-1"
          style={{ marginLeft: `${depth * 24}px`, paddingLeft: 12 }}
        >
          <div className="relative">
            <input
              ref={inputRef}
              type="text"
              value={rawInput}
              onChange={handleInputChange}
              onKeyDown={(e) => {
                if (handleAcKeyDown(e)) return;
                if (e.key === "Enter" && parsed.title.trim()) {
                  e.preventDefault();
                  handleCreate();
                }
                if (e.key === "Escape") {
                  handleCancel();
                }
              }}
              onBlur={() => {
                if (!rawInput.trim()) {
                  handleCancel();
                }
              }}
              placeholder="Subtask title... (!high 30m tomorrow)"
              className="w-full h-7 text-sm bg-transparent border-b border-border outline-none focus:border-primary px-1"
              disabled={isPending}
            />
            <SmartInputAutocomplete
              suggestions={acSuggestions}
              visible={acVisible}
              selectedIndex={acSelectedIndex}
              onSelect={handleAcSelect}
            />
          </div>
          {parsed.tokens.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {parsed.tokens.map((token) => (
                <MetadataPill
                  key={token.type}
                  token={token}
                  onDismiss={() => handleDismissToken(token)}
                />
              ))}
            </div>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => {
            setIsEditing(true);
            requestAnimationFrame(() => inputRef.current?.focus());
          }}
          className="flex items-center gap-1.5 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors w-full"
          style={{ marginLeft: `${depth * 24}px`, paddingLeft: 12 }}
        >
          <Plus className="h-3 w-3" />
          Add subtask
        </button>
      )}
    </motion.div>
  );
}
