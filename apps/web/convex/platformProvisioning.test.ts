import { describe, expect, it } from "vitest";
import { INVITATION_REDIRECT_PATH, OWNER_INVITATION_REDIRECT_PATH, provisioningIdentifiers } from "./platformProvisioning";
import { provisioningFaultMessage } from "./platformProvisioningAction";

describe("gym provisioning identifiers", () => {
  it("uses the dedicated branded invitation route", () => {
    expect(INVITATION_REDIRECT_PATH).toBe("/login/accept-invitation");
    expect(OWNER_INVITATION_REDIRECT_PATH).toBe("/login/accept-invitation");
  });

  it("keeps retries tied to the application rather than the gym name", () => {
    const first = provisioningIdentifiers("20000000-0000-4a00-8a00-000000000042", "Northline Strength");
    const retry = provisioningIdentifiers("20000000-0000-4a00-8a00-000000000042", "Northline Strength");

    expect(retry).toEqual(first);
    expect(first.organizationPublicId).toBe("20000000-0000-4a00-8a00-000000000042");
    expect(first.branchPublicId).toBe("20000000-0000-4a00-9a00-000000000042");
    expect(first.marketplacePublicId).toBe("20000000-0000-4a00-aa00-000000000042");
  });

  it("normalizes names for Clerk slugs while preserving unique application suffixes", () => {
    const result = provisioningIdentifiers("a7f10009-0000-4a00-8a00-000000000009", "  Al-Balad Women’s Fitness / نادي  ");

    expect(result.organizationSlug).toMatch(/^al-balad-women-s-fitness-a7f100090000$/);
    expect(result.organizationSlug.length).toBeLessThanOrEqual(80);
  });

  it("falls back to a safe slug for names without Latin characters", () => {
    const result = provisioningIdentifiers("10000000-0000-4a00-8a00-000000000001", "نادي رياضي");

    expect(result.organizationSlug).toBe("gym-100000000000");
  });

  it("allows deterministic Clerk faults only with development credentials", () => {
    expect(provisioningFaultMessage("sk_test_staging", "before_organization", "before_organization")).toContain("Injected Clerk organization failure");
    expect(provisioningFaultMessage("sk_test_staging", "before_invitation", "before_invitation")).toContain("Injected Clerk invitation failure");
    expect(provisioningFaultMessage("sk_live_production", "before_invitation", "before_invitation")).toBeUndefined();
    expect(provisioningFaultMessage("sk_test_staging", "before_invitation", "before_organization")).toBeUndefined();
  });
});
