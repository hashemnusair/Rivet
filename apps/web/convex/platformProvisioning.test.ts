import { describe, expect, it } from "vitest";
import { INVITATION_REDIRECT_PATH, OWNER_INVITATION_REDIRECT_PATH, provisioningIdentifiers } from "./platformProvisioning";
import { clerkInvitationMatches, clerkOrganizationMatches, ClerkProviderError, provisioningFaultMessage } from "./platformProvisioningAction";

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

  it("never binds an unrelated Clerk organization from a colliding slug", () => {
    const input = { name: "Northline Strength", slug: "northline-strength-abc123", applicationId: "app-123", organizationPublicId: "org-public-123" };
    expect(clerkOrganizationMatches({ id: "org-unrelated", slug: input.slug, public_metadata: {} }, input)).toBe(false);
    expect(clerkOrganizationMatches({ id: "org-owned", slug: input.slug, public_metadata: { rivetApplicationId: input.applicationId } }, input)).toBe(true);
  });

  it("rejects contradictory organization metadata while retaining partial legacy matches", () => {
    const input = { name: "Northline Strength", slug: "northline-strength-abc123", applicationId: "app-123", organizationPublicId: "org-public-123" };
    expect(clerkOrganizationMatches({ id: "org-owned", public_metadata: { rivetApplicationId: input.applicationId, rivetOrganizationPublicId: input.organizationPublicId } }, input)).toBe(true);
    expect(clerkOrganizationMatches({ id: "org-conflict", public_metadata: { rivetApplicationId: input.applicationId, rivetOrganizationPublicId: "org-other" } }, input)).toBe(false);
    expect(clerkOrganizationMatches({ id: "org-legacy-app", public_metadata: { rivetApplicationId: input.applicationId } }, input)).toBe(true);
    expect(clerkOrganizationMatches({ id: "org-legacy-workspace", public_metadata: { rivetOrganizationPublicId: input.organizationPublicId } }, input)).toBe(true);
    expect(clerkOrganizationMatches({ id: "org-empty", public_metadata: {} }, input)).toBe(false);
  });

  it("does not reuse an unrelated pending same-email invitation", () => {
    const input = { email: "owner@example.test", applicationId: "app-123", organizationPublicId: "org-public-123" };
    expect(clerkInvitationMatches({ id: "inv-unrelated", email_address: input.email, status: "pending", public_metadata: {} }, input)).toBe(false);
    expect(clerkInvitationMatches({ id: "inv-other-workspace", email_address: input.email, status: "pending", public_metadata: { rivetApplicationId: input.applicationId, rivetOrganizationPublicId: "org-other" } }, input)).toBe(false);
    expect(clerkInvitationMatches({ id: "inv-owned", email_address: input.email, status: "pending", public_metadata: { rivetApplicationId: input.applicationId, rivetOrganizationPublicId: input.organizationPublicId } }, input)).toBe(true);
    expect(clerkInvitationMatches({ id: "inv-legacy", email_address: input.email, status: "pending", public_metadata: { rivetOrganizationPublicId: input.organizationPublicId } }, input)).toBe(true);
    expect(clerkInvitationMatches({ id: "inv-accepted", email_address: input.email, status: "accepted", public_metadata: { rivetApplicationId: input.applicationId, rivetOrganizationPublicId: input.organizationPublicId } }, input)).toBe(false);
  });

  it("classifies Clerk HTTP failures without persisting provider payloads", () => {
    expect(new ClerkProviderError("rate limited", { status: 429, providerCode: "rate_limit" }).retryable).toBe(true);
    expect(new ClerkProviderError("request timeout", { status: 408, providerCode: "timeout" }).retryable).toBe(true);
    expect(new ClerkProviderError("early response", { status: 425, providerCode: "too_early" }).retryable).toBe(true);
    expect(new ClerkProviderError("invalid request", { status: 422, providerCode: "form_param_invalid" }).retryable).toBe(false);
    expect(new ClerkProviderError("missing body", { status: 201, ambiguous: true }).retryable).toBe(true);
    expect(new ClerkProviderError("network", { status: 0 }).retryable).toBe(true);
  });
});
