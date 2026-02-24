import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Lock } from "lucide-react";
import { useCallback, useState } from "react";
import {
  getListDomainsApiV1DomainsGetQueryKey,
  useCreateDomainApiV1DomainsPost,
} from "@/api/queries/domains/domains";
import {
  getGetWizardStatusApiV1WizardStatusGetQueryKey,
  useCompleteWizardApiV1WizardCompletePost,
} from "@/api/queries/wizard/wizard";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// ============================================================================
// Constants
// ============================================================================

const TOTAL_STEPS = 7;

const STEP_IDS = [
  "welcome",
  "energy",
  "cal-connect",
  "cal-select",
  "todoist",
  "domains",
  "completion",
] as const;

const OPTIONAL_STEPS = new Set([2, 4]);

const ENERGY_MODES = [
  { key: "zombie", emoji: "\u{1F9DF}", label: "ZOMBIE", desc: "Simple next actions" },
  { key: "normal", emoji: "\u2615", label: "NORMAL", desc: "Routine work" },
  { key: "focus", emoji: "\u{1F9E0}", label: "BRAINSTORM", desc: "Deep work / research" },
] as const;

const PREVIEW_TASKS = [
  { title: "Review pull requests", duration: "30m", clarity: "autopilot" as const },
  { title: "Reply to Sarah\u2019s email", duration: "15m", clarity: "autopilot" as const },
  { title: "Update project documentation", duration: "1h", clarity: "normal" as const },
  { title: "Research competitor features", duration: "2h", clarity: "brainstorm" as const },
] as const;

const CLARITY_VISIBILITY: Record<string, readonly string[]> = {
  zombie: ["autopilot"],
  normal: ["autopilot", "normal"],
  focus: ["autopilot", "normal", "brainstorm"],
};

const CLARITY_COLORS: Record<string, string> = {
  autopilot: "var(--autopilot-color)",
  normal: "var(--normal-color)",
  brainstorm: "var(--brainstorm-color)",
};

const DOMAIN_SUGGESTIONS = [
  { emoji: "\u{1F4BC}", name: "Work" },
  { emoji: "\u{1F3E0}", name: "Personal" },
  { emoji: "\u{1F3C3}", name: "Health" },
  { emoji: "\u{1F4DA}", name: "Learning" },
  { emoji: "\u{1F4B0}", name: "Finance" },
  { emoji: "\u{1F3A8}", name: "Creative" },
] as const;

const DOMAIN_EMOJIS = [
  "\u{1F4C1}",
  "\u{1F4BC}",
  "\u{1F3E0}",
  "\u{1F464}",
  "\u{1F465}",
  "\u{1F4AA}",
  "\u{1F9D8}",
  "\u{1F4DA}",
  "\u{1F393}",
  "\u{1F4BB}",
  "\u{1F3A8}",
  "\u{1F3B5}",
  "\u{1F3AE}",
  "\u{1F4F7}",
  "\u2708\uFE0F",
  "\u{1F697}",
  "\u{1F3C3}",
  "\u26BD",
  "\u{1F3AF}",
  "\u{1F4B0}",
  "\u{1F4C8}",
  "\u2764\uFE0F",
  "\u{1F31F}",
  "\u{1F525}",
  "\u2728",
  "\u{1F389}",
  "\u{1F381}",
  "\u{1F3C6}",
  "\u{1F34E}",
  "\u{1F957}",
  "\u2615",
  "\u{1F373}",
  "\u{1F6D2}",
  "\u{1F3E5}",
  "\u{1F48A}",
  "\u{1F415}",
  "\u{1F331}",
  "\u{1F30D}",
  "\u2600\uFE0F",
  "\u{1F319}",
  "\u26A1",
  "\u{1F527}",
];

// ============================================================================
// Inline SVGs
// ============================================================================

function WhendoistLogo() {
  return (
    <div className="flex items-end justify-center gap-0.5 animate-[logoFloat_3s_ease-in-out_infinite]">
      <svg viewBox="38 40 180 160" className="w-[42px] h-[37px] mb-[5px] mr-0.5" aria-hidden="true">
        <rect
          x="48"
          y="40"
          width="28"
          height="160"
          rx="14"
          fill="#167BFF"
          transform="rotate(-8 62 120)"
        />
        <rect x="114" y="72" width="28" height="127.3" rx="14" fill="#6D5EF6" />
        <rect
          x="180"
          y="40"
          width="28"
          height="160"
          rx="14"
          fill="#A020C0"
          transform="rotate(8 194 120)"
        />
      </svg>
      <span
        className="text-[3rem] font-medium leading-none"
        style={{ fontFamily: "'Quicksand', sans-serif" }}
      >
        hendoist
      </span>
    </div>
  );
}

