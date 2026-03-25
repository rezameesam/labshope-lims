/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;

          if (
            id.includes("framer-motion") ||
            id.includes("motion-dom") ||
            id.includes("motion-utils")
          ) {
            return "vendor-motion";
          }

          if (
            id.includes("@radix-ui/") ||
            id.includes("react-remove-scroll") ||
            id.includes("aria-hidden") ||
            id.includes("react-style-singleton") ||
            id.includes("use-callback-ref") ||
            id.includes("use-sidecar")
          ) {
            return "vendor-radix";
          }

          if (
            id.includes("react-router") ||
            id.includes("@remix-run/router")
          ) {
            return "vendor-router";
          }

          if (id.includes("next-themes")) {
            return "vendor-theme";
          }

          if (id.includes("sonner")) {
            return "vendor-sonner";
          }

          if (id.includes("html2canvas")) {
            return "vendor-html2canvas";
          }
          if (id.includes("jspdf-autotable")) {
            return "vendor-jspdf-autotable";
          }
          if (id.includes("jspdf")) {
            return "vendor-jspdf";
          }
          if (id.includes("recharts")) {
            return "vendor-recharts";
          }
          if (id.includes("d3-")) {
            return "vendor-d3";
          }
          if (id.includes("date-fns")) {
            return "vendor-date";
          }
          if (id.includes("@supabase/supabase-js")) {
            return "vendor-supabase";
          }

          return;
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      html2canvas: path.resolve(__dirname, "./src/lib/pdf-optional/html2canvas.ts"),
      dompurify: path.resolve(__dirname, "./src/lib/pdf-optional/dompurify.ts"),
      canvg: path.resolve(__dirname, "./src/lib/pdf-optional/canvg.ts"),
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
  },
}));
