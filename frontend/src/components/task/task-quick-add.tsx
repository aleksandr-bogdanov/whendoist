import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import type { DomainResponse, TaskCreate } from "@/api/model";
import { useCreateTaskApiV1TasksPost } from "@/api/queries/tasks/tasks";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCrypto } from "@/hooks/use-crypto";

interface TaskQuickAddProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  domains: DomainResponse[];
}

export function TaskQuickAdd({ open, onOpenChange, domains }: TaskQuickAddProps) {
  const queryClient = useQueryClient();
  const { encryptTaskFields } = useCrypto();
  const inputRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState("");
  const [domainId, setDomainId] = useState<string>("none");

  const createMutation = useCreateTaskApiV1TasksPost();

  const handleSave = async () => {
    if (!title.trim()) return;

    const encrypted = await encryptTaskFields({ title: title.trim() });

    const data: TaskCreate = {
      title: encrypted.title!,
      domain_id: domainId !== "none" ? Number(domainId) : null,
      impact: 4,
      clarity: "normal",
    };

    createMutation.mutate(
      { data },
      {
        onSuccess: () => {
          toast.success("Task created");
          queryClient.invalidateQueries({ queryKey: ["/api/v1/tasks"] });
          setTitle("");
          setDomainId("none");
          onOpenChange(false);
        },
        onError: () => toast.error("Failed to create task"),
      },
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey && title.trim()) {
      e.preventDefault();
      handleSave();
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          setTitle("");
          setDomainId("none");
        }
        onOpenChange(v);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Quick Add Task</DialogTitle>
          <DialogDescription>Type a title and press Enter to create.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="qa-title" className="text-xs">
              Title
            </Label>
            <Input
              ref={inputRef}
              id="qa-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="What needs to be done?"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Domain</Label>
            <Select value={domainId} onValueChange={setDomainId}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="No domain" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No domain (Inbox)</SelectItem>
                {domains
                  .filter((d) => !d.is_archived)
                  .map((d) => (
                    <SelectItem key={d.id} value={String(d.id)}>
                      {d.icon ? `${d.icon} ` : ""}
                      {d.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={handleSave} disabled={createMutation.isPending || !title.trim()}>
            {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
