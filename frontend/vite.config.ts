import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const appVersion = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "../VERSION"),
  "utf-8",
).trim();

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  server: {
    port: 5173,
    proxy: {
      "/geometry": "http://127.0.0.1:8000",
      "/agent": "http://127.0.0.1:8000",
      "/auth": "http://127.0.0.1:8000",
      "/documents": "http://127.0.0.1:8000",
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
  },
});
