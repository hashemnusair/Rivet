import { describe, expect, it } from "vitest";
import { stagingJourneyRoles, stagingJourneySelected, stagingJourneyStatus, storageStateEnvironmentKey, validateStagingEnvironment } from "./staging-guard";

const safe = { PLAYWRIGHT_TARGET_CLASSIFICATION: "staging", PLAYWRIGHT_RUN_ID: "pilot-20260811", PLAYWRIGHT_EXPECTED_CONVEX_URL: "https://isolated-staging.convex.cloud", NEXT_PUBLIC_CONVEX_URL: "https://isolated-staging.convex.cloud", PLAYWRIGHT_PRODUCTION_CONVEX_URL: "https://production.convex.cloud", PLAYWRIGHT_PRODUCTION_HOSTS: "rivetjo.com,www.rivetjo.com", PLAYWRIGHT_STAGING_JOURNEYS: "finance,pt" };

describe("staging write guard", () => {
  it("accepts only an explicitly matching isolated staging target and normalizes legacy selectors", () => {
    expect(validateStagingEnvironment(safe, "http://127.0.0.1:3100")).toMatchObject({ runId: "pilot-20260811", convexUrl: safe.NEXT_PUBLIC_CONVEX_URL, selectedJourneys: ["finance-reconciliation", "personal-training"] });
  });
  it.each([
    [{ ...safe, PLAYWRIGHT_TARGET_CLASSIFICATION: "production" }, "PLAYWRIGHT_TARGET_CLASSIFICATION"],
    [{ ...safe, PLAYWRIGHT_RUN_ID: "short" }, "RUN_ID"],
    [{ ...safe, NEXT_PUBLIC_CONVEX_URL: "https://different.convex.cloud" }, "does not match"],
    [{ ...safe, PLAYWRIGHT_PRODUCTION_CONVEX_URL: undefined }, "must be configured"],
    [{ ...safe, PLAYWRIGHT_PRODUCTION_CONVEX_URL: safe.NEXT_PUBLIC_CONVEX_URL }, "Production Convex"],
  ])("refuses an unsafe environment", (env, message) => expect(() => validateStagingEnvironment(env, "http://127.0.0.1:3100")).toThrow(message));
  it("refuses a Production web host independently of its name", () => expect(() => validateStagingEnvironment(safe, "https://www.rivetjo.com")).toThrow("Production host"));
  it("supports individual workflow dispatch and role-specific storage keys", () => {
    expect(stagingJourneySelected(["finance-reconciliation", "personal-training"], "personal-training")).toBe(true);
    expect(stagingJourneySelected(["finance-reconciliation"], "personal-training")).toBe(false);
    expect(stagingJourneyRoles("personal-training")).toEqual(["owner", "manager", "trainer", "member"]);
    expect(storageStateEnvironmentKey("foreign_tenant")).toBe("PLAYWRIGHT_CLERK_STORAGE_FOREIGN_TENANT");
  });

  it("reports deferred, credential-blocked, implemented, and unselected journeys clearly", () => {
    expect(stagingJourneyStatus(["all"], "automation")).toBe("deferred");
    expect(stagingJourneyStatus(["all"], "reception-entry")).toBe("credential-blocked");
    expect(stagingJourneyStatus(["all"], "membership-lifecycle")).toBe("implemented");
    expect(stagingJourneyStatus(["membership-lifecycle"], "reception-entry")).toBe("not-run");
  });

  it("rejects a misspelled or unregistered workflow selector", () => {
    expect(() => validateStagingEnvironment({ ...safe, PLAYWRIGHT_STAGING_JOURNEYS: "personal-traning" }, "http://127.0.0.1:3100")).toThrow("Unknown staging journey");
  });
});
