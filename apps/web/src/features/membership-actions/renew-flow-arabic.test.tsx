import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MemberSummary, MembershipSummary } from "@/lib/domain/types";
import { LocaleProvider } from "@/lib/i18n/provider";
import { money } from "@/lib/utils/money";
import { renderWithApp, resetApiForTests } from "@/test/harness";
import ReceiptPageClient from "@/app/(app)/payments/receipts/[receiptId]/receipt.client";
import { FreezeDialog, CancelMembershipDialog, ChangeMembershipPlanDialog } from "./adjustment-dialogs";
import { CollectPaymentDialog } from "./payment-dialog";
import { MembershipSaleDialog } from "./sale-dialog";

const routerMock = { push: vi.fn(), replace: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() };

vi.mock("next/navigation", () => ({
  useRouter: () => routerMock,
  useParams: () => ({ receiptId: "unused" }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/",
}));

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal("ResizeObserver", ResizeObserverMock);
HTMLElement.prototype.scrollIntoView = vi.fn();
HTMLElement.prototype.hasPointerCapture = vi.fn(() => false);

afterEach(() => {
  resetApiForTests();
  vi.clearAllMocks();
});

const LRI = "⁦";
const PDI = "⁩";

function member(): MemberSummary {
  return {
    id: "member-1",
    memberNumber: "ABD-1052",
    fullName: "Lina Qasem",
    phone: "+962 79 512 8841",
    homeBranchId: "branch-1",
    status: "active",
    tags: [],
    outstanding: money(45_000),
    createdAt: "2026-01-10T08:00:00Z",
  };
}

describe("renew flow in Arabic", () => {
  it("collects a payment with Arabic wording and an isolated, left-to-right amount on the button", async () => {
    const user = userEvent.setup();
    await renderWithApp(
      <LocaleProvider initialLocale="ar">
        <CollectPaymentDialog open onOpenChange={() => {}} member={member()} />
      </LocaleProvider>,
    );

    expect(screen.getByRole("heading", { name: "تحصيل دفعة" })).toBeInTheDocument();
    expect(screen.getByText("غير مدفوع")).toBeInTheDocument();
    expect(screen.getByText("المتبقي بعد هذه الدفعة")).toBeInTheDocument();

    const amount = await screen.findByTestId("payment-amount");
    await user.clear(amount);
    await user.type(amount, "30");
    await waitFor(() => expect(screen.getByTestId("confirm-payment")).toHaveTextContent(`تحصيل ${LRI}JOD 30.000${PDI}`));
  });

  it("prints the receipt in Arabic with the receipt number kept left-to-right", async () => {
    let receiptId = "";
    const Show = () => (
      <LocaleProvider initialLocale="ar">
        <ReceiptPageClient receiptId={receiptId} />
      </LocaleProvider>
    );
    await renderWithApp(<Show />, {
      prepare: async (api) => {
        const withBalance = (await api.listMembers({ membershipStatus: "outstanding", pageSize: 5 })).items.find((m) => m.outstanding.amount > 0)!;
        const charge = withBalance.outstandingCharges?.[0];
        const receipt = await api.createPayment({ memberId: withBalance.id, chargeId: charge?.id, amount: { amount: 5_000, currency: "JOD" }, method: "cash" }, `ar-receipt-${Date.now()}`);
        receiptId = receipt.receipt.id;
      },
    });

    const number = await screen.findByText(/^R-\d+$/);
    expect(number).toHaveAttribute("dir", "ltr");
    const printed = number.closest("#receipt-print")!;
    expect(printed).toHaveTextContent("دفعة");
    expect(printed).toHaveTextContent("المدفوع (نقدًا)");
    expect(printed).toHaveTextContent("5.000");
    expect(printed).toHaveTextContent(/JOD.*المبالغ بعملة/);
    expect(printed).not.toHaveTextContent("Paid");
    expect(screen.getByRole("button", { name: "طباعة" })).toBeInTheDocument();
  });

  it("renders the sale and adjustment dialogs in Arabic without falling back to English keys", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { api } = await renderWithApp(<div />);
    const membership = (await api.listMemberships({ pageSize: 5 })).items[0] as MembershipSummary;
    resetApiForTests();
    await renderWithApp(
      <LocaleProvider initialLocale="ar">
        <MembershipSaleDialog open onOpenChange={() => {}} member={member()} />
        <FreezeDialog open onOpenChange={() => {}} membership={membership} allowanceRemaining={3} />
        <CancelMembershipDialog open onOpenChange={() => {}} membership={membership} />
        <ChangeMembershipPlanDialog open onOpenChange={() => {}} membership={membership} allowImmediate />
      </LocaleProvider>,
    );

    // Stacked modals hide each other from the accessibility tree, so match hidden headings too.
    const hidden = { hidden: true } as const;
    expect(await screen.findByRole("heading", { name: "بيع عضوية", ...hidden })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "تجميد العضوية", ...hidden })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "إلغاء العضوية", ...hidden })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "تغيير باقة العضوية", ...hidden })).toBeInTheDocument();
    expect(screen.getByText((_, element) => element?.tagName === "P" && /تتبقى 3 أيام تجميد/.test(element.textContent ?? ""))).toBeInTheDocument();
    expect(warn.mock.calls.filter(([message]) => String(message).startsWith("[i18n]"))).toEqual([]);
    warn.mockRestore();
  });
});
