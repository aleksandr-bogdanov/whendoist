import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2, Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { AppRoutersTasksTaskResponse } from "@/api/model";
import {
  getListTasksApiV1TasksGetQueryKey,
  useCreateTaskApiV1TasksPost,
  useListTasksApiV1TasksGet,
} from "@/api/queries/tasks/tasks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useCrypto } from "@/hooks/use-crypto";

export const Route = createFileRoute("/_authenticated/thoughts")({
  component: ThoughtsPage,
});

function ThoughtsPage() {
  const tasksQuery = useListTasksApiV1TasksGet();
  const createTask = useCreateTaskApiV1TasksPost();
  const queryClient = useQueryClient();
  const { decryptTasks, encryptTaskFields } = useCrypto();

  const [input, setInput] = useState("");
  const [decryptedTasks, setDecryptedTasks] = useState<AppRoutersTasksTaskResponse[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Filter for tasks without a domain (thoughts/inbox)
  const allTasks = tasksQuery.data ?? [];
  const thoughts = allTasks.filter((t) => t.domain_id === null && t.parent_id === null);

  // Decrypt thoughts — intentionally depend on length only to avoid infinite re-decrypt loops
  // biome-ignore lint/correctness/useExhaustiveDependencies: thoughts identity changes every render
  useEffect(() => {
    let cancelled = false;
    decryptTasks(thoughts).then((result) => {
      if (!cancelled) setDecryptedTasks(result);
    });
    return () => {
      cancelled = true;
    };
  }, [thoughts.length, decryptTasks]);

  // Auto-scroll to bottom when new thought added
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on count change only
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [decryptedTasks.length]);

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed) return;

    const encrypted = await encryptTaskFields({ title: trimmed });
    setInput("");

    createTask.mutate(
      { data: { title: encrypted.title ?? trimmed } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListTasksApiV1TasksGetQueryKey() });
        },
        onError: () => {
          toast.error("Failed to save thought");
          setInput(trimmed);
        },
      },
    );
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b px-4 py-3">
        <h1 className="text-lg font-semibold">Thoughts</h1>
        <p className="text-xs text-muted-foreground">Quick capture — tasks without a domain</p>
      </div>

      {/* Messages area */}
      <ScrollArea className="flex-1 p-4" ref={scrollRef}>
        <div className="mx-auto max-w-xl space-y-3">
          {tasksQuery.isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : decryptedTasks.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <p className="text-lg mb-1">No thoughts yet</p>
              <p className="text-sm">Type below to capture your first thought</p>
            </div>
          ) : (
            decryptedTasks.map((thought) => <ThoughtBubble key={thought.id} thought={thought} />)
          )}
        </div>
      </ScrollArea>

      {/* Input area */}
      <div className="border-t px-4 py-3">
        <div className="mx-auto flex max-w-xl gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="What's on your mind?"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            disabled={createTask.isPending}
          />
          <Button size="icon" onClick={handleSend} disabled={!input.trim() || createTask.isPending}>
            {createTask.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ThoughtBubble({ thought }: { thought: AppRoutersTasksTaskResponse }) {
  const timestamp = thought.created_at
    ? new Date(thought.created_at).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "";

  return (
    <div className="flex justify-end">
      <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-primary px-4 py-2 text-primary-foreground">
        <p className="text-sm">{thought.title}</p>
        {timestamp && <p className="mt-1 text-[10px] opacity-60">{timestamp}</p>}
      </div>
    </div>
  );
}
