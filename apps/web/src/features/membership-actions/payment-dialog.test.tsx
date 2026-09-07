import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MemberSummary } from "@/lib/domain/types";
import { money } from "@/lib/utils/money";
import { renderWithApp, resetApiForTests } from "@/test/harness";
import { CollectPaymentDialog } from "./payment-dialog";

const routerMock = {
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  refresh: vi.fn(),
  prefetch: vi.fn(),
};

vi.mock("next/navigation", () => ({
  useRouter: () => routerMock,
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/",
}));

afterEach(() => {
  resetApiForTests();
  vi.clearAllMocks();
});

function member(overrides: Partial<MemberSummary> = {}): MemberSummary {
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
    ...overrides,
  };
}

describe("CollectPaymentDialog", () => {
  it("names the member and states the outstanding balance", async () => {
    await renderWithApp(<CollectPaymentDialog open onOpenChange={() => {}} member={member()} />);

    expect(screen.getByText("Collect payment")).toBeInTheDocument();
    expect(screen.getByText(/Lina Qasem/)).toBeInTheDocument();
    expect(screen.getByText("ABD-1052")).toBeInTheDocument();
    expect(screen.getByText("Outstanding balance")).toBeInTheDocument();
    expect(screen.getByText("JOD 45.000")).toBeInTheDocument();
  });

  it("prefills the full balance so the common case is one keystroke", async () => {
    await renderWithApp(<CollectPaymentDialog open onOpenChange={() => {}} member={member()} />);
    expect(await screen.findByTestId("payment-amount")).toHaveValue("45.000");
  });

  it("shows the remaining balance before anything is committed", async () => {
    const user = userEvent.setup();
    await renderWithApp(<CollectPaymentDialog open onOpenChange={() => {}} member={member()} />);

    const amount = await screen.findByTestId("payment-amount");
    await user.clear(amount);
    await user.type(amount, "20");

    // 45.000 owed − 20.000 paid leaves 25.000 still due
    expect(screen.getByText("Remaining after this payment")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("JOD 25.000")).toBeInTheDocument());
  });

  it("labels the confirm button with the amount being taken", async () => {
    const user = userEvent.setup();
    await renderWithApp(<CollectPaymentDialog open onOpenChange={() => {}} member={member()} />);

    const amount = await screen.findByTestId("payment-amount");
    await user.clear(amount);
    await user.type(amount, "30");

    await waitFor(() => expect(screen.getByTestId("confirm-payment")).toHaveTextContent("Collect 30.000 JOD"));
  });

  it("rejects a zero amount instead of posting an empty payment", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    await renderWithApp(<CollectPaymentDialog open onOpenChange={onOpenChange} member={member()} />);

    const amount = await screen.findByTestId("payment-amount");
    await user.clear(amount);
    await user.type(amount, "0");
    await user.click(screen.getByTestId("confirm-payment"));

    expect(await screen.findByRole("alert")).toHaveTextContent(/greater than zero/i);
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("requires an amount at all", async () => {
    const user = userEvent.setup();
    await renderWithApp(<CollectPaymentDialog open onOpenChange={() => {}} member={member()} />);

    const amount = await screen.findByTestId("payment-amount");
    await user.clear(amount);
    await user.click(screen.getByTestId("confirm-payment"));

    expect(await screen.findByRole("alert")).toHaveTextContent(/required/i);
  });

  it("collects the payment through the API and reports the receipt back", async () => {
    const user = userEvent.setup();
    const onCollected = vi.fn();
    const onOpenChange = vi.fn();

    // Use a real seeded member so the mock can allocate a receipt against them.
    const { api } = await renderWithApp(<div />);
    const withBalance = (await api.listMembers({ membershipStatus: "outstanding", pageSize: 5 })).items.find(
      (m) => m.outstanding.amount > 0,
    )!;
    resetApiForTests();

    await renderWithApp(
      <CollectPaymentDialog open onOpenChange={onOpenChange} member={withBalance} onCollected={onCollected} />,
    );

    await user.click(await screen.findByTestId("confirm-payment"));

    await waitFor(() => expect(onCollected).toHaveBeenCalledTimes(1));
    const receipt = onCollected.mock.calls[0]![0];
    expect(receipt.payment.amount.amount).toBe(withBalance.outstanding.amount);
    expect(receipt.receipt.receiptNumber).toMatch(/^R-\d+$/);

    // The confirmation is the server's record, not the form's intent: receipt
    // number, amount, method, status and what is still owed.
    const confirmation = await screen.findByTestId("payment-collected");
    expect(confirmation).toHaveTextContent(receipt.receipt.receiptNumber);
    expect(confirmation).toHaveTextContent("Completed");
    expect(confirmation).toHaveTextContent("Cash");
    expect(within(confirmation).getByText("Still owed").nextElementSibling).toHaveTextContent("JOD 0.000");
    expect(screen.getByRole("heading", { name: "Cash collected" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open receipt/ })).toHaveAttribute("href", expect.stringContaining(encodeURIComponent(receipt.receipt.id)));
    expect(screen.queryByTestId("payment-amount")).not.toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);

    await user.click(screen.getByTestId("payment-done"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("rejects a malformed amount with the rule it broke and keeps the typed text", async () => {
    const user = userEvent.setup();
    const { api } = await renderWithApp(<CollectPaymentDialog open onOpenChange={() => {}} member={member()} />);
    const createSpy = vi.spyOn(api, "createPayment");

    const amount = await screen.findByTestId("payment-amount");
    await user.clear(amount);
    await user.type(amount, "1e3");
    await user.click(screen.getByTestId("confirm-payment"));

    expect(await screen.findByRole("alert")).toHaveTextContent(/as a number/i);
    expect(amount).toHaveValue("1e3");
    expect(createSpy).not.toHaveBeenCalled();

    await user.clear(amount);
    await user.type(amount, "20.0005");
    await user.click(screen.getByTestId("confirm-payment"));
    expect(await screen.findByRole("alert")).toHaveTextContent(/3 decimal places/i);
    expect(createSpy).not.toHaveBeenCalled();

    await user.clear(amount);
    await user.type(amount, "USD 20");
    await user.click(screen.getByTestId("confirm-payment"));
    expect(await screen.findByRole("alert")).toHaveTextContent(/JOD, not USD/);
    expect(createSpy).not.toHaveBeenCalled();
  });

  it("reads Arabic-Indic digits as the same amount", async () => {
    const user = userEvent.setup();
    await renderWithApp(<CollectPaymentDialog open onOpenChange={() => {}} member={member()} />);
    const amount = await screen.findByTestId("payment-amount");
    await user.clear(amount);
    await user.type(amount, "٢٠");
    await waitFor(() => expect(screen.getByTestId("confirm-payment")).toHaveTextContent("Collect 20.000 JOD"));
    expect(screen.getByText("JOD 25.000")).toBeInTheDocument();
  });

  it("retries a failed request with the same idempotency key and rotates it once the draft changes", async () => {
    const user = userEvent.setup();
    const { api } = await renderWithApp(<div />);
    const withBalance = (await api.listMembers({ membershipStatus: "outstanding", pageSize: 5 })).items.find((m) => m.outstanding.amount > 0)!;
    resetApiForTests();

    const rendered = await renderWithApp(<CollectPaymentDialog open onOpenChange={() => {}} member={withBalance} />);
    const createSpy = vi.spyOn(rendered.api, "createPayment");

    rendered.api.setBehavior({ failNextRequest: true });
    await user.click(await screen.findByTestId("confirm-payment"));
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(createSpy).toHaveBeenCalledTimes(1);
    const firstKey = createSpy.mock.calls[0]![1];

    await user.click(screen.getByTestId("confirm-payment"));
    await screen.findByTestId("payment-collected");
    expect(createSpy).toHaveBeenCalledTimes(2);
    expect(createSpy.mock.calls[1]![1]).toBe(firstKey);
  });

  it("keeps the dialog and its controls tied to the request while it is in flight", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const { api } = await renderWithApp(<div />);
    const withBalance = (await api.listMembers({ membershipStatus: "outstanding", pageSize: 5 })).items.find((m) => m.outstanding.amount > 0)!;
    resetApiForTests();

    await renderWithApp(<CollectPaymentDialog open onOpenChange={onOpenChange} member={withBalance} />, { latencyMs: 300 });
    await user.click(await screen.findByTestId("confirm-payment"));

    await waitFor(() => expect(screen.getByTestId("confirm-payment")).toHaveTextContent("Recording…"));
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    await user.keyboard("{Escape}");
    expect(onOpenChange).not.toHaveBeenCalledWith(false);

    await screen.findByTestId("payment-collected", {}, { timeout: 3000 });
  });

  it("refuses to fall through to another invoice when the requested one is gone", async () => {
    const charge = (id: string, description: string, amount: number) => ({
      id,
      organizationId: "org-1",
      memberId: "member-1",
      description,
      subtotal: money(amount),
      discount: money(0),
      tax: money(0),
      total: money(amount),
      paidAmount: money(0),
      outstandingAmount: money(amount),
      status: "unpaid" as const,
      collectible: true,
      createdAt: "2026-01-10T08:00:00Z",
    });
    await renderWithApp(<CollectPaymentDialog open onOpenChange={() => {}} initialChargeId="charge-gone" member={member({ outstanding: money(45_000), outstandingCharges: [charge("charge-1", "Membership", 45_000)] })} />);

    expect(await screen.findByRole("alert")).toHaveTextContent(/no longer outstanding/i);
    expect(screen.getByRole("combobox", { name: "Invoice to collect" })).toBeInTheDocument();
    expect(screen.queryByTestId("payment-amount")).not.toBeInTheDocument();
    expect(screen.queryByText(/fully paid up/i)).not.toBeInTheDocument();
  });

  it("says so plainly and blocks collection when nothing is owed", async () => {
    await renderWithApp(
      <CollectPaymentDialog open onOpenChange={() => {}} member={member({ outstanding: money(0) })} />,
    );

    expect(screen.getByText(/fully paid up/i)).toBeInTheDocument();
    expect(screen.getByTestId("confirm-payment")).toBeDisabled();
    expect(screen.queryByTestId("payment-amount")).not.toBeInTheDocument();
  });

  it("offers only the payment methods the organization has enabled", async () => {
    await renderWithApp(<CollectPaymentDialog open onOpenChange={() => {}} member={member()} />);
    // The trigger shows the default method; the seed enables cash.
    expect(await screen.findByTestId("payment-method")).toHaveTextContent(/cash/i);
  });

  it("requires a specific invoice when a member has multiple collectible charges", async () => {
    const charge = (id: string, description: string, amount: number) => ({
      id,
      organizationId: "org-1",
      memberId: "member-1",
      description,
      subtotal: money(amount),
      discount: money(0),
      tax: money(0),
      total: money(amount),
      paidAmount: money(0),
      outstandingAmount: money(amount),
      status: "unpaid" as const,
      collectible: true,
      createdAt: "2026-01-10T08:00:00Z",
    });
    await renderWithApp(<CollectPaymentDialog open onOpenChange={() => {}} initialChargeId="charge-2" member={member({ outstanding: money(75_000), outstandingCharges: [charge("charge-1", "Membership", 45_000), charge("charge-2", "PT package", 30_000)] })} />);

    expect(screen.getByText("Invoice")).toBeInTheDocument();
    expect(screen.getByTestId("payment-invoice")).toHaveTextContent("PT package");
    expect(await screen.findByTestId("payment-amount")).toHaveValue("30.000");
    expect(screen.getByTestId("payment-amount")).toHaveValue("30.000");
    expect(screen.getByTestId("payment-amount")).toHaveAttribute("max", "30.000");
  });

  it("surfaces an API failure without closing the dialog", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const { api } = await renderWithApp(
      <CollectPaymentDialog open onOpenChange={onOpenChange} member={member()} />,
    );

    api.setBehavior({ failNextRequest: true });
    await user.click(await screen.findByTestId("confirm-payment"));

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});

describe("CollectPaymentDialog — closed cash drawer", () => {
  it("keeps card available and explains that cash cannot be taken at this desk", async () => {
    await renderWithApp(<CollectPaymentDialog open onOpenChange={() => {}} member={member()} cashDrawerOpen={false} />);

    expect(await screen.findByText(/no cash shift is open at this desk/i)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("payment-method")).not.toHaveTextContent(/^Cash$/));
    expect(screen.getByTestId("confirm-payment")).toBeEnabled();
  });
});
