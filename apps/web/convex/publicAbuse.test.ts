import { afterEach, describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import { internal } from "./_generated/api";
import schema from "./schema";

declare global { interface ImportMeta { glob(pattern: string): Record<string, () => Promise<unknown>>; } }
const modules = import.meta.glob("./**/*.ts");
const testEnv = process.env as Record<string, string | undefined>;
const previous = {
  nodeEnv: testEnv.NODE_ENV,
  vercelEnv: testEnv.VERCEL_ENV,
  vitest: testEnv.VITEST,
  pepper: testEnv.RIVET_PUBLIC_REQUEST_PEPPER,
  fallback: testEnv.RIVET_PUBLIC_REQUEST_ALLOW_FALLBACK,
};

afterEach(() => {
  if (previous.nodeEnv === undefined) delete testEnv.NODE_ENV; else testEnv.NODE_ENV = previous.nodeEnv;
  if (previous.vercelEnv === undefined) delete testEnv.VERCEL_ENV; else testEnv.VERCEL_ENV = previous.vercelEnv;
  if (previous.vitest === undefined) delete testEnv.VITEST; else testEnv.VITEST = previous.vitest;
  if (previous.pepper === undefined) delete testEnv.RIVET_PUBLIC_REQUEST_PEPPER; else testEnv.RIVET_PUBLIC_REQUEST_PEPPER = previous.pepper;
  if (previous.fallback === undefined) delete testEnv.RIVET_PUBLIC_REQUEST_ALLOW_FALLBACK; else testEnv.RIVET_PUBLIC_REQUEST_ALLOW_FALLBACK = previous.fallback;
});

describe("public request controls", () => {
  it("fails closed for missing and weak production peppers", async () => {
    testEnv.NODE_ENV = "production";
    delete testEnv.RIVET_PUBLIC_REQUEST_PEPPER;
    testEnv.RIVET_PUBLIC_REQUEST_ALLOW_FALLBACK = "1";
    await expect(import("./publicAbuse").then(({ privacyFingerprint }) => privacyFingerprint("missing"))).rejects.toMatchObject({ data: expect.objectContaining({ code: "CONFIGURATION_ERROR" }) });
    testEnv.RIVET_PUBLIC_REQUEST_PEPPER = "a".repeat(32);
    await expect(import("./publicAbuse").then(({ privacyFingerprint }) => privacyFingerprint("weak"))).rejects.toMatchObject({ data: expect.objectContaining({ code: "CONFIGURATION_ERROR" }) });

  });

  it("fails closed when a Vercel production marker contradicts local development", async () => {
    testEnv.NODE_ENV = "development";
    testEnv.VERCEL_ENV = "production";
    delete testEnv.RIVET_PUBLIC_REQUEST_PEPPER;
    testEnv.RIVET_PUBLIC_REQUEST_ALLOW_FALLBACK = "1";
    await expect(import("./publicAbuse").then(({ privacyFingerprint }) => privacyFingerprint("contradictory-runtime"))).rejects.toMatchObject({ data: expect.objectContaining({ code: "CONFIGURATION_ERROR" }) });
  });

  it("cleans expired idempotency and stale guard rows in bounded batches", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    await t.run(async (ctx) => {
      await ctx.db.insert("publicRequestIdempotency", { scope: "test", key: "expired", requestHash: "x", result: {}, createdAt: now - 10_000, expiresAt: now - 1 });
      await ctx.db.insert("publicRequestIdempotency", { scope: "test", key: "fresh", requestHash: "x", result: {}, createdAt: now, expiresAt: now + 86_400_000 });
      await ctx.db.insert("publicRequestGuards", { scope: "test", fingerprint: "expired", windowStartedAt: now - 8 * 86_400_000, requestCount: 1, lastRequestAt: now - 8 * 86_400_000 });
      await ctx.db.insert("publicRequestGuards", { scope: "test", fingerprint: "fresh", windowStartedAt: now, requestCount: 1, lastRequestAt: now });
    });
    await expect(t.mutation(internal.publicAbuse.cleanupExpired, {})).resolves.toMatchObject({ idempotencyDeleted: 1, guardsDeleted: 1 });
    await t.run(async (ctx) => {
      expect(await ctx.db.query("publicRequestIdempotency").collect()).toHaveLength(1);
      expect(await ctx.db.query("publicRequestGuards").collect()).toHaveLength(1);
    });
  });
});
