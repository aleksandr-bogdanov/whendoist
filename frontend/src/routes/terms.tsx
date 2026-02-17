import { createFileRoute, Link } from "@tanstack/react-router";
import { ScrollArea } from "@/components/ui/scroll-area";

export const Route = createFileRoute("/terms")({
  component: TermsPage,
});

function TermsPage() {
  return (
    <ScrollArea className="h-[var(--app-height,100vh)]">
      <div className="mx-auto max-w-2xl px-4 py-8 pb-24">
        <nav className="mb-6">
          <Link to="/" className="text-sm text-muted-foreground hover:underline">
            &larr; Back to Whendoist
          </Link>
        </nav>

        <h1 className="text-2xl font-bold tracking-tight mb-1">TERMS OF SERVICE</h1>
        <p className="text-sm text-muted-foreground mb-8">Last updated: January 2026</p>

        <article className="prose prose-sm dark:prose-invert max-w-none space-y-6">
          <section>
            <h2 className="text-lg font-semibold">1. Acceptance of Terms</h2>
            <p>
              By accessing or using Whendoist ("the Service"), you agree to be bound by these Terms
              of Service. If you do not agree to these terms, please do not use the Service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">2. Description of Service</h2>
            <p>
              Whendoist is a task management and day planning application that helps you schedule
              tasks alongside your Google Calendar events. The Service is provided free of charge
              and is open source.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">3. Account Registration</h2>
            <p>
              To use Whendoist, you must sign in with a Google account. You are responsible for
              maintaining the security of your Google account credentials. You must be at least 13
              years old to use this Service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">4. User Data</h2>
            <p>
              You retain ownership of all content you create within the Service, including tasks,
              domains, and any other data you input.
            </p>
            <p>
              <strong>Google Calendar Access:</strong> We request read-only access to your Google
              Calendar to display your events. We never modify, delete, or share your calendar data.
            </p>
            <p>
              <strong>Optional Encryption:</strong> If you enable end-to-end encryption, your task
              content is encrypted client-side before being stored. We cannot read encrypted
              content, and we cannot recover your data if you lose your passphrase and passkey.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">5. Acceptable Use</h2>
            <p>You agree not to:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Use the Service for any illegal purpose</li>
              <li>Attempt to gain unauthorized access to the Service or its systems</li>
              <li>Interfere with or disrupt the Service</li>
              <li>Use automated systems to access the Service without permission</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold">6. Service Availability</h2>
            <p>
              We strive to maintain high availability but do not guarantee uninterrupted access to
              the Service. We may modify, suspend, or discontinue the Service at any time without
              notice.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">7. Disclaimer of Warranties</h2>
            <p className="uppercase text-xs">
              The Service is provided "as is" without warranties of any kind, either express or
              implied. We do not warrant that the Service will be error-free or uninterrupted.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">8. Limitation of Liability</h2>
            <p className="uppercase text-xs">
              To the maximum extent permitted by law, we shall not be liable for any indirect,
              incidental, special, consequential, or punitive damages arising out of your use of the
              Service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">9. Changes to Terms</h2>
            <p>
              We may update these Terms from time to time. We will notify users of significant
              changes by posting a notice on the Service. Continued use after changes constitutes
              acceptance of the new Terms.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">10. Privacy Policy</h2>
            <p>
              Your privacy matters. Please see our full{" "}
              <Link to="/privacy" className="text-primary hover:underline">
                Privacy Policy
              </Link>{" "}
              for details on what data we collect, how we use it, and how you can delete your
              account.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">11. Open Source</h2>
            <p>
              Whendoist is open source software. You can view, audit, and contribute to the source
              code at{" "}
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
            <h2 className="text-lg font-semibold">12. Contact</h2>
            <p>
              For questions about these Terms, please contact{" "}
              <a href="mailto:alex@bogdanov.wtf" className="text-primary hover:underline">
                alex@bogdanov.wtf
              </a>
              .
            </p>
          </section>
        </article>

        <footer className="mt-8 flex gap-4 text-sm">
          <Link to="/privacy" className="text-muted-foreground hover:underline">
            Privacy Policy
          </Link>
          <Link to="/" className="text-muted-foreground hover:underline">
            Back to Whendoist
          </Link>
        </footer>
      </div>
    </ScrollArea>
  );
}
