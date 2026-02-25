import { Repeat } from "lucide-react";
import type { RecurringStatItem } from "@/api/model";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface RecurringListProps {
  data: RecurringStatItem[];
  className?: string;
}

export function RecurringList({ data, className }: RecurringListProps) {
  if (data.length === 0) {
    return (
      <Card className={cn(className)}>
        <CardHeader>
          <CardTitle>Recurring Tasks</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-4">No recurring tasks yet</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn(className)}>
      <CardHeader>
        <CardTitle>Recurring Tasks</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {data.map((task) => (
          <div key={task.task_id} className="flex items-center gap-3">
            <Repeat className="h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="flex-1 min-w-0">
              <p className="text-sm truncate">{task.title}</p>
              <p className="text-xs text-muted-foreground">
                {task.completed}/{task.total} completed
              </p>
              <div className="h-2 w-full rounded-full bg-muted mt-1">
                <div className="h-full rounded-full bg-brand" style={{ width: `${task.rate}%` }} />
              </div>
            </div>
            <div className="shrink-0">
              <span
                className={`text-sm font-medium tabular-nums ${task.rate >= 80 ? "text-brand" : task.rate >= 50 ? "text-amber-500" : "text-destructive"}`}
              >
                {task.rate}%
              </span>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
