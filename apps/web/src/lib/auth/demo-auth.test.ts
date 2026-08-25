import { describe, expect, it } from "vitest";
import { demoAuthBypassAllowed } from "./demo-auth";

describe("demo auth guard", () => {
  it("allows the deterministic bypass only outside production", () => {
    expect(demoAuthBypassAllowed({ NEXT_PUBLIC_RIVET_DEMO_AUTH: "1", NODE_ENV: "development" })).toBe(true);
    expect(demoAuthBypassAllowed({ NEXT_PUBLIC_RIVET_DEMO_AUTH: "1", NODE_ENV: "test" })).toBe(true);
    expect(demoAuthBypassAllowed({ NEXT_PUBLIC_RIVET_DEMO_AUTH: "1", NODE_ENV: "production" })).toBe(false);
    expect(demoAuthBypassAllowed({ NEXT_PUBLIC_RIVET_DEMO_AUTH: "1", NODE_ENV: "production", VERCEL_ENV: "preview", NEXT_PUBLIC_RIVET_DEPLOYMENT_CLASS: "preview" })).toBe(true);
    expect(demoAuthBypassAllowed({ NEXT_PUBLIC_RIVET_DEMO_AUTH: "1", NODE_ENV: "development", VERCEL_ENV: "production" })).toBe(false);
    expect(demoAuthBypassAllowed({ NEXT_PUBLIC_RIVET_DEMO_AUTH: "1", NODE_ENV: "production", VERCEL_ENV: "production", NEXT_PUBLIC_RIVET_DEPLOYMENT_CLASS: "preview" })).toBe(false);
    expect(demoAuthBypassAllowed({ NEXT_PUBLIC_RIVET_DEMO_AUTH: "0", NODE_ENV: "development" })).toBe(false);
  });
});