function RocketIllustration() {
  return (
    <svg
      viewBox="0 0 120 120"
      className="w-[100px] h-[100px] sm:w-[120px] sm:h-[120px]"
      aria-hidden="true"
    >
      <circle cx="60" cy="60" r="44" fill="#F3ECFA" />
      <path
        d="M60 24 C50 34 46 48 46 64 L60 72 L74 64 C74 48 70 34 60 24 Z"
        fill="white"
        stroke="#A020C0"
        strokeWidth="2.5"
      />
      <circle cx="60" cy="46" r="7" fill="#167BFF" />
      <path d="M46 64 L38 74 L46 70 Z" fill="#6D5EF6" />
      <path d="M74 64 L82 74 L74 70 Z" fill="#6D5EF6" />
      <path d="M54 72 L60 92 L66 72" fill="#F97316" />
      <path d="M57 72 L60 84 L63 72" fill="#FBBF24" />
    </svg>
  );
}

function GoogleCalendarIcon() {
  return (
    <svg className="w-7 h-7 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="2" y="4" width="20" height="18" rx="2" fill="#4285F4" />
      <rect x="2" y="4" width="20" height="5" fill="#1A73E8" />
      <rect x="6" y="2" width="2" height="4" rx="1" fill="#EA4335" />
      <rect x="16" y="2" width="2" height="4" rx="1" fill="#EA4335" />
      <rect x="6" y="12" width="3" height="3" rx="0.5" fill="white" />
      <rect x="10.5" y="12" width="3" height="3" rx="0.5" fill="white" />
      <rect x="15" y="12" width="3" height="3" rx="0.5" fill="white" />
      <rect x="6" y="16" width="3" height="3" rx="0.5" fill="white" />
      <rect x="10.5" y="16" width="3" height="3" rx="0.5" fill="white" />
    </svg>
  );
}

function TodoistLogo() {
  return (
    <svg className="w-8 h-8" viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="16" fill="#E44332" />
      <path
        d="M9 11h14l-7 4.5L9 11zm0 5h14l-7 4.5L9 16zm0 5h14l-7 4.5L9 21z"
        fill="white"
        opacity="0.9"
      />
    </svg>
  );
}

// ============================================================================
// Emoji Picker
// ============================================================================

function EmojiPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-10 h-10 rounded-lg border border-border bg-card flex items-center justify-center text-xl hover:bg-accent transition-colors cursor-pointer"
      >
        {value}
      </button>
      {open && (
        <div className="absolute bottom-full left-0 mb-2 p-2.5 bg-card border border-border rounded-xl shadow-lg z-10 w-[252px] grid grid-cols-7 gap-0.5">
          {DOMAIN_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => {
                onChange(emoji);
                setOpen(false);
              }}
              className={cn(
                "w-8 h-8 flex items-center justify-center rounded-md text-lg hover:scale-110 transition-transform cursor-pointer",
                emoji === value && "bg-[rgba(109,94,246,0.1)] ring-1 ring-[var(--color-brand)]",
              )}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Progress Dots
// ============================================================================

function ProgressDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex justify-center gap-2.5 sm:gap-2 py-4">
      {Array.from({ length: total }, (_, i) => {
        const isOptional = OPTIONAL_STEPS.has(i);
        const isCurrent = i === current;
        const isCompleted = i < current;
        return (
          <div
            key={STEP_IDS[i]}
            className={cn(
              "w-2 h-2 sm:w-1.5 sm:h-1.5 rounded-full transition-all duration-250",
              isCurrent && "bg-[var(--color-brand)] shadow-[0_0_0_3px_rgba(109,94,246,0.2)]",
              isCompleted && "bg-[var(--color-brand)]",
              !isCurrent && !isCompleted && !isOptional && "bg-muted-foreground/25",
              !isCurrent &&
                !isCompleted &&
                isOptional &&
                "border-2 border-muted-foreground/25 bg-transparent",
            )}
          />
        );
      })}
    </div>
  );
}

