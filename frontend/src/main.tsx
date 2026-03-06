import { QueryClientProvider } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import type React from "react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { isTauri } from "@/hooks/use-device";
import { queryClient } from "@/lib/query-client";
import { routeTree } from "./routeTree.gen";
import "@/styles/fonts.css";
import "@/styles/globals.css";

// Pre-warm the token store cache so the first API request doesn't block on
// an async IPC round-trip to the Tauri plugin-store. Fire-and-forget: the
// in-memory cache will be populated by the time the first API interceptor runs.
if (isTauri) {
  import("@/lib/tauri-token-store").then((m) => m.loadDeviceToken());
}

const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

// Skip StrictMode in Tauri dev — double effect execution + re-renders make iOS
// painfully laggy since every module is an individual HTTP request over WiFi.
const Wrapper =
  isTauri && import.meta.env.DEV
    ? ({ children }: { children: React.ReactNode }) => children
    : StrictMode;

try {
  createRoot(document.getElementById("root")!).render(
    <Wrapper>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </Wrapper>,
  );
} catch (e) {
  // Show mount errors visibly on screen (useful for iOS Tauri debugging)
  const root = document.getElementById("root");
  if (root) {
    root.style.cssText = "color:red;padding:40px;font-size:16px;white-space:pre-wrap";
    root.textContent = `React mount failed:\n${e}`;
  }
  console.error("React mount failed:", e);
}
