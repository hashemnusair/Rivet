import { render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { INITIAL_CUSTOMER_MEMBERSHIPS, MARKETPLACE_GYMS, type CustomerMembership } from "@/lib/public/experience-data";
import MembershipDetailClient from "./membership-detail.client";

const state = vi.hoisted(() => ({
  memberships: [] as CustomerMembership[],
  getCustomerClassExperience: vi.fn(),
  bookCustomerClass: vi.fn(),
  cancelCustomerClass: vi.fn(),
}));

vi.mock("@/lib/api/client", () => ({
  getApi: () => ({
    getCustomerClassExperience: state.getCustomerClassExperience,
    bookCustomerClass: state.bookCustomerClass,
    cancelCustomerClass: state.cancelCustomerClass,
  }),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/api/ConvexGymOSApi", () => ({
  isConvexMode: () => false,
}));

vi.mock("@/lib/hooks/use-member-gate", () => ({
  useMemberGate: () => ({ ready: true, identitySignedIn: true }),
}));

vi.mock("@/lib/providers/experience-provider", () => ({
  useExperience: () => ({ memberships: state.memberships }),
  useMarketplaceGyms: () => MARKETPLACE_GYMS,
}));

describe("member visit history", () => {
  beforeEach(() => {
    state.memberships = INITIAL_CUSTOMER_MEMBERSHIPS;
    state.getCustomerClassExperience.mockReset().mockResolvedValue({
      membershipId: INITIAL_CUSTOMER_MEMBERSHIPS[0]!.id,
      gymName: "Forge Fitness",
      timezone: "Asia/Amman",
      policy: { enabled: true, eligibilityMode: "all_active_memberships", eligiblePlanIds: [], bookingHorizonDays: 30, cancellationCutoffHours: 2, maxActiveBookingsPerMember: 8, waitlistEnabled: true, waitlistSize: 12, noShowTracking: true },
      upcoming: [{ id: "occ-strength", templateId: "strength", branchId: "abdoun", branchName: "Abdoun", date: "2026-09-02", startsAt: "2026-09-02T15:00:00.000Z", endsAt: "2026-09-02T16:00:00.000Z", name: "Strength circuit", coachName: "Rana", substituted: false, capacity: 12, audience: "mixed", status: "scheduled", bookedCount: 10, waitlistCount: 0, spotsRemaining: 2, canBook: true }],
      history: [],
      noShowCount: 0,
      profileCorrectionRequired: false,
    });
    state.bookCustomerClass.mockReset().mockResolvedValue({ outcome: "booked", occurrence: {} });
    state.cancelCustomerClass.mockReset().mockResolvedValue({ outcome: "cancelled", occurrence: {} });
  });

  it("keeps recent activity collapsed until the member opens it", async () => {
    const membership = INITIAL_CUSTOMER_MEMBERSHIPS[0]!;
    const user = userEvent.setup();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={queryClient}><MembershipDetailClient membershipId={membership.id} /></QueryClientProvider>);

    expect(screen.getByText("Recent activity")).toBeInTheDocument();
    const activity = screen.getByText("Recent activity").closest("details");
    expect(activity).not.toHaveAttribute("open");
    await user.click(screen.getByText("Recent activity"));
    expect(activity).toHaveAttribute("open");
    expect(screen.getByRole("heading", { name: /visit history/i })).toBeInTheDocument();
    expect(screen.getByText("Thu · 30 Jul 2026")).toBeInTheDocument();
    expect(screen.getByText(/19:12 · Forge — Abdoun/)).toBeInTheDocument();
    expect(screen.getAllByText("Checked in as Lina Haddad")).toHaveLength(membership.visitHistory.length);
  });

  it("shows a member referral link and the current reward-window progress", () => {
    const membership = INITIAL_CUSTOMER_MEMBERSHIPS[0]!;
    state.memberships = [{
      ...membership,
      referral: {
        membershipId: membership.id,
        enabled: true,
        rewardDays: 7,
        maxRewardDaysPerWindow: 30,
        windowDays: 90,
        earnedDays: 10,
        remainingDays: 20,
        successfulReferrals: 2,
        recordedReferrals: 2,
        sharePath: "/customer/gyms/forge-fitness?ref=opaque-referral-token",
      },
    }];
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(<QueryClientProvider client={queryClient}><MembershipDetailClient membershipId={membership.id} /></QueryClientProvider>);

    const referral = screen.getByRole("region", { name: "Bring a friend. Earn 7 free days." });
    expect(within(referral).getByRole("button", { name: "Share link" })).toBeInTheDocument();
    expect(within(referral).getByRole("button", { name: "Copy" })).toBeInTheDocument();
    expect(within(referral).getByText("10/30 days")).toBeInTheDocument();
    expect(within(referral).getByText("2")).toBeInTheDocument();
    expect(within(referral).getByText("20")).toBeInTheDocument();
  });

  it("shows the live class schedule and books through the member-owned operation", async () => {
    const membership = INITIAL_CUSTOMER_MEMBERSHIPS[0]!;
    const user = userEvent.setup();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={queryClient}><MembershipDetailClient membershipId={membership.id} /></QueryClientProvider>);

    await user.click(screen.getByRole("tab", { name: "Classes" }));
    expect(await screen.findByRole("heading", { name: "Book your next class" })).toBeInTheDocument();
    expect(screen.getByText("Strength circuit")).toBeInTheDocument();
    expect(screen.getByText("2 spots left")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Book class" }));

    await waitFor(() => expect(state.bookCustomerClass).toHaveBeenCalledWith({ membershipId: membership.id, occurrenceId: "occ-strength" }));
  });
});
