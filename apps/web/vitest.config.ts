import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "url";

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
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}", "convex/**/*.test.ts"],
    css: false,
  },
});
