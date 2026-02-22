import { QueryClientProvider } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "sonner";
import { queryClient } from "@/lib/query-client";
import { TOAST_DURATION } from "@/lib/toast";
import { routeTree } from "./routeTree.gen";
import "@/styles/globals.css";

const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <Toaster richColors position="bottom-right" toastOptions={{ duration: TOAST_DURATION }} />
    </QueryClientProvider>
  </StrictMode>,
);
