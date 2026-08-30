import { render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { INITIAL_CUSTOMER_MEMBERSHIPS, MARKETPLACE_GYMS, type CustomerMembership } from "@/lib/public/experience-data";
import MembershipDetailClient from "./membership-detail.client";

const state = vi.hoisted(() => ({
  memberships: [] as CustomerMembership[],
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
});
