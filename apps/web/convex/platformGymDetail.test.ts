import { describe, expect, it } from "vitest";
import { buildPlatformGymDetail, type PlatformGymDetailSource } from "./platformGymDetail";

function source(overrides: Partial<PlatformGymDetailSource> = {}): PlatformGymDetailSource {
  return {
    gym: {
      id: "gym-a",
      name: "Alpha Gym",
      shortName: "ALPHA",
      accent: "#111111",
      subscriptionStatus: "active",
      rivetPlan: "Growth",
      isPublic: true,
    },
    organization: {
      id: "org-a",
      name: "Alpha Gym",
      status: "active",
      currency: "JOD",
      timezone: "Asia/Amman",
      createdAt: Date.parse("2026-08-01T00:00:00.000Z"),
      subscriptionPlan: "Growth",
      subscriptionStartedAt: Date.parse("2026-08-01T00:00:00.000Z"),
    },
    branches: [{ id: "branch-a", name: "Alpha Main", code: "MAIN", address: "Alpha address", status: "active" }],
    owner: { name: "Alpha Owner", email: "owner@alpha.example", phone: "+962 79 000 0001" },
    usage: { memberCount: 7, activeStaffCount: 2, staffLimit: 25, automationRuleCount: 3, paymentTransactionCount: 11 },
    activity: [{ id: "event-a", action: "gym.subscription.update", summary: "Alpha subscription updated", actorName: "Platform Admin", occurredAt: "2026-08-02T00:00:00.000Z" }],
    ...overrides,
  };
}

describe("platform gym detail projection", () => {
  it("keeps the selected tenant's identity, branches, usage, subscription, and activity together", () => {
    const alpha = buildPlatformGymDetail(source());
    const beta = buildPlatformGymDetail(source({
      gym: { ...source().gym, id: "gym-b", name: "Beta Gym", shortName: "BETA" },
      organization: { ...source().organization!, id: "org-b", name: "Beta Gym" },
      branches: [{ id: "branch-b", name: "Beta Main", code: "MAIN", address: "Beta address", status: "active" }],
      owner: { name: "Beta Owner", email: "owner@beta.example" },
      usage: { memberCount: 19, activeStaffCount: 4, staffLimit: 80, automationRuleCount: 9, paymentTransactionCount: 31 },
      activity: [{ id: "event-b", action: "gym.subscription.update", summary: "Beta subscription updated", actorName: "Platform Admin", occurredAt: "2026-08-03T00:00:00.000Z" }],
    }));

    expect(alpha.organization).toMatchObject({ state: "available", value: { id: "org-a", name: "Alpha Gym" } });
    expect(alpha.branches).toMatchObject({ state: "available", value: [{ id: "branch-a", name: "Alpha Main" }] });
    expect(alpha.owner).toMatchObject({ state: "available", value: { name: "Alpha Owner", email: "owner@alpha.example" } });
    expect(alpha.usage.memberCount).toEqual({ state: "available", value: 7 });
    expect(alpha.usage.paymentTransactionCount).toEqual({ state: "available", value: 11 });
    expect(alpha.activity).toMatchObject({ state: "available", value: [{ id: "event-a", summary: "Alpha subscription updated" }] });
    expect(JSON.stringify(alpha)).not.toContain("Beta");
    expect(JSON.stringify(alpha)).not.toContain("owner@beta.example");
    expect(beta.organization).toMatchObject({ state: "available", value: { id: "org-b", name: "Beta Gym" } });
    expect(beta.usage.memberCount).toEqual({ state: "available", value: 19 });
    expect(JSON.stringify(beta)).not.toContain("Alpha");
  });

  it("passes through only the already-validated logo URL and keeps missing media explicit", () => {
    const withLogo = buildPlatformGymDetail(source({ logoUrl: "https://storage.example/alpha-logo.png" }));
    expect(withLogo.logoUrl).toEqual({ state: "available", value: "https://storage.example/alpha-logo.png" });

    const withoutLogo = buildPlatformGymDetail(source());
    expect(withoutLogo.logoUrl).toEqual({ state: "not_configured" });

    const directoryOnly = buildPlatformGymDetail(source({ organization: undefined, logoUrl: "https://storage.example/should-not-leak.png" }));
    expect(directoryOnly.logoUrl).toEqual({ state: "not_available" });
  });

  it("does not borrow tenant facts when a directory row has no target organization", () => {
    const detail = buildPlatformGymDetail(source({
      gym: { ...source().gym, id: "directory-only", name: "Directory Only" },
      organization: undefined,
      branches: [],
      owner: undefined,
      usage: { memberCount: 0, activeStaffCount: 0, automationRuleCount: 0, paymentTransactionCount: 0 },
      activity: [],
    }));

    expect(detail.organization).toEqual({ state: "not_available" });
    expect(detail.owner).toEqual({ state: "not_available" });
    expect(detail.usage.memberCount).toEqual({ state: "not_available" });
    expect(detail.usage.storage).toEqual({ state: "not_configured" });
    expect(detail).not.toHaveProperty("health");
    expect(detail.subscription.invoices).toEqual({ state: "not_available" });
    expect(detail.activity).toEqual({ state: "not_available" });
  });

  it("does not present a stale public toggle for a suspended tenant", () => {
    const detail = buildPlatformGymDetail(source({
      gym: { ...source().gym, isPublic: true },
      organization: { ...source().organization!, status: "suspended" },
    }));

    expect(detail.controls).toMatchObject({ status: "suspended", plan: "Growth", isPublic: false });
  });

  it("does not expose an invented health score and keeps missing billing providers explicit", () => {
    const detail = buildPlatformGymDetail(source());

    expect(detail).not.toHaveProperty("health");
    expect(detail.subscription.recurringAmount).toEqual({ state: "not_configured" });
    expect(detail.subscription.renewalDate).toEqual({ state: "not_configured" });
    expect(detail.subscription.paymentMethod).toEqual({ state: "not_configured" });
    expect(detail.subscription.invoices).toEqual({ state: "not_configured" });
  });
});
