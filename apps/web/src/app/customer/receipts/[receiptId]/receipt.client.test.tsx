import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, ERR } from "@/lib/api/errors";
import type { CustomerReceipt } from "@/lib/domain/qol";
import { formatMoney, money } from "@/lib/utils/money";
import CustomerReceiptClient, { receiptTextLines } from "./receipt.client";

const state = vi.hoisted(() => ({ getCustomerReceipt: vi.fn() }));

vi.mock("@/lib/api/client", () => ({ getApi: () => ({ getCustomerReceipt: state.getCustomerReceipt }) }));

const receipt = {
  gymId: "forge",
  receipt: { id: "r1", receiptNumber: "RV-001042", issuedAt: "2026-09-03T13:42:00.000Z" },
  organization: { name: "Forge Fitness Club", receiptFooter: "Thank you for training with us.", taxRatePercent: 0 },
  branch: { name: "Forge — Abdoun", code: "ABD", address: "Salah Al-Suheimat St 12, Abdoun", phone: "+962 6 555 0100" },
  member: { fullName: "Lina Haddad", memberNumber: "ABD-2214" },
  payment: { id: "p1", type: "payment", amount: money(85_000), method: "cash", status: "completed", receiptId: "r1", receiptNumber: "RV-001042", collectedByName: "Hala Qasem", occurredAt: "2026-09-03T13:42:00.000Z" },
  charge: { description: "6-Month All Access", outstandingAmount: money(15_000) },
  relatedPayments: [],
} as unknown as CustomerReceipt;

function renderReceipt() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><CustomerReceiptClient receiptId="r1" /></QueryClientProvider>);
}

describe("CustomerReceiptClient", () => {
  beforeEach(() => {
    state.getCustomerReceipt.mockReset();
  });

  it("renders the record inside the printable region with human labels and the receipt number in mono", async () => {
    state.getCustomerReceipt.mockResolvedValue(receipt);
    renderReceipt();
    const article = await screen.findByRole("article", { name: "RV-001042" });
    expect(article).toHaveAttribute("id", "receipt-print");
    expect(screen.getByRole("heading", { name: "RV-001042" })).toHaveClass("font-mono");
    expect(article).toHaveTextContent("Forge Fitness Club");
    expect(article).toHaveTextContent("Lina Haddad");
    expect(article).toHaveTextContent("ABD-2214");
    expect(article).toHaveTextContent("6-Month All Access");
    expect(article).toHaveTextContent("Balance remaining");
    expect(article).toHaveTextContent("JOD 15.000");
    expect(article).toHaveTextContent("Recorded by");
    expect(screen.getByRole("link", { name: /Payments/ })).toHaveAttribute("href", "/customer/finance");
    expect(screen.getByRole("button", { name: /Print/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Download/ })).toBeInTheDocument();
  });

  it("produces a readable plain-text copy", () => {
    const lines = receiptTextLines(receipt);
    expect(lines).toContain("Receipt number: RV-001042");
    expect(lines).toContain("Customer: Lina Haddad");
    expect(lines).toContain("Member number: ABD-2214");
    expect(lines).toContain(`Total: ${formatMoney(money(85_000))}`);
    expect(lines).toContain(`Balance remaining: ${formatMoney(money(15_000))}`);
    expect(lines).toContain("Payment method: Cash");
    expect(lines.at(-1)).toBe("Thank you for training with us.");
  });

  it("keeps a missing receipt inside the member area instead of the staff dashboard", async () => {
    state.getCustomerReceipt.mockRejectedValue(ApiError.of(ERR.NOT_FOUND, "Receipt not found."));
    renderReceipt();
    expect(await screen.findByRole("heading", { name: "Receipt not found" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to payments" })).toHaveAttribute("href", "/customer/finance");
    expect(screen.queryByRole("link", { name: /dashboard/i })).not.toBeInTheDocument();
  });
});
