import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PlatformSnapshot, PlatformSupportCase } from "@/lib/api/GymOSApi";
import SupportPage from "./page";

const state = {
  snapshot: undefined as PlatformSnapshot | undefined,
};

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

vi.mock("@/lib/providers/experience-provider", () => ({
  useExperience: () => ({ platformSnapshot: state.snapshot, experienceStatus: "ready", retryExperience: () => undefined }),
}));

vi.mock("@/lib/auth/rivet-identity", () => ({
  useRivetIdentity: () => ({ userId: "platform-admin", fullName: "RIVET Admin" }),
}));

vi.mock("@/lib/api/client", () => ({
  getApi: () => ({}),
}));

function supportCase(overrides: Partial<PlatformSupportCase> = {}): PlatformSupportCase {
  return {
    id: "SUP-1",
    gym: "Northline Strength",
    subject: "Payment retry failed",
    priority: "urgent",
    status: "open",
    createdAt: "2026-08-20T08:00:00.000Z",
    ...overrides,
  };
}

function snapshot(supportCases: PlatformSupportCase[]): PlatformSnapshot {
  return {
    gyms: [],
    bookings: [],
    invoices: [],
    supportCases,
    plans: [],
    applications: [],
    auditEvents: [],
    overview: {
      gymCounts: { trial: 0, active: 0, past_due: 0, suspended: 0, cancelled: 0 },
      branchCount: 0,
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
      openSupportCases: supportCases.length,
      urgentSupportCases: supportCases.filter((item) => item.priority === "urgent").length,
      billingHistory: [],
      operatorQueue: [],
    },
  };
}

describe("SupportPage", () => {
  beforeEach(() => {
    state.snapshot = snapshot([supportCase(), supportCase({ id: "SUP-2", subject: "Owner access request", priority: "normal" })]);
    window.history.replaceState({}, "", "/platform/support");
  });

  it("follows same-route support case query changes", () => {
    window.history.replaceState({}, "", "/platform/support?case=SUP-1");
    const view = render(<SupportPage />);
    expect(screen.getByRole("heading", { name: "Payment retry failed" })).toBeInTheDocument();

    window.history.replaceState({}, "", "/platform/support?case=SUP-2");
    view.rerender(<SupportPage />);
    expect(screen.getByRole("heading", { name: "Owner access request" })).toBeInTheDocument();
  });
});
