import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/thoughts")({
  component: ThoughtsPage,
});

function ThoughtsPage() {
  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="text-center">
        <h1 className="text-2xl font-semibold mb-2">Thoughts</h1>
        <p className="text-muted-foreground">Thoughts inbox will be built in a later phase.</p>
      </div>
    </div>
  );
}
