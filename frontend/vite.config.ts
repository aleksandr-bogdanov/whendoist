import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    TanStackRouterVite({ routesDirectory: "./src/routes" }),
    react({
      babel: {
        plugins: ["babel-plugin-react-compiler"],
      },
    }),
    tailwindcss(),
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
  server: {
    proxy: {
      "/api": "http://localhost:8000",
      "/auth": "http://localhost:8000",
    },
  },
});
