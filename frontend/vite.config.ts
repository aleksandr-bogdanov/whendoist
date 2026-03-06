import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// Tauri sets TAURI_ENV_PLATFORM during `tauri dev` and `tauri build`
const isTauri = !!process.env.TAURI_ENV_PLATFORM;

export default defineConfig({
  // Tauri expects a fixed port for devUrl
  server: {
    port: 5173,
    strictPort: true,
    // Bind to all interfaces when running under Tauri so physical devices can reach the dev server
    host: isTauri ? "0.0.0.0" : undefined,
    // Point HMR WebSocket at the Mac's LAN IP so physical iOS/Android devices can connect
    hmr:
      isTauri && process.env.TAURI_DEV_HOST
        ? { host: process.env.TAURI_DEV_HOST, port: 5173 }
        : undefined,
    proxy: isTauri
      ? {
          // Tauri dev: proxy to production (iOS WKWebView can't reach external HTTPS)
          "/api": {
            target: "https://whendoist.com",
            changeOrigin: true,
            secure: true,
            // Restore POST body stripped by iOS WKWebView (encoded in X-Tauri-Body header)
            configure: (proxy) => {
              proxy.on("proxyReq", (proxyReq, req) => {
                const encoded = req.headers["x-tauri-body"];
                if (typeof encoded === "string") {
                  const body = Buffer.from(encoded, "base64").toString();
                  proxyReq.removeHeader("x-tauri-body");
                  proxyReq.setHeader("Content-Length", Buffer.byteLength(body));
                  proxyReq.write(body);
                }
              });
            },
          },
          "/auth": {
            target: "https://whendoist.com",
            changeOrigin: true,
            secure: true,
          },
        }
      : {
          "/api": "http://localhost:8000",
          "/auth": "http://localhost:8000",
        },
  },

  // Tauri preview: same proxy as dev server (for `just tauri-ios-fast`)
  preview: isTauri
    ? {
        port: 5173,
        strictPort: true,
        host: "0.0.0.0",
        proxy: {
          "/api": {
            target: "https://whendoist.com",
            changeOrigin: true,
            secure: true,
            configure: (proxy) => {
              proxy.on("proxyReq", (proxyReq, req) => {
                const encoded = req.headers["x-tauri-body"];
                if (typeof encoded === "string") {
                  const body = Buffer.from(encoded, "base64").toString();
                  proxyReq.removeHeader("x-tauri-body");
                  proxyReq.setHeader("Content-Length", Buffer.byteLength(body));
                  proxyReq.write(body);
                }
              });
            },
          },
          "/auth": {
            target: "https://whendoist.com",
            changeOrigin: true,
            secure: true,
          },
        },
      }
    : {},

  // Tauri uses `ipc://localhost` on macOS, `https://tauri.localhost` on others
  clearScreen: false,

  // Environment variables prefixed with TAURI_ are exposed to the frontend
  envPrefix: ["VITE_", "TAURI_ENV_"],

  plugins: [
    TanStackRouterVite({ routesDirectory: "./src/routes" }),
    react({
      babel: {
        plugins: ["babel-plugin-react-compiler"],
      },
    }),
    tailwindcss(),
    // Skip PWA plugin when building for Tauri — native app handles install/updates
    ...(!isTauri
      ? [
          VitePWA({
            registerType: "autoUpdate",
            manifest: {
              name: "Whendoist",
              short_name: "Whendoist",
              description: "When do I do my tasks? Schedule your tasks alongside your calendar.",
              theme_color: "#6D5EF6",
              background_color: "#ffffff",
              display: "standalone",
              orientation: "any",
              start_url: "/",
              scope: "/",
              categories: ["productivity", "utilities"],
              icons: [
                {
                  src: "/icons/icon-192.png",
                  sizes: "192x192",
                  type: "image/png",
                  purpose: "any",
                },
                {
                  src: "/icons/icon-512.png",
                  sizes: "512x512",
                  type: "image/png",
                  purpose: "any",
                },
                {
                  src: "/icons/maskable-192.png",
                  sizes: "192x192",
                  type: "image/png",
                  purpose: "maskable",
                },
                {
                  src: "/icons/maskable-512.png",
                  sizes: "512x512",
                  type: "image/png",
                  purpose: "maskable",
                },
              ],
              shortcuts: [
                {
                  name: "Tasks",
                  short_name: "Tasks",
                  description: "View and schedule your tasks",
                  url: "/dashboard",
                  icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
                },
                {
                  name: "Thoughts",
                  short_name: "Thoughts",
                  description: "Quick capture ideas",
                  url: "/thoughts",
                  icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
                },
              ],
            },
          }),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // Pre-bundle heavy deps so the dev server sends fewer requests over WiFi to
  // physical devices. Vite normally discovers these lazily, causing waterfalls.
  optimizeDeps: {
    include: [
      "react",
      "react-dom/client",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      "@tanstack/react-query",
      "@tanstack/react-router",
      "@radix-ui/react-dialog",
      "@radix-ui/react-popover",
      "@radix-ui/react-collapsible",
      "@radix-ui/react-slot",
      "@radix-ui/react-tooltip",
      "@radix-ui/react-dropdown-menu",
      "axios",
      "zustand",
      "sonner",
      "lucide-react",
      "motion/react",
      "zod",
      "recharts",
    ],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("recharts") || id.includes("d3-") || id.includes("victory-vendor"))
            return "recharts";
          if (id.includes("@dnd-kit")) return "dnd";
          if (id.includes("@tanstack/react-router") || id.includes("@tanstack/router"))
            return "router";
          if (id.includes("@tanstack/react-query") || id.includes("@tanstack/query"))
            return "query";
          if (id.includes("lucide-react")) return "icons";
          if (id.includes("radix-ui") || id.includes("@radix-ui")) return "radix";
          if (id.includes("motion")) return "motion";
          if (id.includes("vaul")) return "vaul";
          if (id.includes("axios")) return "axios";
          if (id.includes("react-dom")) return "react-dom";
          if (id.includes("/react/")) return "react";
          if (id.includes("sonner") || id.includes("zustand") || id.includes("zod"))
            return "vendor";
        },
      },
    },
  },
});
