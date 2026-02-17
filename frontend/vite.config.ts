import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const isCI = !!process.env.CI;

export default defineConfig({
  plugins: [
    TanStackRouterVite({ routesDirectory: "./src/routes" }),
    react({
      babel: {
        plugins: ["babel-plugin-react-compiler"],
      },
    }),
    tailwindcss(),
    !isCI &&
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
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    proxy: {
      "/api": "http://localhost:8000",
      "/auth": "http://localhost:8000",
    },
  },
});
