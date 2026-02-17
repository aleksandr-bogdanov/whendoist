import { createFileRoute, Link } from "@tanstack/react-router";
import { ScrollArea } from "@/components/ui/scroll-area";

export const Route = createFileRoute("/privacy")({
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <ScrollArea className="h-[var(--app-height,100vh)]">
      <div className="mx-auto max-w-2xl px-4 py-8 pb-24">
        <nav className="mb-6">
          <Link to="/" className="text-sm text-muted-foreground hover:underline">
            &larr; Back to Whendoist
          </Link>
        </nav>

        <h1 className="text-2xl font-bold tracking-tight mb-1">PRIVACY POLICY</h1>
        <p className="text-sm text-muted-foreground mb-8">Last updated: February 2026</p>

        <article className="prose prose-sm dark:prose-invert max-w-none space-y-6">
          <section>
            <h2 className="text-lg font-semibold">1. Information We Collect</h2>
            <p>
              <strong>Google Account Information:</strong> When you sign in with Google, we receive
              your email address, name, and profile picture. This is used to create and identify
              your account.
            </p>
            <p>
              <strong>Tasks and Content:</strong> Tasks, domains, descriptions, and preferences you
              create within the Service are stored to provide functionality.
            </p>
            <p>
              <strong>Google Calendar Data:</strong> With your permission, we access your Google
              Calendar events to display them alongside your tasks. If you enable calendar sync, we
              also create a secondary "Whendoist" calendar to sync your tasks to Google Calendar. We
              never modify or delete your personal calendar events.
            </p>
            <p>
              <strong>Todoist Data:</strong> If you choose to import from Todoist, we access your
              Todoist tasks for a one-time import. We do not retain Todoist API credentials after
              the import is complete.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">2. How We Use Your Data</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>To provide, maintain, and improve the Service</li>
              <li>To display your calendar events alongside your tasks</li>
              <li>To sync your tasks to Google Calendar (if you enable this)</li>
              <li>To sync your task data across your own devices</li>
            </ul>
            <p>
              We do not use your data for advertising, profiling, or analytics beyond basic service
              operation.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">3. Google API Services User Data</h2>
            <p>
              Whendoist's use and transfer of information received from Google APIs adheres to the{" "}
              <a
                href="https://developers.google.com/terms/api-services-user-data-policy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                Google API Services User Data Policy
              </a>
              , including the Limited Use requirements.
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                We only request the scopes necessary to provide the Service (calendar read, or
                calendar read-write if you enable sync)
              </li>
              <li>We do not sell, lease, or share Google user data with third parties</li>
              <li>We do not use Google user data for advertising or to build user profiles</li>
              <li>
                Google OAuth tokens are encrypted at rest and only used to access the Google APIs on
                your behalf
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold">4. Data Storage and Security</h2>
            <p>
              Your data is stored in a PostgreSQL database hosted on{" "}
              <a
                href="https://railway.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                Railway
              </a>
              . Google OAuth tokens are encrypted at rest using Fernet symmetric encryption.
            </p>
            <p>
              <strong>Optional End-to-End Encryption:</strong> If you enable encryption, your task
              titles and descriptions are encrypted client-side before storage. We cannot read
              encrypted content, and we cannot recover your data if you lose your passphrase and
              passkey.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">5. Data Sharing</h2>
            <p>
              We do not sell, trade, or share your personal data with third parties. Your data is
              only accessed by the following services as necessary to operate the Service:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                <strong>Google APIs</strong> — authentication and calendar integration
              </li>
              <li>
                <strong>Railway</strong> — application and database hosting
              </li>
              <li>
                <strong>Sentry</strong> — error monitoring (no user content is sent, only error
                metadata)
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold">6. Data Retention and Deletion</h2>
            <p>
              Your data is retained for as long as your account exists. You can delete your account
              and all associated data at any time from the Settings page. Account deletion is
              immediate and irreversible — all tasks, preferences, and stored tokens are permanently
              removed.
            </p>
            <p>
              You can also revoke Whendoist's access to your Google account at any time via your{" "}
              <a
                href="https://myaccount.google.com/permissions"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                Google Account permissions
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">7. Cookies and Sessions</h2>
            <p>
              We use a session cookie to keep you signed in. We use a short-lived cookie during the
              Google OAuth flow (state parameter) to prevent cross-site request forgery. We do not
              use tracking cookies, third-party cookies, or analytics cookies.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">8. Children's Privacy</h2>
            <p>
              The Service is not intended for children under 13. We do not knowingly collect
              personal information from children under 13.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">9. Open Source</h2>
            <p>
              Whendoist is open source. You can audit exactly how your data is handled by reviewing
              the source code at{" "}
              <a
                href="https://github.com/aleksandr-bogdanov/whendoist"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                github.com/aleksandr-bogdanov/whendoist
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">10. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. Changes will be reflected on this
              page with an updated date. Continued use of the Service after changes constitutes
              acceptance of the revised policy.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">11. Contact</h2>
            <p>
              For questions about this Privacy Policy, please contact{" "}
              <a href="mailto:alex@bogdanov.wtf" className="text-primary hover:underline">
                alex@bogdanov.wtf
              </a>
              .
            </p>
          </section>
        </article>

        <footer className="mt-8 flex gap-4 text-sm">
          <Link to="/terms" className="text-muted-foreground hover:underline">
            Terms of Service
          </Link>
          <Link to="/" className="text-muted-foreground hover:underline">
            Back to Whendoist
          </Link>
        </footer>
      </div>
    </ScrollArea>
  );
}