// ============================================================================
// Shared nav bar
// ============================================================================

function WizardNav({
  step,
  onBack,
  primaryLabel,
  primaryAction,
  secondaryLabel,
  secondaryAction,
}: {
  step: number;
  onBack?: () => void;
  primaryLabel?: string;
  primaryAction?: () => void;
  secondaryLabel?: string;
  secondaryAction?: () => void;
}) {
  return (
    <>
      <ProgressDots current={step} total={TOTAL_STEPS} />
      <div className="flex justify-between items-center pt-2">
        {onBack ? (
          <Button variant="outline" className="h-11 sm:h-10 px-5 rounded-xl" onClick={onBack}>
            Back
          </Button>
        ) : (
          <div />
        )}
        {secondaryLabel && secondaryAction && !primaryLabel && (
          <Button
            variant="outline"
            className="h-11 sm:h-10 px-5 rounded-xl"
            onClick={secondaryAction}
          >
            {secondaryLabel}
          </Button>
        )}
        {primaryLabel && primaryAction && (
          <Button variant="cta" className="h-11 sm:h-10 px-5 rounded-xl" onClick={primaryAction}>
            {primaryLabel}
          </Button>
        )}
      </div>
    </>
  );
}

// ============================================================================
// Main Wizard
// ============================================================================

interface OnboardingWizardProps {
  open: boolean;
  onComplete: () => void;
  userName?: string;
}

