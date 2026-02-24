import { createLazyFileRoute, Link } from "@tanstack/react-router";
import { useGetBuildInfoApiV1BuildInfoGet } from "@/api/queries/build/build";
import "@/styles/login.css";

export const Route = createLazyFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const buildInfo = useGetBuildInfoApiV1BuildInfoGet();
  const info = buildInfo.data as { demo_login_enabled?: boolean } | undefined;
  const demoEnabled = info?.demo_login_enabled ?? false;

  return (
    <div className="login-page">
      <div className="login-container">
        {/* Hero Section */}
        <div className="mb-6">
          {/* Animated illustration: task -> calendar transfer */}
          <div className="login-hero-illustration">
            {/* Ghost chip that travels from task list to calendar */}
            <div className="login-hero-ghost-chip" />

            {/* Task stack: brainstorm / normal / autopilot */}
            <div className="login-hero-tasks">
              <div className="login-hero-task login-hero-task-1">
                <span className="login-hero-task-rail login-hero-task-rail--brainstorm" />
                <span className="login-hero-checkbox" />
              </div>
              <div className="login-hero-task login-hero-task-2">
                <span className="login-hero-task-rail login-hero-task-rail--normal" />
                <span className="login-hero-checkbox" />
              </div>
              <div className="login-hero-task login-hero-task-3">
                <span className="login-hero-task-rail login-hero-task-rail--autopilot" />
                <span className="login-hero-checkbox login-hero-checkbox--active" />
              </div>
            </div>

            {/* Arrow */}
            <div className="login-hero-arrow">
              <svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </div>

            {/* Calendar */}
            <div className="login-hero-calendar">
              <div className="login-hero-calendar-header" />
              <div className="login-hero-calendar-grid">
                <span className="login-hero-calendar-cell" />
                <span className="login-hero-calendar-cell" />
                <span className="login-hero-calendar-cell login-hero-calendar-cell--prefilled" />
                <span className="login-hero-calendar-cell login-hero-calendar-cell--destination" />
                <span className="login-hero-calendar-cell" />
                <span className="login-hero-calendar-cell" />
                <span className="login-hero-calendar-cell" />
                <span className="login-hero-calendar-cell login-hero-calendar-cell--prefilled" />
                <span className="login-hero-calendar-cell" />
              </div>
              <div className="login-hero-focus-ring" />
            </div>
          </div>

          {/* Wordmark — Quicksand font per brand spec */}
          <div className="flex items-end justify-center gap-0.5">
            <svg
              viewBox="38 40 180 160"
              className="w-[42px] h-[37px] mb-[5.5px] mr-0.5"
              aria-hidden="true"
            >
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
              className="text-[3rem] font-medium leading-none text-foreground"
              style={{ fontFamily: "'Quicksand', sans-serif" }}
            >
              hendoist
            </span>
          </div>
        </div>

        {/* Value Proposition */}
        <div className="mb-8 text-center">
          <p className="text-muted-foreground leading-relaxed mb-1.5">
            Your calendar shows when you're busy.
          </p>
          <p className="text-muted-foreground leading-relaxed mb-2">
            Your task list shows what to do.
          </p>
          <p className="text-foreground font-medium whitespace-nowrap">
            Whendoist shows <em className="not-italic font-semibold text-brand">when</em> to
            actually do it.
          </p>
        </div>

        {/* Google Sign-In Button */}
        <a href="/auth/google" className="login-cta">
          <span className="login-cta-icon-wrap">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
          </span>
          <span>Continue with Google</span>
        </a>

        {/* Demo Login Section */}
        {demoEnabled && (
          <div className="mt-5 w-full">
            <div className="login-demo-divider mb-4">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                or
              </span>
            </div>
            <a href="/auth/demo" className="login-demo-btn">
              <span className="text-base leading-none">🧪</span>
              <span>Try Demo Account</span>
            </a>
          </div>
        )}

        {/* Meta Block */}
        <div className="mt-4 text-center">
          <p className="text-xs text-muted-foreground mb-1.5 leading-snug">
            Reads your calendar to find free time. Never edits events.
          </p>
          <p className="text-[0.72rem] text-muted-foreground leading-snug tracking-wide">
            Calendar-aware scheduling &middot; Todoist import &middot; Open source
          </p>
        </div>

        {/* Footer */}
        <footer className="mt-6 text-center">
          <Link
            to="/terms"
            className="text-[0.68rem] text-muted-foreground hover:text-foreground px-3 py-2"
          >
            Terms
          </Link>
          <span className="text-[0.68rem] text-muted-foreground"> &middot; </span>
          <Link
            to="/privacy"
            className="text-[0.68rem] text-muted-foreground hover:text-foreground px-3 py-2"
          >
            Privacy
          </Link>
        </footer>
      </div>
    </div>
  );
}
