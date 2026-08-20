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
    gyms: [{ id: "tenant-hidden", name: "Suspended Tenant", shortName: "ST", tagline: "", description: "", city: "Amman", areas: [], category: "", audience: "", memberCount: 0, branchCount: 2, fromPriceMinor: 0, amenities: [], accent: "#111111", featured: false, subscriptionStatus: "suspended", rivetPlan: "Growth", joinedAt: "", lastActiveAt: "", monthlyRevenueMinor: 0, isPublic: false, branches: [] }],
    bookings: [],
    invoices: [],
    supportCases: [],
    plans: [],
    applications: [],
    auditEvents: [],
    overview: {
      gymCounts: { trial: 0, active: 0, past_due: 0, suspended: 1, cancelled: 0 },
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

  it("uses the complete platform snapshot directory instead of public marketplace rows", () => {
    render(<PlatformOverviewPage />);

    expect(screen.getByText("Suspended Tenant")).toBeInTheDocument();
    expect(screen.queryByText("Public Stream Gym")).not.toBeInTheDocument();
    expect(screen.queryByText("No provisioned gyms are present in the platform directory.")).not.toBeInTheDocument();
  });

  it("deep-links invoice queue items to their ledger row", () => {
    state.snapshot = snapshot();
    state.snapshot.overview.operatorQueue = [{ id: "invoice:INV-42", severity: "danger", title: "Platform invoice needs attention", detail: "Suspended Tenant · JOD 149.000", href: "/platform/billing" }];

    render(<PlatformOverviewPage />);

    expect(screen.getByRole("link", { name: /Platform invoice needs attention/ })).toHaveAttribute("href", "/platform/billing?invoice=INV-42");
  });
});
