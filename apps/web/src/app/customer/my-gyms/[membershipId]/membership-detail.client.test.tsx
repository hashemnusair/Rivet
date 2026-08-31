import { render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { INITIAL_CUSTOMER_MEMBERSHIPS, MARKETPLACE_GYMS, type CustomerMembership } from "@/lib/public/experience-data";
import { addDays, todayISODate } from "@/lib/utils/dates";
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
      upcoming: [
        { id: "occ-strength", templateId: "strength", branchId: "abdoun", branchName: "Abdoun", date: todayISODate(), startsAt: `${todayISODate()}T15:00:00.000Z`, endsAt: `${todayISODate()}T16:00:00.000Z`, name: "Strength circuit", coachName: "Rana", substituted: false, capacity: 12, audience: "mixed", status: "scheduled", bookedCount: 10, waitlistCount: 0, spotsRemaining: 2, canBook: true },
        { id: "occ-tomorrow", templateId: "yoga", branchId: "abdoun", branchName: "Abdoun", date: addDays(todayISODate(), 1), startsAt: `${addDays(todayISODate(), 1)}T08:00:00.000Z`, endsAt: `${addDays(todayISODate(), 1)}T09:00:00.000Z`, name: "Sunrise yoga", coachName: "Lina", substituted: false, capacity: 10, audience: "mixed", status: "scheduled", bookedCount: 1, waitlistCount: 0, spotsRemaining: 9, canBook: true },
      ],
      history: [
        { id: "occ-past", templateId: "strength", branchId: "abdoun", branchName: "Abdoun", date: addDays(todayISODate(), -7), startsAt: `${addDays(todayISODate(), -7)}T15:00:00.000Z`, endsAt: `${addDays(todayISODate(), -7)}T16:00:00.000Z`, name: "Strength circuit", coachName: "Rana", substituted: false, capacity: 12, audience: "mixed", status: "completed", bookedCount: 12, waitlistCount: 0, spotsRemaining: 0, canBook: false, booking: { id: "bk-1", status: "attended", fromWaitlist: false } },
      ],
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
        history: [], sharePath: "/customer/gyms/forge-fitness?ref=opaque-referral-token",
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
    expect(await screen.findByRole("tablist", { name: "Classes views" })).toBeInTheDocument();
    // The pager opens on today and shows only that day's classes.
    expect(screen.getByText("Strength circuit")).toBeInTheDocument();
    expect(screen.queryByText("Sunrise yoga")).not.toBeInTheDocument();
    expect(screen.getByText("2 spots left")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Book class" }));
    await waitFor(() => expect(state.bookCustomerClass).toHaveBeenCalledWith({ membershipId: membership.id, occurrenceId: "occ-strength" }));

    // The arrow walks to tomorrow within the current week.
    const nextDay = screen.getByRole("button", { name: "Next day" });
    if (!(nextDay as HTMLButtonElement).disabled) {
      await user.click(nextDay);
      expect(screen.getByText("Sunrise yoga")).toBeInTheDocument();
      expect(screen.queryByText("Strength circuit")).not.toBeInTheDocument();
    }

    // History lists what the member actually attended.
    await user.click(screen.getByRole("tab", { name: /My history/ }));
    expect(screen.getByLabelText("My class history")).toBeInTheDocument();
    expect(screen.getByText("Attended")).toBeInTheDocument();
  });

  it("lists a dated, privacy-safe reward history with gym contact actions", () => {
    const membership = INITIAL_CUSTOMER_MEMBERSHIPS[0]!;
    state.memberships = [{
      ...membership,
      referral: {
        membershipId: membership.id,
        enabled: true,
        rewardDays: 7,
        maxRewardDaysPerWindow: 30,
        windowDays: 90,
        earnedDays: 7,
        remainingDays: 23,
        successfulReferrals: 1,
        recordedReferrals: 2,
        history: [
          { id: "reward-1", occurredAt: "2026-08-20T10:00:00.000Z", days: 7, status: "applied" },
          { id: "reward-2", occurredAt: "2026-08-25T10:00:00.000Z", days: 0, status: "capped" },
          { id: "pending-1", occurredAt: "2026-08-28T10:00:00.000Z", days: 0, status: "pending" },
        ],
        sharePath: "/customer/gyms/forge-fitness?ref=opaque-referral-token",
      },
    }];
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(<QueryClientProvider client={queryClient}><MembershipDetailClient membershipId={membership.id} /></QueryClientProvider>);

    const history = screen.getByRole("list", { name: "Referral reward history" });
    const rows = within(history).getAllByRole("listitem");
    expect(rows).toHaveLength(3);
    expect(within(rows[0]!).getByText("Applied")).toBeInTheDocument();
    expect(within(rows[0]!).getByText("+7 days")).toBeInTheDocument();
    expect(within(rows[1]!).getByText("Capped")).toBeInTheDocument();
    expect(within(rows[2]!).getByText("Waiting")).toBeInTheDocument();
    expect(within(rows[2]!).getByText(/first membership/)).toBeInTheDocument();
    // Privacy: history never names the referred person.
    expect(history.textContent).not.toMatch(/Referral Prospect|Lina|@/);

    const gym = MARKETPLACE_GYMS.find((item) => item.id === membership.gymId)!;
    const whatsapp = screen.getByRole("link", { name: /WhatsApp the gym/ });
    expect(whatsapp).toHaveAttribute("href", expect.stringContaining("wa.me/962795550100"));
    expect(screen.getByRole("link", { name: /Call/ })).toHaveAttribute("href", `tel:${gym.contactPhone}`);
  });

  it("shows the pre-first-referral empty state", () => {
    const membership = INITIAL_CUSTOMER_MEMBERSHIPS[0]!;
    state.memberships = [{
      ...membership,
      referral: { membershipId: membership.id, enabled: true, rewardDays: 7, maxRewardDaysPerWindow: 30, windowDays: 90, earnedDays: 0, remainingDays: 30, successfulReferrals: 0, recordedReferrals: 0, history: [] },
    }];
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={queryClient}><MembershipDetailClient membershipId={membership.id} /></QueryClientProvider>);
    expect(screen.getByText(/No rewards yet/)).toBeInTheDocument();
    expect(screen.getByText(/arrive after a friend joins through your link/)).toBeInTheDocument();
  });
});
