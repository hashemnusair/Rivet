import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { INITIAL_CUSTOMER_MEMBERSHIPS, MARKETPLACE_GYMS } from "@/lib/public/experience-data";
import MembershipDetailClient from "./membership-detail.client";

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
  useExperience: () => ({ memberships: INITIAL_CUSTOMER_MEMBERSHIPS }),
  useMarketplaceGyms: () => MARKETPLACE_GYMS,
}));

describe("member visit history", () => {
  it("shows the signed-in member's check-in dates, times, branch and member name", () => {
    const membership = INITIAL_CUSTOMER_MEMBERSHIPS[0]!;
    render(<MembershipDetailClient membershipId={membership.id} />);

    expect(screen.getByRole("heading", { name: /visit history/i })).toBeInTheDocument();
    expect(screen.getByText("Thu · 30 Jul 2026")).toBeInTheDocument();
    expect(screen.getByText(/19:12 · Forge — Abdoun/)).toBeInTheDocument();
    expect(screen.getAllByText("Checked in as Lina Haddad")).toHaveLength(membership.visitHistory.length);
  });
});
