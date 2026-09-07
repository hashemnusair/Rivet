import { fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MembershipSummary } from "@/lib/domain/types";
import { addDays, todayISODate } from "@/lib/utils/dates";
import { money } from "@/lib/utils/money";
import { renderWithApp, resetApiForTests } from "@/test/harness";
import { ExtendDialog, FreezeDialog } from "./adjustment-dialogs";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/members/member-1",
}));

afterEach(() => resetApiForTests());

const membership: MembershipSummary = {
  id: "membership-extension-preview",
  organizationId: "org-1",
  memberId: "member-1",
  planId: "plan-1",
  homeBranchId: "branch-1",
  startDate: "2026-08-12",
  endDate: "2026-09-10",
  status: "active",
  salePrice: money(45_000),
  discount: money(0),
  paymentStatus: "paid",
  soldById: "user-1",
  frozenDaysUsed: 0,
  createdAt: "2026-08-11T08:00:00.000Z",
  memberName: "Extension Preview Member",
  memberNumber: "PILOT-001",
  planName: "Pilot Monthly",
  branchName: "Main Branch",
  planFreezeAllowanceDays: 3,
  outstanding: money(0),
};

describe("ExtendDialog", () => {
  it("treats edited day counts as numbers in the expiry preview", async () => {
    await renderWithApp(<ExtendDialog open onOpenChange={() => undefined} membership={membership} />);

    const days = screen.getByRole("spinbutton");
    fireEvent.change(days, { target: { value: "15" } });

    expect(screen.getByText("2026-09-25")).toBeInTheDocument();
    expect(screen.queryByText("2029-06-10")).not.toBeInTheDocument();
  });
});

describe("FreezeDialog", () => {
  it("proposes only what the plan still allows and stops a longer freeze before it is sent", async () => {
    const today = todayISODate();
    await renderWithApp(
      <FreezeDialog open onOpenChange={() => undefined} membership={{ ...membership, endDate: addDays(today, 60) }} allowanceRemaining={3} />,
    );

    const dates = document.querySelectorAll<HTMLInputElement>('input[type="date"]');
    expect(dates[0]).toHaveValue(today);
    expect(dates[1]).toHaveValue(addDays(today, 2));
    expect(screen.getByText("3 days")).toBeInTheDocument();
    expect(screen.getByTestId("confirm-freeze")).toBeEnabled();

    fireEvent.change(dates[1]!, { target: { value: addDays(today, 5) } });

    expect(await screen.findByTestId("freeze-problem")).toHaveTextContent("This plan allows 3 more freeze days.");
    expect(screen.getByTestId("confirm-freeze")).toBeDisabled();
  });

  it("refuses a freeze that begins after the term ends", async () => {
    const today = todayISODate();
    await renderWithApp(
      <FreezeDialog open onOpenChange={() => undefined} membership={{ ...membership, endDate: addDays(today, 5) }} allowanceRemaining={10} />,
    );
    const dates = document.querySelectorAll<HTMLInputElement>('input[type="date"]');
    fireEvent.change(dates[0]!, { target: { value: addDays(today, 6) } });
    fireEvent.change(dates[1]!, { target: { value: addDays(today, 8) } });

    expect(await screen.findByTestId("freeze-problem")).toHaveTextContent(`A freeze must begin during the current term, which ends ${addDays(today, 5)}.`);
    expect(screen.getByTestId("confirm-freeze")).toBeDisabled();
  });
});
