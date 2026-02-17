import { createFileRoute } from "@tanstack/react-router";
import { FlaskConical, LogIn } from "lucide-react";
import { useGetBuildInfoApiV1BuildInfoGet } from "@/api/queries/build/build";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const buildInfo = useGetBuildInfoApiV1BuildInfoGet();
  const info = buildInfo.data as { demo_login_enabled?: boolean } | undefined;
  const demoEnabled = info?.demo_login_enabled ?? false;

  return (
    <div className="flex min-h-[var(--app-height,100vh)] items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-brand text-white font-bold text-xl">
            W
          </div>
          <CardTitle className="text-2xl">Whendoist</CardTitle>
          <CardDescription>
            Your calendar shows when you're busy. Your task list shows what to do. Whendoist shows{" "}
            <em>when</em> to actually do it.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Button
            className="w-full"
            size="lg"
            onClick={() => {
              window.location.href = "/auth/google";
            }}
          >
            <LogIn className="mr-2 h-4 w-4" />
            Sign in with Google
          </Button>

          {demoEnabled && (
            <Button
              variant="outline"
              className="w-full"
              size="lg"
              onClick={() => {
                window.location.href = "/auth/demo";
              }}
            >
              <FlaskConical className="mr-2 h-4 w-4" />
              Try Demo
            </Button>
          )}

          <p className="mt-4 text-center text-xs text-muted-foreground">
            By signing in, you agree to our{" "}
            <a href="/terms" className="underline hover:text-foreground">
              Terms
            </a>{" "}
            and{" "}
            <a href="/privacy" className="underline hover:text-foreground">
              Privacy Policy
            </a>
            .
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
