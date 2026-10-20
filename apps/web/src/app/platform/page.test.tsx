import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PlatformSnapshot } from "@/lib/api/GymOSApi";
import PlatformOverviewPage from "./page";

const state = vi.hoisted(() => ({ snapshot: undefined as PlatformSnapshot | undefined }));

vi.mock("@/lib/providers/experience-provider", () => ({
  useExperience: () => ({
    marketplaceGyms: [{ id: "public-only", name: "Public Stream Gym", shortName: "PS", tagline: "", description: "", city: "Amman", areas: [], category: "", audience: "", memberCount: 0, branchCount: 1, fromPriceMinor: 0, amenities: [], accent: "#222222", featured: false, subscriptionStatus: "active", rivetPlan: "Starter", joinedAt: "", lastActiveAt: "", monthlyRevenueMinor: 0, isPublic: true, branches: [] }],
    platformSnapshot: state.snapshot,
  }),
}));

vi.mock("@/lib/hooks/use-api", () => ({
  useApiQuery: () => ({ isLoading: false, data: { profileCount: 0, memberCount: 0, totalCount: 0 } }),
  useApiMutation: () => ({ isPending: false, mutate: vi.fn() }),
}));

function snapshot(): PlatformSnapshot {
  return {
    gyms: [
      { id: "tenant-live", name: "Live Tenant", shortName: "LT", tagline: "", description: "", city: "Amman", areas: [], category: "", audience: "", memberCount: 0, branchCount: 2, fromPriceMinor: 0, amenities: [], accent: "#222222", featured: false, subscriptionStatus: "active", rivetPlan: "Growth", joinedAt: "", lastActiveAt: "", monthlyRevenueMinor: 0, isPublic: true, isProvisioned: true, branches: [] },
      { id: "tenant-hidden", name: "Suspended Tenant", shortName: "ST", tagline: "", description: "", city: "Amman", areas: [], category: "", audience: "", memberCount: 0, branchCount: 2, fromPriceMinor: 0, amenities: [], accent: "#111111", featured: false, subscriptionStatus: "suspended", rivetPlan: "Growth", joinedAt: "", lastActiveAt: "", monthlyRevenueMinor: 0, isPublic: false, isProvisioned: false, branches: [] },
    ],
    bookings: [],
    invoices: [],
    supportCases: [],
    plans: [],
    applications: [],
    auditEvents: [],
    overview: {
      gymCounts: { trial: 0, pending_payment: 0, active: 1, past_due: 0, suspended: 0, cancelled: 0 },
      branchCount: 2,
      memberCount: 0,
      activeStaffCount: 0,
      activeMrr: { amount: 0, currency: "JOD" },
      invoiceTotals: {
        collected: { amount: 0, currency: "JOD" },
        outstanding: { amount: 0, currency: "JOD" },
        overdue: { amount: 0, currency: "JOD" },
      },
      billingCurrencyMismatches: 0,
      trialRequests: 0,
      trialConversions: 0,
      pendingApplications: 0,
      provisioningFailures: 0,
      pastDueAccounts: 0,
      trialsExpiringSoon: 0,
      openSupportCases: 0,
      urgentSupportCases: 0,
      billingHistory: [],
      operatorQueue: [],
    },
  };
}

describe("PlatformOverviewPage", () => {
  beforeEach(() => {
    state.snapshot = snapshot();
  });

  it("shows provisioned tenants first and excludes cleanup rows from the active preview", () => {
    render(<PlatformOverviewPage />);

    expect(screen.getByText("Live Tenant")).toBeInTheDocument();
    expect(screen.queryByText("Suspended Tenant")).not.toBeInTheDocument();
    expect(screen.queryByText("Public Stream Gym")).not.toBeInTheDocument();
    expect(screen.queryByText("Marketplace views")).not.toBeInTheDocument();
    expect(screen.queryByText("Historical marketing preference migration")).not.toBeInTheDocument();
    expect(screen.queryByText("Payment provider: Not configured")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Operator queue" })).not.toBeInTheDocument();
    expect(screen.queryByText("No persisted application, billing, provisioning, or support issues need attention.")).not.toBeInTheDocument();
    const gymLinks = screen.getAllByRole("link").filter((link) => link.getAttribute("href")?.startsWith("/platform/gyms/") === true);
    expect(gymLinks.map((link) => link.getAttribute("href"))).toEqual(["/platform/gyms/tenant-live"]);
  });

  it("lists operator activity with plain labels, short references and who and when", () => {
    state.snapshot = {
      ...snapshot(),
      auditEvents: [
        { id: "a1", action: "gym.provisioning.workspace_created", summary: "Created Pro workspace for Test Gym", actorName: "Hashem Nusair", occurredAt: "2026-09-27T16:35:00.000Z" },
        { id: "a2", action: "gym_application.under_review", summary: "Moved to review gym application for Test Gym", actorName: "Hashem Nusair", occurredAt: "2026-09-27T16:34:00.000Z" },
        { id: "a3", action: "gym.subscription.update", summary: "Updated gym subscription controls and issued INV-c234d937-c2c4-48f3-a0d9-6f1afd8f1121 for the new term", actorName: "Hashem Nusair", occurredAt: "2026-09-27T17:18:00.000Z" },
      ],
    };
    render(<PlatformOverviewPage />);

    const list = screen.getByRole("list", { name: "Recent activity" });
    const text = (list.textContent ?? "").replace(/[\u2066-\u2069]/g, "");
    expect(screen.getByText("What the RIVET team changed, newest first.")).toBeInTheDocument();
    expect(text).toContain("Gym workspace created");
    expect(text).toContain("Application moved to review");
    expect(text).toContain("issued INV-C234D937 for the new term");
    expect(text).not.toMatch(/gym\.provisioning|gym_application|GYM\.|c2c4-48f3/);
    expect(text).toContain("Hashem Nusair · ");
  });
});
