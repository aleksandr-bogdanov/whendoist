/**
 * TaskDetailPanel — inline task editor for the dashboard right pane (desktop).
 *
 * Supports two modes:
 * - "edit": editing an existing task (populated from task prop)
 * - "create": creating a new task (empty fields)
 *
 * When mode is "idle" (no task selected, not creating), shows an empty state
 * with keyboard navigation hints.
 *
 * All form state + save/delete/complete logic lives in useTaskForm.
 * This component is a thin rendering shell.
 */

import { CheckCircle, Loader2, MousePointerClick, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { useEffect } from "react";
import type { DomainResponse, TaskResponse } from "@/api/model";
import { TaskActivityPanel } from "@/components/activity/activity-list";
import { TaskFieldsBody } from "@/components/task/task-fields-body";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTaskForm } from "@/hooks/use-task-form";

interface TaskDetailPanelProps {
  task: TaskResponse | null;
  domains: DomainResponse[];
  parentTasks: TaskResponse[];
  /** "idle" = no task, show empty state. "edit" = editing task. "create" = new task form. */
  mode: "idle" | "edit" | "create";
  /** Called when the user closes the panel (X button, Escape, or after create). */
  onClose: () => void;
}

export function TaskDetailPanel({
  task,
  domains,
  parentTasks,
  mode,
  onClose,
}: TaskDetailPanelProps) {
  if (mode === "idle") {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="text-center space-y-2">
          <MousePointerClick className="h-8 w-8 text-muted-foreground/30 mx-auto" />
          <p className="text-sm text-muted-foreground">Select a task to view details</p>
          <p className="text-xs text-muted-foreground/60">
            <kbd className="px-1 py-0.5 rounded border border-border text-[10px]">j</kbd>{" "}
            <kbd className="px-1 py-0.5 rounded border border-border text-[10px]">k</kbd> to
            navigate, <kbd className="px-1 py-0.5 rounded border border-border text-[10px]">n</kbd>{" "}
            to create
          </p>
        </div>
      </div>
    );
  }

  return (
    <DetailBody
      key={mode === "create" ? "create" : task!.id}
      task={mode === "edit" ? task! : null}
      domains={domains}
      parentTasks={parentTasks}
      onClose={onClose}
    />
  );
}

/* ------------------------------------------------------------------ */
/*  DetailBody — handles both edit and create modes                    */
/* ------------------------------------------------------------------ */

function DetailBody({
  task,
  domains,
  parentTasks,
  onClose,
}: {
  task: TaskResponse | null;
  domains: DomainResponse[];
  parentTasks: TaskResponse[];
  onClose: () => void;
}) {
  const form = useTaskForm({ task, onDone: onClose });

  // Focus title on mount for create mode
  useEffect(() => {
    if (!form.isEdit) {
      const timer = setTimeout(() => {
        const titleEl = document.getElementById("task-title") as HTMLTextAreaElement | null;
        titleEl?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [form.isEdit]);

  return (
    <>
      <div className="flex flex-col h-full">
        {/* Header with title and close button */}
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <h2 className="text-sm font-semibold">{form.isEdit ? "Edit Task" : "New Task"}</h2>
          <button
            type="button"
            onClick={() => {
              if (form.dirty && !window.confirm("You have unsaved changes. Discard?")) return;
              onClose();
            }}
            className="p-1 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
            title="Close (Esc)"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body — tabbed in edit mode, plain in create mode */}
        {form.isEdit && task ? (
          <Tabs defaultValue="details" className="flex-1 min-h-0 gap-0">
            <TabsList variant="line" className="shrink-0 px-5 border-b">
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="activity">Activity</TabsTrigger>
            </TabsList>
            <TabsContent value="details" className="flex-1 overflow-y-auto p-5">
              <TaskFieldsBody
                values={form.values}
                handlers={form.handlers}
                domains={domains}
                task={task}
                parentTasks={parentTasks}
                onDirty={form.markDirty}
              />
              {task.is_recurring && form.pendingPastCount > 0 && (
                <div className="pt-3 mt-3 border-t">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs w-full"
                    disabled={form.isBatchCompleting}
                    onClick={form.handleBatchComplete}
                  >
                    {form.isBatchCompleting && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
                    Complete {form.pendingPastCount} past instance(s)
                  </Button>
                </div>
              )}
              <div className="text-[11px] text-muted-foreground pt-3 mt-3 border-t">
                {task.created_at && (
                  <span>
                    Created{" "}
                    {new Date(task.created_at).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                )}
                {task.completed_at && (
                  <span>
                    {" · "}Completed{" "}
                    {new Date(task.completed_at).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                )}
              </div>
            </TabsContent>
            <TabsContent value="activity" className="flex-1 overflow-y-auto px-5 py-3">
              <TaskActivityPanel taskId={task.id} />
            </TabsContent>
          </Tabs>
        ) : (
          <div className="flex-1 overflow-y-auto p-5">
            <TaskFieldsBody
              values={form.values}
              handlers={form.handlers}
              domains={domains}
              task={task}
              parentTasks={parentTasks}
              onDirty={form.markDirty}
            />
          </div>
        )}

        {/* Footer — action buttons */}
        <div className="border-t bg-background px-5 py-3 flex items-center gap-2">
          {form.isEdit && task && (
            <>
              <Button
                variant="outline"
                size="sm"
                className="text-xs gap-1"
                onClick={() => form.handleToggleComplete()}
                disabled={form.isToggling}
              >
                {task.status === "completed" || task.completed_at ? (
                  <>
                    <RotateCcw className="h-3.5 w-3.5" />
                    Reopen
                  </>
                ) : (
                  <>
                    <CheckCircle className="h-3.5 w-3.5" />
                    Complete
                  </>
                )}
              </Button>
              <div className="flex-1" />
              <Button
                variant="destructive"
                size="icon"
                className="h-8 w-8"
                onClick={() => form.setShowDeleteConfirm(true)}
                title="Delete task"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
          {!form.isEdit && <div className="flex-1" />}
          <Button
            onClick={form.handleSave}
            disabled={form.isSaving || !form.values.title.trim() || (form.isEdit && !form.dirty)}
            size="sm"
            className="text-xs gap-1"
          >
            {form.isSaving && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
            {form.isEdit ? (
              "Save"
            ) : (
              <>
                <Plus className="h-3.5 w-3.5" />
                Create Task
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Delete confirmation (edit mode only) */}
      {form.isEdit && task && (
        <Dialog open={form.showDeleteConfirm} onOpenChange={form.setShowDeleteConfirm}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Task</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete &ldquo;{task.title}&rdquo;?
                {(task.subtasks?.length ?? 0) > 0 &&
                  ` This will also delete ${task.subtasks!.length} subtask(s).`}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => form.setShowDeleteConfirm(false)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={form.handleDelete} disabled={form.isDeleting}>
                {form.isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
