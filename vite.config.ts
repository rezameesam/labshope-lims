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
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
  },
}));
