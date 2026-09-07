import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MockGymOSApi } from "@/lib/mock/MockGymOSApi";
import { renderWithApp, resetApiForTests } from "@/test/harness";
import ReceiptPageClient from "./receipt.client";

const routerMock = { push: vi.fn(), replace: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() };

vi.mock("next/navigation", () => ({
  useRouter: () => routerMock,
  useParams: () => ({ receiptId: "unused" }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/payments/receipts/view",
}));

HTMLElement.prototype.scrollIntoView = vi.fn();
HTMLElement.prototype.hasPointerCapture = vi.fn(() => false);

afterEach(() => {
  resetApiForTests();
  vi.clearAllMocks();
});

/** Records a real cash payment on the seeded session so the receipt is a stored fact, not a fixture. */
async function collectOne(api: MockGymOSApi): Promise<string> {
  const withBalance = (await api.listMembers({ membershipStatus: "outstanding", pageSize: 5 })).items.find((m) => m.outstanding.amount > 0)!;
  const charge = withBalance.outstandingCharges?.[0];
  const receipt = await api.createPayment({ memberId: withBalance.id, chargeId: charge?.id, amount: { amount: 5_000, currency: "JOD" }, method: "cash" }, `receipt-test-${Date.now()}`);
  return receipt.receipt.id;
}

/** Sells one priced item for cash at the first branch and voids it with a reason. */
async function sellAndVoid(api: MockGymOSApi): Promise<string> {
  const session = await api.getSession();
  const branchId = session.branches[0]!.id;
  const product = (await api.listProducts()).find((item) => item.retailPrice?.amount && item.retailPrice.amount > 0)!;
  const sale = await api.checkoutRetail({ branchId, lines: [{ productId: product.id, quantity: 1 }], method: "cash", idempotencyKey: `void-test-${Date.now()}` });
  await api.voidRetailSale(sale.retailSale.id, { reason: "Wrong item keyed at the desk", idempotencyKey: `void-key-${Date.now()}` });
  return sale.receipt.id;
}

describe("staff receipt page", () => {
  it("prints stored facts: number, amount at currency precision, method, remaining balance and currency name", async () => {
    let receiptId = "";
    const Show = () => <ReceiptPageClient receiptId={receiptId} />;
    await renderWithApp(<Show />, { prepare: async (api) => { receiptId = await collectOne(api); } });

    const printed = (await screen.findByText(/^R-\d+$/)).closest("#receipt-print")!;
    expect(printed).toHaveTextContent("PAYMENT");
    expect(printed).toHaveTextContent("Paid (Cash)");
    expect(printed).toHaveTextContent("5.000");
    expect(printed).toHaveTextContent("Balance remaining");
    expect(printed).toHaveTextContent("JOD · amounts in Jordanian Dinar");
    expect(printed).not.toHaveTextContent("undefined");
  });

  it("reads the refund amount under the money policy instead of multiplying whatever was typed", async () => {
    const user = userEvent.setup();
    let receiptId = "";
    const Show = () => <ReceiptPageClient receiptId={receiptId} />;
    const { api } = await renderWithApp(<Show />, { role: "owner", prepare: async (probe) => { receiptId = await collectOne(probe); } });
    const refundSpy = vi.spyOn(api, "refundPayment");

    await user.click(await screen.findByTestId("refund-button"));
    const dialog = await screen.findByRole("dialog", { name: "Refund payment" });
    await user.type(within(dialog).getByTestId("refund-reason"), "Duplicate charge confirmed");
    const amount = within(dialog).getByTestId("refund-amount");
    await user.type(amount, "1e3");
    await user.click(within(dialog).getByTestId("confirm-refund"));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(/as a number/i);
    expect(amount).toHaveValue("1e3");
    expect(refundSpy).not.toHaveBeenCalled();

    await user.clear(amount);
    await user.type(amount, "9");
    await user.click(within(dialog).getByTestId("confirm-refund"));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(/cannot exceed the refundable 5.000 JOD/i);
    expect(refundSpy).not.toHaveBeenCalled();

    await user.clear(amount);
    await user.type(amount, "2");
    await user.click(within(dialog).getByTestId("confirm-refund"));
    await waitFor(() => expect(refundSpy).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ amount: { amount: 2_000, currency: "JOD" } })));
  });

  it("prints the stored void status and reason for a retail sale", async () => {
    let receiptId = "";
    const Show = () => <ReceiptPageClient receiptId={receiptId} />;
    await renderWithApp(<Show />, { role: "owner", prepare: async (api) => { receiptId = await sellAndVoid(api); } });

    const printed = (await screen.findByText("RETAIL SALE")).closest("#receipt-print")!;
    expect(printed).toHaveTextContent("VOIDED — Wrong item keyed at the desk");
    expect(screen.getByText("Voided")).toBeInTheDocument();
    expect(screen.queryByTestId("retail-void-button")).not.toBeInTheDocument();
    expect(screen.queryByTestId("retail-refund-button")).not.toBeInTheDocument();
  });
});
