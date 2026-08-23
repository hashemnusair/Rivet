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
      gymCounts: { trial: 0, active: 1, past_due: 0, suspended: 0, cancelled: 0 },
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
    const gymLinks = screen.getAllByRole("link").filter((link) => link.getAttribute("href")?.startsWith("/platform/gyms/") === true);
    expect(gymLinks.map((link) => link.getAttribute("href"))).toEqual(["/platform/gyms/tenant-live"]);
  });

  it("deep-links invoice queue items to their ledger row", () => {
    state.snapshot = snapshot();
    state.snapshot.overview.operatorQueue = [{ id: "invoice:INV-42", severity: "danger", title: "Platform invoice needs attention", detail: "Suspended Tenant · JOD 149.000", href: "/platform/billing" }];

    render(<PlatformOverviewPage />);

    expect(screen.getByRole("link", { name: /Platform invoice needs attention/ })).toHaveAttribute("href", "/platform/billing?invoice=INV-42");
  });
});
