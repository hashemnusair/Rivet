import { afterEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import { internal } from "./_generated/api";
import schema from "./schema";
import { demoSeedAllowed } from "./demoSeedGuard";

declare global { interface ImportMeta { glob(pattern: string): Record<string, () => Promise<unknown>>; } }
const modules = import.meta.glob("./**/*.ts");

afterEach(() => vi.unstubAllEnvs());

describe("demo seed guard", () => {
  it("is off unless the deployment opts in, and the test runner never counts on Production", () => {
    expect(demoSeedAllowed({})).toBe(false);
    expect(demoSeedAllowed({ NODE_ENV: "production", VITEST: "true" })).toBe(false);
    expect(demoSeedAllowed({ NODE_ENV: "test" })).toBe(true);
    expect(demoSeedAllowed({ RIVET_ALLOW_DEMO_SEED: "1" })).toBe(true);
    expect(demoSeedAllowed({ RIVET_ALLOW_DEMO_SEED: "true" })).toBe(false);
  });

  it("refuses to seed the demo gym on a deployment that has not opted in", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VITEST", "");
    const t = convexTest(schema, modules);
    await expect(t.mutation(internal.seed.seedDemoTenant, {})).rejects.toThrow(/switched off/);
    expect(await t.run((ctx) => ctx.db.query("organizations").collect())).toEqual([]);
  });
});
