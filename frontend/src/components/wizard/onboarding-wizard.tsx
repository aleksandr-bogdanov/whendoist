import { useQueryClient } from "@tanstack/react-query";
import {
  Brain,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Coffee,
  Download,
  Loader2,
  Plus,
  Trash2,
  Zap,
} from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import type { CalendarResponse } from "@/api/model";
import {
  getGetCalendarsApiV1CalendarsGetQueryKey,
  useGetCalendarsApiV1CalendarsGet,
  useSetCalendarSelectionsApiV1CalendarsSelectionsPost,
} from "@/api/queries/api/api";
import {
  getListDomainsApiV1DomainsGetQueryKey,
  useCreateDomainApiV1DomainsPost,
} from "@/api/queries/domains/domains";
import {
  useImportFromTodoistApiV1ImportTodoistPost,
  usePreviewTodoistImportApiV1ImportTodoistPreviewGet,
} from "@/api/queries/import/import";
import { getListTasksApiV1TasksGetQueryKey } from "@/api/queries/tasks/tasks";
import {
  getGetWizardStatusApiV1WizardStatusGetQueryKey,
  useCompleteWizardApiV1WizardCompletePost,
} from "@/api/queries/wizard/wizard";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

interface OnboardingWizardProps {
  open: boolean;
  onComplete: () => void;
}

const TOTAL_STEPS = 7;

