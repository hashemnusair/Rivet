import { describe, expect, it } from "vitest";
import { gateJevRequest, resolveJevMode, utcDay } from "./jevMode";

const now = Date.parse("2026-09-21T10:00:00Z");
const live = { RIVET_JEV_MODE: "live", RIVET_JEV_FEATURES: "foundation, crm", RIVET_JEV_FREE_UNTIL: "2026-09-25", AI_GATEWAY_API_KEY: "placeholder-not-a-real-key" };
const open = { tenantEnabled: true, breakerTripped: false, globalRequestsToday: 0, tenantRequestsToday: 0 };

describe("resolveJevMode", () => {
  it("is off by default and never reads a key value", () => {
    const resolution = resolveJevMode({}, now);
    expect(resolution).toMatchObject({ mode: "off", source: "default", keyConfigured: false, features: [], freeTerms: "unconfirmed", dailyCap: 200, tenantDailyCap: 50, zeroDataRetention: false, warnings: [] });
    expect(JSON.stringify(resolveJevMode(live, now))).not.toContain("placeholder-not-a-real-key");
  });

  it("falls back to off on an unknown mode and warns", () => {
    expect(resolveJevMode({ RIVET_JEV_MODE: "yes" }, now)).toMatchObject({ mode: "off", warnings: [expect.stringContaining("not one of off, fixture, live")] });
  });

  it("confirms free terms only for a well-formed date that is today or later, in UTC", () => {
    expect(resolveJevMode({ RIVET_JEV_FREE_UNTIL: "2026-09-21" }, now).freeTerms).toBe("confirmed");
    expect(resolveJevMode({ RIVET_JEV_FREE_UNTIL: "2026-09-25" }, now).freeTerms).toBe("confirmed");
    expect(resolveJevMode({ RIVET_JEV_FREE_UNTIL: "2026-09-20" }, now).freeTerms).toBe("expired");
    expect(resolveJevMode({ RIVET_JEV_FREE_UNTIL: "25/09/2026" }, now)).toMatchObject({ freeTerms: "invalid", warnings: [expect.stringContaining("YYYY-MM-DD")] });
    expect(utcDay(Date.parse("2026-09-25T23:59:59Z"))).toBe("2026-09-25");
    expect(utcDay(Date.parse("2026-09-26T00:00:00Z"))).toBe("2026-09-26");
  });

  it("parses feature lists and caps, warning on a bad cap and an empty live feature list", () => {
    expect(resolveJevMode({ RIVET_JEV_MODE: "live", RIVET_JEV_FEATURES: " Foundation ,crm,", RIVET_JEV_DAILY_CAP: "10", RIVET_JEV_TENANT_DAILY_CAP: "-3" }, now)).toMatchObject({ features: ["foundation", "crm"], dailyCap: 10, tenantDailyCap: 50, warnings: [expect.stringContaining("RIVET_JEV_TENANT_DAILY_CAP")] });
    expect(resolveJevMode({ RIVET_JEV_MODE: "live" }, now).warnings).toEqual([expect.stringContaining("RIVET_JEV_FEATURES is empty")]);
  });
});

describe("gateJevRequest", () => {
  it("refuses everything while the mode is off, before any other check", () => {
    expect(gateJevRequest({ resolution: resolveJevMode({}, now), featureKey: "foundation", ...open })).toEqual({ allowed: false, reason: "mode_off", message: expect.any(String) });
  });

  it("allows fixture mode for an enabled gym without a key or free terms, and refuses a disabled gym", () => {
    const resolution = resolveJevMode({ RIVET_JEV_MODE: "fixture" }, now);
    expect(gateJevRequest({ resolution, featureKey: "anything", ...open })).toEqual({ allowed: true, mode: "fixture" });
    expect(gateJevRequest({ resolution, featureKey: "anything", ...open, tenantEnabled: false })).toMatchObject({ allowed: false, reason: "tenant_off" });
  });

  it("walks the live checks in order: feature, gym, key, free terms, breaker, caps", () => {
    const resolution = resolveJevMode(live, now);
    expect(gateJevRequest({ resolution, featureKey: "finance", ...open })).toMatchObject({ allowed: false, reason: "feature_off" });
    expect(gateJevRequest({ resolution, featureKey: "crm", ...open, tenantEnabled: false })).toMatchObject({ allowed: false, reason: "tenant_off" });
    expect(gateJevRequest({ resolution: resolveJevMode({ ...live, AI_GATEWAY_API_KEY: "" }, now), featureKey: "crm", ...open })).toMatchObject({ allowed: false, reason: "key_missing" });
    expect(gateJevRequest({ resolution: resolveJevMode({ ...live, RIVET_JEV_FREE_UNTIL: undefined }, now), featureKey: "crm", ...open })).toMatchObject({ allowed: false, reason: "free_terms_unconfirmed" });
    expect(gateJevRequest({ resolution: resolveJevMode({ ...live, RIVET_JEV_FREE_UNTIL: "not-a-date" }, now), featureKey: "crm", ...open })).toMatchObject({ allowed: false, reason: "free_terms_unconfirmed" });
    expect(gateJevRequest({ resolution: resolveJevMode(live, Date.parse("2026-09-26T00:00:01Z")), featureKey: "crm", ...open })).toMatchObject({ allowed: false, reason: "free_terms_expired" });
    expect(gateJevRequest({ resolution, featureKey: "crm", ...open, breakerTripped: true })).toMatchObject({ allowed: false, reason: "breaker_tripped" });
    expect(gateJevRequest({ resolution, featureKey: "crm", ...open, globalRequestsToday: 200 })).toMatchObject({ allowed: false, reason: "daily_cap" });
    expect(gateJevRequest({ resolution, featureKey: "crm", ...open, tenantRequestsToday: 50 })).toMatchObject({ allowed: false, reason: "tenant_daily_cap" });
    expect(gateJevRequest({ resolution, featureKey: "crm", ...open })).toEqual({ allowed: true, mode: "live" });
    expect(gateJevRequest({ resolution, ...open })).toEqual({ allowed: true, mode: "live" });
  });

  it("a zero cap means no live call at all", () => {
    expect(gateJevRequest({ resolution: resolveJevMode({ ...live, RIVET_JEV_DAILY_CAP: "0" }, now), featureKey: "crm", ...open })).toMatchObject({ allowed: false, reason: "daily_cap" });
  });
});
