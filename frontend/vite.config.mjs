import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  build: {
    outDir: "dist/client",
    rollupOptions: {
      output: {
        manualChunks: {
          charts: ["echarts/core", "echarts/charts", "echarts/components", "echarts/renderers"],
          react: ["react", "react-dom", "react-router-dom"],
          icons: ["@phosphor-icons/react"],
        },
      },
    },
  },
  optimizeDeps: {
    include: ["react", "react-dom/client"],
  },
  server: {
    host: "0.0.0.0",
    allowedHosts: ["terminal.local", "localhost", "127.0.0.1"],
    proxy: {
      "/api": "http://127.0.0.1:3201",
      "/health": "http://127.0.0.1:3201",
      "/ready": "http://127.0.0.1:3201",
    },
    warmup: {
      clientFiles: ["./src/main.jsx"],
    },
  },
  plugins: [react()],
});
