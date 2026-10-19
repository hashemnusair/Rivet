import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithApp, resetApiForTests } from "@/test/harness";
import type { PlatformBillingInvoice } from "@/lib/api/GymOSApi";
import { PaymentConfirmations } from "./payment-confirmations";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), usePathname: () => "/platform/billing", useSearchParams: () => new URLSearchParams(), useParams: () => ({}) }));
afterEach(() => resetApiForTests());

const CLAIMED: PlatformBillingInvoice = {
  id: "INV-claim",
  gymId: "forge-fitness",
  gym: "Forge Fitness Club",
  amount: "JOD 114.000",
  amountMinor: 114_000,
  subtotalMinor: 114_000,
  onboardingFeeMinor: 75_000,
  currency: "JOD",
  date: "2026-10-19T08:00:00.000Z",
  dueAt: "2026-11-02T08:00:00.000Z",
  periodStart: "2026-10-19T08:00:00.000Z",
  periodEnd: "2026-11-19T08:00:00.000Z",
  billingInterval: "monthly",
  firstPayment: true,
  status: "open",
  paymentClaim: { status: "submitted", method: "cliq", reference: "CLIQ-778", payerName: "Omar Al-Khatib", paidOn: "2026-10-18", amountMinor: 114_000, submittedAt: "2026-10-18T10:00:00.000Z" },
};

describe("payments to confirm", () => {
  it("lists what the gym sent and confirms it against the same reference", async () => {
    const user = userEvent.setup();
    const onUpdated = vi.fn();
    const { api } = await renderWithApp(<PaymentConfirmations invoices={[CLAIMED]} onUpdated={onUpdated} />);
    (api as unknown as { platformInvoices: PlatformBillingInvoice[] }).platformInvoices.unshift(structuredClone(CLAIMED));
    const queue = screen.getByTestId("payments-to-confirm");
    expect(within(queue).getByText("CLIQ-778")).toBeInTheDocument();
    expect(within(queue).getByText("First payment")).toBeInTheDocument();
    await user.click(within(queue).getByRole("button", { name: "Confirm payment" }));
    const dialog = await screen.findByRole("dialog", { name: "Confirm payment from Forge Fitness Club" });
    expect(within(dialog).getByRole("textbox")).toHaveValue("Checked CliQ payment, reference CLIQ-778.");
    await user.click(within(dialog).getByRole("button", { name: "Confirm payment" }));
    await vi.waitFor(() => expect(onUpdated).toHaveBeenCalledWith(expect.objectContaining({ id: "INV-claim", status: "paid", paymentReference: "CLIQ-778", paymentClaim: expect.objectContaining({ status: "confirmed" }) })));
  });

  it("sends a payment back with a message for the gym", async () => {
    const user = userEvent.setup();
    const onUpdated = vi.fn();
    const { api } = await renderWithApp(<PaymentConfirmations invoices={[CLAIMED]} onUpdated={onUpdated} />);
    (api as unknown as { platformInvoices: PlatformBillingInvoice[] }).platformInvoices.unshift(structuredClone(CLAIMED));
    await user.click(screen.getByRole("button", { name: "Send back" }));
    const dialog = await screen.findByRole("dialog", { name: "Send the payment back to Forge Fitness Club" });
    expect(within(dialog).getByRole("button", { name: "Send back" })).toBeDisabled();
    await user.type(within(dialog).getByRole("textbox"), "No CliQ transfer with this reference.");
    await user.click(within(dialog).getByRole("button", { name: "Send back" }));
    await vi.waitFor(() => expect(onUpdated).toHaveBeenCalledWith(expect.objectContaining({ paymentClaim: expect.objectContaining({ status: "rejected", rejectionReason: "No CliQ transfer with this reference." }) })));
  });

  it("says when nothing is waiting", async () => {
    await renderWithApp(<PaymentConfirmations invoices={[{ ...CLAIMED, paymentClaim: undefined }]} onUpdated={vi.fn()} />);
    expect(screen.getByText("No payments waiting.")).toBeInTheDocument();
  });
});