export function OnboardingWizard({ open, onComplete }: OnboardingWizardProps) {
  const [step, setStep] = useState(0);
  const completeMutation = useCompleteWizardApiV1WizardCompletePost();
  const queryClient = useQueryClient();

  const next = useCallback(() => setStep((s) => Math.min(s + 1, TOTAL_STEPS - 1)), []);
  const prev = useCallback(() => setStep((s) => Math.max(s - 1, 0)), []);

  const handleFinish = () => {
    completeMutation.mutate(undefined, {
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: getGetWizardStatusApiV1WizardStatusGetQueryKey(),
        });
        onComplete();
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        className="max-w-lg p-0 gap-0 [&>button]:hidden"
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <div className="flex flex-col min-h-[400px]">
          {/* Content */}
          <div className="flex-1 p-6">
            {step === 0 && <WelcomeStep />}
            {step === 1 && <EnergyStep />}
            {step === 2 && <CalendarConnectStep />}
            {step === 3 && <CalendarSelectStep />}
            {step === 4 && <TodoistStep />}
            {step === 5 && <DomainsStep />}
            {step === 6 && <SummaryStep />}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t p-4">
            <Button variant="ghost" size="sm" onClick={prev} disabled={step === 0}>
              <ChevronLeft className="mr-1 h-4 w-4" /> Back
            </Button>

            {/* Progress dots */}
            <div className="flex gap-1.5">
              {[
                "welcome",
                "energy",
                "cal-connect",
                "cal-select",
                "todoist",
                "domains",
                "summary",
              ].map((id, i) => (
                <div
                  key={id}
                  className={`h-1.5 w-1.5 rounded-full transition-colors ${
                    i === step ? "bg-primary" : i < step ? "bg-primary/40" : "bg-muted"
                  }`}
                />
              ))}
            </div>

            {step < TOTAL_STEPS - 1 ? (
              <Button size="sm" onClick={next}>
                Next <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            ) : (
              <Button size="sm" onClick={handleFinish} disabled={completeMutation.isPending}>
                {completeMutation.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                Open Dashboard
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Step Components
// ============================================================================

function WelcomeStep() {
  return (
    <div className="flex flex-col items-center text-center space-y-4 pt-8">
      <div className="text-4xl">👋</div>
      <h2 className="text-2xl font-bold">Welcome to Whendoist</h2>
      <p className="text-muted-foreground max-w-sm">
        Let's set up your workspace. This takes about 2 minutes and you can change everything later
        in Settings.
      </p>
    </div>
  );
}

function EnergyStep() {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Energy Levels</h2>
      <p className="text-sm text-muted-foreground">
        Whendoist filters your tasks based on your current energy level.
      </p>
      <div className="space-y-3">
        {[
          {
            level: "Zombie",
            icon: <Coffee className="h-5 w-5" />,
            desc: "Low energy — only show autopilot tasks you can do without thinking",
            color: "text-orange-500",
          },
          {
            level: "Normal",
            icon: <Zap className="h-5 w-5" />,
            desc: "Regular energy — show autopilot + normal tasks",
            color: "text-yellow-500",
          },
          {
            level: "Deep Focus",
            icon: <Brain className="h-5 w-5" />,
            desc: "High energy — show all tasks including brainstorm/creative work",
            color: "text-green-500",
          },
        ].map((item) => (
          <Card key={item.level} className="flex items-start gap-3 p-3">
            <div className={item.color}>{item.icon}</div>
            <div>
              <p className="text-sm font-medium">{item.level}</p>
              <p className="text-xs text-muted-foreground">{item.desc}</p>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function CalendarConnectStep() {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Google Calendar</h2>
      <p className="text-sm text-muted-foreground">
        Connect your Google Calendar to see events alongside your tasks.
      </p>
      <Button
        className="w-full"
        onClick={() => {
          window.location.href = "/auth/google?write_scope=true";
        }}
      >
        <Calendar className="mr-2 h-4 w-4" />
        Connect Google Calendar
      </Button>
      <p className="text-xs text-center text-muted-foreground">
        You can skip this and connect later in Settings.
      </p>
    </div>
  );
}

function CalendarSelectStep() {
  const calendarsQuery = useGetCalendarsApiV1CalendarsGet();
  const saveSelections = useSetCalendarSelectionsApiV1CalendarsSelectionsPost();
  const queryClient = useQueryClient();

  const calendars = (calendarsQuery.data ?? []) as CalendarResponse[];

  const toggleCalendar = (calId: string, enabled: boolean) => {
    const enabledIds = calendars
      .map((c) => ({ ...c, enabled: c.id === calId ? enabled : c.enabled }))
      .filter((c) => c.enabled)
      .map((c) => c.id);
    saveSelections.mutate(
      { data: { calendar_ids: enabledIds } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetCalendarsApiV1CalendarsGetQueryKey() });
        },
      },
    );
  };

  if (calendars.length === 0) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-bold">Select Calendars</h2>
        <p className="text-sm text-muted-foreground">
          No calendars found. Connect Google Calendar in the previous step, or skip this step.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Select Calendars</h2>
      <p className="text-sm text-muted-foreground">
        Choose which calendars to display alongside your tasks.
      </p>
      <div className="space-y-2">
        {calendars.map((cal) => (
          <div
            key={cal.id}
            className="flex items-center justify-between rounded-md border px-3 py-2"
          >
            <div className="flex items-center gap-2">
              <div
                className="h-3 w-3 rounded-full"
                style={{ backgroundColor: cal.background_color }}
              />
              <span className="text-sm">{cal.summary}</span>
            </div>
            <Switch
              checked={cal.enabled}
              onCheckedChange={(checked) => toggleCalendar(cal.id, checked)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function TodoistStep() {
  const [showPreview, setShowPreview] = useState(false);
  const previewQuery = usePreviewTodoistImportApiV1ImportTodoistPreviewGet({
    query: { enabled: showPreview },
  });
  const importMutation = useImportFromTodoistApiV1ImportTodoistPost();
  const queryClient = useQueryClient();

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Import from Todoist</h2>
      <p className="text-sm text-muted-foreground">
        Already use Todoist? Import your projects and tasks.
      </p>

      <div className="flex flex-col gap-2">
        <Button
          variant="outline"
          onClick={() => {
            window.location.href = "/auth/todoist";
          }}
        >
          Connect Todoist
        </Button>
        <Button variant="outline" onClick={() => setShowPreview(true)}>
          <Download className="mr-2 h-4 w-4" />
          Preview Import
        </Button>
      </div>

      {showPreview && previewQuery.data && (
        <Card className="p-3 space-y-2">
          <p className="text-sm font-medium">Found:</p>
          <p className="text-xs text-muted-foreground">
            {previewQuery.data.projects_count} projects, {previewQuery.data.tasks_count} tasks
          </p>
          <Button
            size="sm"
            onClick={() => {
              importMutation.mutate(
                { data: null },
                {
                  onSuccess: (data) => {
                    queryClient.invalidateQueries({
                      queryKey: getListTasksApiV1TasksGetQueryKey(),
                    });
                    queryClient.invalidateQueries({
                      queryKey: getListDomainsApiV1DomainsGetQueryKey(),
                    });
                    toast.success(`Imported ${data.tasks_imported} tasks`);
                    setShowPreview(false);
                  },
                },
              );
            }}
            disabled={importMutation.isPending}
          >
            {importMutation.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
            Import
          </Button>
        </Card>
      )}

      <p className="text-xs text-center text-muted-foreground">
        You can skip this and import later in Settings.
      </p>
    </div>
  );
}

function DomainsStep() {
  const [domains, setDomains] = useState<Array<{ name: string; icon: string; color: string }>>([]);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("📁");
  const [color, setColor] = useState("#6D5EF6");
  const createDomain = useCreateDomainApiV1DomainsPost();
  const queryClient = useQueryClient();

  const addDomain = () => {
    if (!name.trim()) return;
    const entry = { name: name.trim(), icon, color };
    setDomains((prev) => [...prev, entry]);

    createDomain.mutate(
      { data: { name: entry.name, icon: entry.icon, color: entry.color } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListDomainsApiV1DomainsGetQueryKey() });
        },
      },
    );

    setName("");
    setIcon("📁");
  };

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Create Domains</h2>
      <p className="text-sm text-muted-foreground">
        Domains group your tasks by area of life (e.g., Work, Personal, Health).
      </p>

      {domains.length > 0 && (
        <div className="space-y-1">
          {domains.map((d, i) => (
            <div
              key={`${d.name}-${i}`}
              className="flex items-center gap-2 rounded-md border px-3 py-1.5"
            >
              <span>{d.icon}</span>
              <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: d.color }} />
              <span className="text-sm flex-1">{d.name}</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-1"
                onClick={() => setDomains((prev) => prev.filter((_, j) => j !== i))}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <Input
          value={icon}
          onChange={(e) => setIcon(e.target.value)}
          className="w-12 text-center"
          placeholder="📁"
        />
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="flex-1"
          placeholder="Domain name (e.g., Work)"
          onKeyDown={(e) => {
            if (e.key === "Enter") addDomain();
          }}
        />
        <input
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          className="h-9 w-9 cursor-pointer rounded border-0"
        />
        <Button size="icon" onClick={addDomain}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      <p className="text-xs text-center text-muted-foreground">
        You can add more domains later in Settings.
      </p>
    </div>
  );
}

function SummaryStep() {
  return (
    <div className="flex flex-col items-center text-center space-y-4 pt-8">
      <CheckCircle2 className="h-12 w-12 text-green-500" />
      <h2 className="text-2xl font-bold">You're all set!</h2>
      <p className="text-muted-foreground max-w-sm">
        Your workspace is ready. Click "Open Dashboard" to start managing your tasks.
      </p>
      <p className="text-xs text-muted-foreground">Everything can be changed later in Settings.</p>
    </div>
  );
}