export function OnboardingWizard({ open, onComplete, userName }: OnboardingWizardProps) {
  const [step, setStep] = useState(0);
  const [transitioning, setTransitioning] = useState(false);
  const completeMutation = useCompleteWizardApiV1WizardCompletePost();
  const queryClient = useQueryClient();

  const firstName = userName?.split(" ")[0] ?? "";

  const goTo = useCallback((target: number) => {
    setTransitioning(true);
    setTimeout(() => {
      setStep(target);
      setTransitioning(false);
    }, 200);
  }, []);

  const goForward = useCallback(
    (from: number) => {
      let next = from + 1;
      if (next === 3) next = 4; // skip cal-select
      goTo(Math.min(next, TOTAL_STEPS - 1));
    },
    [goTo],
  );

  const goBack = useCallback(
    (from: number) => {
      let prev = from - 1;
      if (prev === 3) prev = 2; // skip cal-select
      goTo(Math.max(prev, 0));
    },
    [goTo],
  );

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
        className="sm:max-w-[640px] p-0 gap-0 rounded-[20px] border-border/50 shadow-[var(--shadow-raised)]"
        onPointerDownOutside={(e) => e.preventDefault()}
        showCloseButton={false}
      >
        <div
          className={cn(
            "flex flex-col px-8 sm:px-12 pt-12 pb-10 transition-opacity duration-200",
            transitioning && "opacity-0",
          )}
        >
          {step === 0 && (
            <WelcomeStep firstName={firstName} step={step} onGetStarted={() => goForward(step)} />
          )}
          {step === 1 && (
            <EnergyStep
              step={step}
              onBack={() => goBack(step)}
              onContinue={() => goForward(step)}
            />
          )}
          {step === 2 && (
            <CalendarConnectStep
              step={step}
              onBack={() => goBack(step)}
              onSkip={() => goForward(step)}
            />
          )}
          {step === 4 && (
            <TodoistStep step={step} onBack={() => goBack(step)} onSkip={() => goForward(step)} />
          )}
          {step === 5 && (
            <DomainsStep
              step={step}
              onBack={() => goBack(step)}
              onSkip={() => goForward(step)}
              onContinue={() => goForward(step)}
            />
          )}
          {step === 6 && (
            <CompletionStep onFinish={handleFinish} isPending={completeMutation.isPending} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Step 0: Welcome
// ============================================================================

function WelcomeStep({
  firstName,
  step,
  onGetStarted,
}: {
  firstName: string;
  step: number;
  onGetStarted: () => void;
}) {
  return (
    <div className="flex flex-col items-center text-center">
      <div className="mb-3">
        <WhendoistLogo />
      </div>

      {firstName && (
        <p className="text-[1.05rem] font-medium text-muted-foreground mb-8 tracking-wide">
          Welcome, {firstName}
        </p>
      )}

      <div className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl px-7 py-5 max-w-[380px] shadow-[var(--shadow-card)]">
        <p className="text-[0.88rem] text-muted-foreground leading-relaxed mb-1">
          Calendar shows when you're busy.
        </p>
        <p className="text-[0.88rem] text-muted-foreground leading-relaxed mb-1">
          Tasks show what to do.
        </p>
        <p className="text-[0.88rem] text-foreground font-semibold leading-relaxed">
          Whendoist shows{" "}
          <span className="text-[var(--color-brand)] underline underline-offset-2 decoration-[var(--color-brand)]">
            when
          </span>{" "}
          to do it.
        </p>
      </div>

      <div className="pt-6">
        <ProgressDots current={step} total={TOTAL_STEPS} />
      </div>
      <div className="flex justify-center pt-4">
        <Button
          variant="cta"
          className="h-12 sm:h-11 px-8 rounded-xl text-base"
          onClick={onGetStarted}
        >
          Get Started
        </Button>
      </div>
    </div>
  );
}

// ============================================================================
// Step 1: Energy Modes
// ============================================================================

function EnergyStep({
  step,
  onBack,
  onContinue,
}: {
  step: number;
  onBack: () => void;
  onContinue: () => void;
}) {
  const [selectedMode, setSelectedMode] = useState("normal");
  const visibleClarities = CLARITY_VISIBILITY[selectedMode] ?? [];

  return (
    <div className="flex flex-col">
      <h1 className="text-2xl font-bold text-center tracking-tight mb-2">Work with your energy</h1>
      <p className="text-sm font-medium text-muted-foreground text-center mb-6">
        Filter tasks by how much focus they need
      </p>

      <div className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-[14px] p-5 shadow-[var(--shadow-card)]">
        {/* Mode cards */}
        <div className="flex gap-3">
          {ENERGY_MODES.map((mode) => (
            <button
              key={mode.key}
              type="button"
              onClick={() => setSelectedMode(mode.key)}
              className={cn(
                "flex-1 flex flex-col items-center text-center py-5 px-2 rounded-[14px] border-2 transition-all duration-200 cursor-pointer min-w-0",
                "bg-card/80 backdrop-blur-xl",
                selectedMode === mode.key
                  ? "border-[var(--color-brand)] bg-[rgba(109,94,246,0.06)] shadow-[0_2px_6px_rgba(109,94,246,0.18),0_4px_12px_rgba(109,94,246,0.14)]"
                  : "border-border/50 hover:border-border hover:-translate-y-0.5",
              )}
            >
              <span className="text-[1.75rem] mb-2">{mode.emoji}</span>
              <span className="text-[0.6rem] font-bold uppercase tracking-[0.12em] mb-1.5">
                {mode.label}
              </span>
              <span className="text-[0.7rem] text-muted-foreground leading-tight line-clamp-2">
                {mode.desc}
              </span>
            </button>
          ))}
        </div>

        {/* Preview */}
        <div className="h-px bg-border/50 my-5" />
        <p className="text-[0.7rem] font-bold uppercase tracking-[0.06em] text-muted-foreground mb-3">
          Preview
        </p>
        <div>
          {PREVIEW_TASKS.map((task) => {
            const visible = visibleClarities.includes(task.clarity);
            return (
              <div
                key={task.title}
                className={cn(
                  "flex items-center py-2.5 px-3 relative transition-all duration-200",
                  "border-b border-border/30 last:border-b-0",
                  visible ? "opacity-100 max-h-14" : "opacity-0 max-h-0 !py-0 overflow-hidden",
                )}
              >
                <div
                  className="absolute left-0 top-1 bottom-1 w-0.5 rounded-full"
                  style={{ background: CLARITY_COLORS[task.clarity] }}
                />
                <span className="flex-1 text-[0.85rem] pl-2">{task.title}</span>
                <span className="text-[0.75rem] text-muted-foreground ml-3">{task.duration}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="pt-4">
        <WizardNav
          step={step}
          onBack={onBack}
          primaryLabel="Got it, continue"
          primaryAction={onContinue}
        />
      </div>
    </div>
  );
}

// ============================================================================
// Step 2: Connect Calendar
// ============================================================================

function CalendarConnectStep({
  step,
  onBack,
  onSkip,
}: {
  step: number;
  onBack: () => void;
  onSkip: () => void;
}) {
  return (
    <div className="flex flex-col">
      <h1 className="text-2xl font-bold text-center tracking-tight mb-1.5">
        Connect your calendar
      </h1>
      <p className="text-sm font-medium text-muted-foreground text-center mb-5">
        Plan tasks around your commitments
      </p>

      <div className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl p-5 shadow-[var(--shadow-card)]">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-11 h-11 rounded-[10px] bg-muted/50 flex items-center justify-center shrink-0">
            <GoogleCalendarIcon />
          </div>
          <div className="flex-1">
            <div className="text-[0.95rem] font-semibold">Google Calendar</div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30" />
              Not connected
            </div>
          </div>
        </div>

        <Button
          variant="cta"
          className="w-full h-12 sm:h-11 rounded-xl"
          onClick={() => {
            window.location.href = "/auth/google?write_scope=true";
          }}
        >
          Connect Google Calendar
        </Button>
      </div>

      <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground mt-4">
        <Lock className="w-3 h-3 opacity-60" />
        Reads your calendar to find free time. Never edits events.
      </p>

      <WizardNav step={step} onBack={onBack} secondaryLabel="Skip" secondaryAction={onSkip} />
    </div>
  );
}

// ============================================================================
// Step 4: Todoist Import
// ============================================================================

function TodoistStep({
  step,
  onBack,
  onSkip,
}: {
  step: number;
  onBack: () => void;
  onSkip: () => void;
}) {
  return (
    <div className="flex flex-col">
      <h1 className="text-2xl font-bold text-center tracking-tight mb-1.5">Already have tasks?</h1>
      <p className="text-sm font-medium text-muted-foreground text-center mb-5">
        Import from Todoist to start faster
      </p>

      <div className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl px-6 py-7 text-center shadow-[var(--shadow-card)]">
        <div className="flex justify-center mb-3">
          <TodoistLogo />
        </div>
        <div className="text-base font-semibold mb-1">Import from Todoist</div>
        <div className="text-sm text-muted-foreground mb-5">
          Bring your projects, tasks, and labels
        </div>
        <Button
          variant="cta"
          className="h-12 sm:h-11 px-8 rounded-xl"
          onClick={() => {
            window.location.href = "/auth/todoist";
          }}
        >
          Connect Todoist
        </Button>
      </div>

      <WizardNav step={step} onBack={onBack} secondaryLabel="Skip" secondaryAction={onSkip} />
    </div>
  );
}

// ============================================================================
// Step 5: Domains
// ============================================================================

function DomainsStep({
  step,
  onBack,
  onSkip,
  onContinue,
}: {
  step: number;
  onBack: () => void;
  onSkip: () => void;
  onContinue: () => void;
}) {
  const [selectedSuggestions, setSelectedSuggestions] = useState<Set<string>>(new Set());
  const [customDomains, setCustomDomains] = useState<Array<{ name: string; icon: string }>>([]);
  const [isAddingCustom, setIsAddingCustom] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customIcon, setCustomIcon] = useState("\u{1F4C1}");
  const createDomain = useCreateDomainApiV1DomainsPost();
  const queryClient = useQueryClient();

  const allNames = new Set([...selectedSuggestions, ...customDomains.map((d) => d.name)]);

  const toggleSuggestion = (name: string, icon: string) => {
    if (selectedSuggestions.has(name)) {
      setSelectedSuggestions((prev) => {
        const next = new Set(prev);
        next.delete(name);
        return next;
      });
    } else {
      setSelectedSuggestions((prev) => new Set(prev).add(name));
      createDomain.mutate(
        { data: { name, icon } },
        {
          onSuccess: () =>
            queryClient.invalidateQueries({
              queryKey: getListDomainsApiV1DomainsGetQueryKey(),
            }),
        },
      );
    }
  };

  const addCustomDomain = () => {
    const trimmed = customName.trim();
    if (!trimmed || allNames.has(trimmed)) return;
    setCustomDomains((prev) => [...prev, { name: trimmed, icon: customIcon }]);
    createDomain.mutate(
      { data: { name: trimmed, icon: customIcon } },
      {
        onSuccess: () =>
          queryClient.invalidateQueries({
            queryKey: getListDomainsApiV1DomainsGetQueryKey(),
          }),
      },
    );
    setCustomName("");
    setCustomIcon("\u{1F4C1}");
    setIsAddingCustom(false);
  };

  const hasDomains = allNames.size > 0;

  return (
    <div className="flex flex-col">
      <h1 className="text-2xl font-bold text-center tracking-tight mb-1.5">Organize your life</h1>
      <p className="text-sm font-medium text-muted-foreground text-center mb-5">
        Domains are big areas of your life
      </p>

      <div className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-[14px] p-4 shadow-[var(--shadow-card)]">
        <div className="grid grid-cols-3 gap-2.5">
          {DOMAIN_SUGGESTIONS.map((d) => (
            <button
              key={d.name}
              type="button"
              onClick={() => toggleSuggestion(d.name, d.emoji)}
              className={cn(
                "flex flex-col items-center gap-1.5 py-4 px-2.5 rounded-[14px] border-2 transition-all duration-200 cursor-pointer",
                "bg-card/80 backdrop-blur-lg",
                selectedSuggestions.has(d.name)
                  ? "border-[var(--color-brand)] bg-[rgba(109,94,246,0.06)] shadow-[0_0_8px_rgba(109,94,246,0.15)]"
                  : "border-border/50 hover:border-border hover:-translate-y-0.5",
              )}
            >
              <span className="text-xl sm:text-2xl">{d.emoji}</span>
              <span className="text-xs font-semibold truncate max-w-full">{d.name}</span>
            </button>
          ))}

          {/* Custom domains */}
          {customDomains.map((d) => (
            <div
              key={d.name}
              className="flex flex-col items-center gap-1.5 py-4 px-2.5 rounded-[14px] border-2 border-[var(--color-brand)] bg-[rgba(109,94,246,0.06)] shadow-[0_0_8px_rgba(109,94,246,0.15)]"
            >
              <span className="text-xl sm:text-2xl">{d.icon}</span>
              <span className="text-xs font-semibold truncate max-w-full">{d.name}</span>
            </div>
          ))}

          {/* Add your own */}
          <button
            type="button"
            onClick={() => setIsAddingCustom(true)}
            className="flex flex-col items-center gap-1.5 py-4 px-2.5 rounded-[14px] border-2 border-dashed border-muted-foreground/25 cursor-pointer transition-all duration-200 hover:border-[var(--color-brand)] hover:border-solid hover:bg-[rgba(109,94,246,0.04)] group"
          >
            <span className="text-2xl font-light text-muted-foreground group-hover:text-[var(--color-brand)]">
              +
            </span>
            <span className="text-xs font-semibold text-muted-foreground group-hover:text-[var(--color-brand)]">
              Add your own
            </span>
          </button>
        </div>

        {isAddingCustom && (
          <div className="mt-4 p-4 bg-card border border-border rounded-xl space-y-3">
            <div className="flex items-center gap-2">
              <EmojiPicker value={customIcon} onChange={setCustomIcon} />
              <Input
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                className="flex-1"
                placeholder="Domain name..."
                maxLength={20}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") addCustomDomain();
                  if (e.key === "Escape") setIsAddingCustom(false);
                }}
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                className="h-9 px-4 rounded-lg"
                onClick={() => setIsAddingCustom(false)}
              >
                Cancel
              </Button>
              <Button variant="cta" className="h-9 px-4 rounded-lg" onClick={addCustomDomain}>
                Add
              </Button>
            </div>
          </div>
        )}
      </div>

      <WizardNav
        step={step}
        onBack={onBack}
        primaryLabel={hasDomains ? "Continue" : undefined}
        primaryAction={hasDomains ? onContinue : undefined}
        secondaryLabel={hasDomains ? undefined : "Skip"}
        secondaryAction={hasDomains ? undefined : onSkip}
      />
    </div>
  );
}

// ============================================================================
// Step 6: Completion
// ============================================================================

function CompletionStep({ onFinish, isPending }: { onFinish: () => void; isPending: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center text-center min-h-[380px]">
      <div className="mb-6">
        <RocketIllustration />
      </div>

      <h1 className="text-2xl font-bold tracking-tight mb-2">You're all set</h1>
      <p className="text-sm font-medium text-muted-foreground mb-8">Your day awaits</p>

      <Button
        variant="cta"
        className="w-[280px] sm:w-[320px] h-14 sm:h-12 text-base rounded-xl animate-[finalPulse_2.5s_ease-in-out_infinite]"
        onClick={onFinish}
        disabled={isPending}
      >
        {isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
        Open Tasks
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          className="ml-1"
          aria-hidden="true"
        >
          <path d="M5 12h14M12 5l7 7-7 7" />
        </svg>
      </Button>
    </div>
  );
}
