import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CustomerFinancialSummary, CustomerTransaction } from "@/lib/domain/qol";
import { money } from "@/lib/utils/money";
import { CustomerFinanceClient } from "./customer-finance.client";

const state = vi.hoisted(() => ({
  searchParams: new URLSearchParams(),
  replace: vi.fn(),
  getCustomerFinancialSummary: vi.fn(),
  listCustomerTransactions: vi.fn(),
  requestMemberPersonalDataExport: vi.fn(),
}));

vi.mock("@/lib/api/client", () => ({
  getApi: () => ({
    getCustomerFinancialSummary: state.getCustomerFinancialSummary,
    listCustomerTransactions: state.listCustomerTransactions,
    requestMemberPersonalDataExport: state.requestMemberPersonalDataExport,
  }),
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => state.searchParams,
  usePathname: () => "/customer/finance",
  useRouter: () => ({ replace: state.replace, push: vi.fn() }),
}));
vi.mock("@/lib/hooks/use-member-gate", () => ({ useMemberGate: () => ({ ready: true, identitySignedIn: true, profileSelected: true }) }));

const summary: CustomerFinancialSummary = {
  outstanding: money(25_000),
  paidLifetime: money(310_000),
  receiptCount: 2,
  lastPaymentAt: "2026-08-01T10:00:00.000Z",
  gyms: [{ id: "forge", name: "Forge Fitness Club" }],
};

const transactions: CustomerTransaction[] = [
  { id: "p1", gymId: "forge", gymName: "Forge Fitness Club", branchName: "Forge — Abdoun", receiptId: "r1", receiptNumber: "RV-001042", type: "payment", status: "completed", amount: money(85_000), method: "cash", occurredAt: "2026-08-01T10:00:00.000Z", explanation: "Payment received by the gym." },
  { id: "p2", gymId: "forge", gymName: "Forge Fitness Club", branchName: "Forge — Abdoun", receiptNumber: "RV-001040", type: "refund", status: "refunded", amount: money(20_000), method: "card", occurredAt: "2026-07-20T10:00:00.000Z", explanation: "This amount was returned and is linked to the original payment." },
];

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><CustomerFinanceClient /></QueryClientProvider>);
}

describe("CustomerFinanceClient", () => {
  beforeEach(() => {
    state.searchParams = new URLSearchParams();
    state.replace.mockReset();
    state.getCustomerFinancialSummary.mockReset().mockResolvedValue(summary);
    state.listCustomerTransactions.mockReset().mockResolvedValue({ items: transactions, page: 1, pageSize: 20, totalItems: 2, totalPages: 1 });
  });

  it("reads totals as one ledger strip and opens each receipt from its whole row", async () => {
    renderPage();
    const totals = await screen.findByRole("region", { name: "Financial summary" });
    expect(totals).toHaveTextContent("Outstanding");
    expect(totals).toHaveTextContent("JOD 25.000");
    expect(totals).toHaveTextContent("Ask the gym about payment options.");
    expect(totals).toHaveTextContent("1 connected gym");

    const rows = await screen.findAllByTestId("member-transaction");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveAttribute("href", "/customer/receipts/r1");
    expect(rows[0]).toHaveTextContent("RV-001042");
    expect(rows[0]).toHaveTextContent("Completed");
    expect(screen.getByText("RV-001040")).toBeInTheDocument();
    expect(screen.getByText("Refund")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /My gyms/ })).not.toBeInTheDocument();
  });

  it("keeps the narrower filters behind one toggle on phones and shows what is active", async () => {
    const user = userEvent.setup();
    state.searchParams = new URLSearchParams("type=payment&from=2026-08-01");
    renderPage();
    await screen.findAllByTestId("member-transaction");
    const toggle = screen.getByRole("button", { name: /Filters/ });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(toggle).toHaveTextContent("2");
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(document.getElementById("finance-filters")).toHaveClass("hidden");
    expect(screen.getByText(/Filtered by/).closest("p")).toHaveTextContent("Payment · From 1 Aug 2026");
  });

  it("explains an empty result and never pretends a failed load is empty", async () => {
    state.listCustomerTransactions.mockResolvedValue({ items: [], page: 1, pageSize: 20, totalItems: 0, totalPages: 0 });
    renderPage();
    expect(await screen.findByRole("heading", { name: "No payments yet" })).toBeInTheDocument();

    state.listCustomerTransactions.mockRejectedValue(new Error("offline"));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><CustomerFinanceClient /></QueryClientProvider>);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Your payments could not be loaded"));
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});
