import test from "node:test";
import assert from "node:assert/strict";
import { validateConvexRuntimeEnv, validateProductionEnv } from "./validate-vercel-env.mjs";

const production = {
  VERCEL: "1",
  VERCEL_ENV: "production",
  NEXT_PUBLIC_CONVEX_URL: "https://fleet-otter-621.convex.cloud",
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_live_example",
  CLERK_SECRET_KEY: "sk_live_example",
  NEXT_PUBLIC_SITE_URL: "https://www.rivetjo.com",
  NEXT_PUBLIC_DATA_MODE: "convex",
  RIVET_PUBLIC_REQUEST_PEPPER: "Production-Pepper-2026!rivet-strong",
};

test("accepts complete production public configuration", () => {
  assert.deepEqual(validateProductionEnv(production), { applicable: true, missing: [] });
});

test("rejects mock/demo and invalid key classes without returning values", () => {
  const result = validateProductionEnv({
    ...production,
    NEXT_PUBLIC_DATA_MODE: "mock",
    NEXT_PUBLIC_RIVET_DEMO_AUTH: "1",
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_do_not_use",
    CLERK_SECRET_KEY: "sk_test_do_not_use",
    NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
  });
  assert.equal(result.applicable, true);
  assert.deepEqual(result.missing, [
    "NEXT_PUBLIC_DATA_MODE (must be convex for Production)",
    "NEXT_PUBLIC_RIVET_DEMO_AUTH (must not be enabled for Production)",
    "NEXT_PUBLIC_SITE_URL (must be a valid https URL)",
    "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY (must be a Production Clerk key)",
    "CLERK_SECRET_KEY (must be a Production Clerk key)",
  ]);
  assert.equal(JSON.stringify(result).includes("do_not_use"), false);
});

test("skips preview builds while still exposing the strict Convex config check", () => {
  assert.deepEqual(validateProductionEnv({ ...production, VERCEL_ENV: "preview", NEXT_PUBLIC_DATA_MODE: "mock" }), { applicable: false, missing: [] });
  assert.deepEqual(validateConvexRuntimeEnv({ CLERK_FRONTEND_API_URL: "https://clerk.example.com", ENTRY_PASS_SIGNING_SECRET: "a".repeat(32), RIVET_SITE_URL: "https://www.rivetjo.com", RIVET_PUBLIC_REQUEST_PEPPER: "Production-Pepper-2026!rivet-strong" }), { missing: [] });
  assert.deepEqual(validateConvexRuntimeEnv({}), { missing: ["CLERK_FRONTEND_API_URL", "ENTRY_PASS_SIGNING_SECRET", "RIVET_SITE_URL", "RIVET_PUBLIC_REQUEST_PEPPER"] });
});

test("rejects missing and weak public request peppers without returning their values", () => {
  const missing = validateProductionEnv({ ...production, RIVET_PUBLIC_REQUEST_PEPPER: undefined });
  assert.deepEqual(missing.missing, ["RIVET_PUBLIC_REQUEST_PEPPER"]);
  const weak = validateProductionEnv({ ...production, RIVET_PUBLIC_REQUEST_PEPPER: "a".repeat(32) });
  assert.deepEqual(weak.missing, ["RIVET_PUBLIC_REQUEST_PEPPER (must be at least 32 characters with 3 character classes)"]);
  assert.equal(JSON.stringify(weak).includes("aaaa"), false);
  const fallback = validateProductionEnv({ ...production, RIVET_PUBLIC_REQUEST_ALLOW_FALLBACK: "1" });
  assert.deepEqual(fallback.missing, ["RIVET_PUBLIC_REQUEST_ALLOW_FALLBACK (must not be enabled for Production)"]);
});

test("rejects a preview deployment class when Vercel is building Production", () => {
  const result = validateProductionEnv({ ...production, NEXT_PUBLIC_RIVET_DEPLOYMENT_CLASS: "preview" });
  assert.deepEqual(result.missing, ["NEXT_PUBLIC_RIVET_DEPLOYMENT_CLASS (must not be preview for Production)"]);
});
