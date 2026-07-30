import { screen, waitFor } from "@testing-library/react";
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
    expect(onOpenChange).toHaveBeenCalledWith(false);
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
