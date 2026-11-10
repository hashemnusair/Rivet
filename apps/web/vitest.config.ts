import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "url";

// Node 25 and later define their own `localStorage` global. Without a storage
// file it reads as undefined and hides the one jsdom provides, so every test
// that touches storage fails. CI runs Node 22, where the global does not exist;
// turning the built-in off makes newer local Node versions behave the same.
const nodeMajor = Number(process.versions.node.split(".")[0]);
const workerNodeFlags = nodeMajor >= 25 ? ["--no-experimental-webstorage"] : [];

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    // The first Convex test in a file loads every server module (convex-test's
    // import.meta.glob); under Vitest 4 that alone can pass 5 s on CI runners.
    testTimeout: 15_000,
    globals: true,
    execArgv: workerNodeFlags,
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}", "convex/**/*.test.ts"],
    css: false,
  },
});
