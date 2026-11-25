import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MembershipSummary } from "@/lib/domain/types";
import { addDays, formatDate, todayISODate } from "@/lib/utils/dates";
import { money } from "@/lib/utils/money";
import { renderWithApp, resetApiForTests } from "@/test/harness";
import { CancelMembershipDialog, CollectAfterCancelDialog, ExtendDialog, FreezeDialog } from "./adjustment-dialogs";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/members/member-1",
}));

// Radix's checkbox measures itself; jsdom has no ResizeObserver.
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;

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
  it("treats edited day counts as numbers in the end date preview", async () => {
    await renderWithApp(<ExtendDialog open onOpenChange={() => undefined} membership={membership} />);

    const days = screen.getByRole("spinbutton");
    fireEvent.change(days, { target: { value: "15" } });

    expect(screen.getByText(formatDate("2026-09-25"))).toBeInTheDocument();
    expect(screen.queryByText(formatDate("2029-06-10"))).not.toBeInTheDocument();
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

    expect(await screen.findByTestId("freeze-problem")).toHaveTextContent(`A freeze must start on or before ${formatDate(addDays(today, 5))}, when the membership ends.`);
    expect(screen.getByTestId("confirm-freeze")).toBeDisabled();
  });
});

describe("CancelMembershipDialog", () => {
  /** A seeded member who owes money and still has a membership to cancel. */
  async function owingMembership(api: Awaited<ReturnType<typeof renderWithApp>>["api"]) {
    const owing = (await api.listMembers({ membershipStatus: "outstanding", pageSize: 50 })).items;
    const memberships = (await api.listMemberships({ pageSize: 500 })).items.filter((candidate) => !candidate.cancelledAt);
    for (const member of owing) {
      const found = memberships.find((candidate) => candidate.memberId === member.id);
      if (found) return { member, membership: found };
    }
    throw new Error("The seed has no member who owes money and holds a membership.");
  }

  async function open(owes: boolean) {
    const onDone = vi.fn();
    const holder: { membership?: MembershipSummary; owed?: ReturnType<typeof money> } = {};
    const Show = () => (holder.membership ? <CancelMembershipDialog open onOpenChange={() => undefined} membership={holder.membership} owed={holder.owed} onDone={onDone} /> : null);
    const view = await renderWithApp(<Show />, {
      prepare: async (api) => {
        const { member, membership: found } = await owingMembership(api);
        holder.membership = found;
        holder.owed = owes ? member.outstanding : money(0);
      },
    });
    const cancel = vi.spyOn(view.api, "cancelMembership");
    return { ...view, onDone, cancel, membership: holder.membership!, owed: holder.owed! };
  }

  it("asks whether the money owed was paid, and offers to collect it when it was not", async () => {
    const user = userEvent.setup();
    const { onDone, cancel, membership: target, owed } = await open(true);

    const question = await screen.findByTestId("cancel-owed-question");
    expect(owed.amount).toBeGreaterThan(0);
    expect(question).toHaveTextContent(/This member owes .*JOD.*\. Has it been paid\?/);
    expect(question).toHaveTextContent("Ticking this does not record a payment.");
    const paid = screen.getByRole("checkbox", { name: "Yes, it has been paid" });
    expect(paid).not.toBeChecked();

    await user.type(screen.getByRole("textbox"), "Member moved abroad");
    await user.click(screen.getByRole("button", { name: "Cancel membership" }));

    await waitFor(() => expect(onDone).toHaveBeenCalledWith({ owedLeftUnpaid: true }));
    expect(cancel).toHaveBeenCalledWith(target.id, { reason: "Member moved abroad", owedMoneyPaid: false });
  });

  it("does not offer to collect when staff say the money was paid", async () => {
    const user = userEvent.setup();
    const { onDone, cancel, membership: target } = await open(true);

    await user.click(await screen.findByRole("checkbox", { name: "Yes, it has been paid" }));
    await user.type(screen.getByRole("textbox"), "Paid at the desk");
    await user.click(screen.getByRole("button", { name: "Cancel membership" }));

    await waitFor(() => expect(onDone).toHaveBeenCalledWith({ owedLeftUnpaid: false }));
    expect(cancel).toHaveBeenCalledWith(target.id, { reason: "Paid at the desk", owedMoneyPaid: true });
  });

  it("does not ask when the member owes nothing", async () => {
    const user = userEvent.setup();
    const { onDone, cancel, membership: target } = await open(false);

    expect(await screen.findByRole("heading", { name: "Cancel membership" })).toBeInTheDocument();
    expect(screen.queryByTestId("cancel-owed-question")).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();

    await user.type(screen.getByRole("textbox"), "Member asked to stop");
    await user.click(screen.getByRole("button", { name: "Cancel membership" }));

    await waitFor(() => expect(onDone).toHaveBeenCalledWith({ owedLeftUnpaid: false }));
    expect(cancel).toHaveBeenCalledWith(target.id, { reason: "Member asked to stop" });
  });

  it("still needs a reason before it cancels", async () => {
    const user = userEvent.setup();
    const { onDone, cancel } = await open(true);
    await user.click(await screen.findByRole("button", { name: "Cancel membership" }));
    expect(await screen.findByText("Add a reason")).toBeInTheDocument();
    expect(cancel).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
  });
});

describe("CollectAfterCancelDialog", () => {
  it("names the amount still owed and opens the collect-payment flow", async () => {
    const user = userEvent.setup();
    const onCollect = vi.fn();
    await renderWithApp(<CollectAfterCancelDialog open onOpenChange={() => undefined} memberName="Demo Adam" owed={money(60_000)} canCollect onCollect={onCollect} />);
    const dialog = await screen.findByRole("dialog", { name: "Membership cancelled" });
    expect(dialog).toHaveTextContent(/Demo Adam.* still owes .*JOD 60\.000.*\. Collect it now\?/);
    await user.click(screen.getByRole("button", { name: "Collect payment" }));
    expect(onCollect).toHaveBeenCalledTimes(1);
  });

  it("gives no collect button to someone who cannot take payments", async () => {
    await renderWithApp(<CollectAfterCancelDialog open onOpenChange={() => undefined} memberName="Demo Adam" owed={money(60_000)} canCollect={false} onCollect={() => undefined} />);
    const dialog = await screen.findByRole("dialog", { name: "Membership cancelled" });
    expect(dialog).toHaveTextContent("Ask someone who can take payments to collect it.");
    expect(screen.queryByRole("button", { name: "Collect payment" })).not.toBeInTheDocument();
    // The dialog's corner X is also named "Close"; the footer button is the one this adds.
    expect(screen.getAllByRole("button", { name: "Close" }).length).toBeGreaterThan(0);
  });
});
