import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PlatformBillingInvoice, PlatformSnapshot } from "@/lib/api/GymOSApi";
import BillingPage from "./page";

const state = vi.hoisted(() => ({
  snapshot: undefined as PlatformSnapshot | undefined,
  mutations: [] as Array<{ isPending: boolean; mutate: ReturnType<typeof vi.fn> }>,
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

vi.mock("@/lib/providers/experience-provider", () => ({
  useExperience: () => ({ platformSnapshot: state.snapshot }),
}));

vi.mock("@/lib/hooks/use-api", () => ({
  useApiMutation: () => {
    const mutation = { isPending: false, mutate: vi.fn() };
    state.mutations.push(mutation);
    return mutation;
  },
}));

function invoice(overrides: Partial<PlatformBillingInvoice> = {}): PlatformBillingInvoice {
  return {
    id: "INV-1",
    gymId: "gym-1",
    gym: "Northline Strength",
    amount: "149.000 JOD",
    amountMinor: 149_000,
    currency: "JOD",
    date: "2026-08-20T08:00:00.000Z",
    status: "open",
    ...overrides,
  };
}

function snapshot(invoices: PlatformBillingInvoice[]): PlatformSnapshot {
  return {
    gyms: [{ id: "gym-1", name: "Northline Strength", shortName: "NS", tagline: "", description: "", city: "Amman", areas: [], category: "", audience: "", memberCount: 0, branchCount: 1, fromPriceMinor: 0, amenities: [], accent: "#111111", featured: false, subscriptionStatus: "active", rivetPlan: "Growth", joinedAt: "", lastActiveAt: "", monthlyRevenueMinor: 0, isPublic: true, branches: [] }],
    bookings: [],
    invoices,
    supportCases: [],
    plans: [],
    applications: [],
    auditEvents: [],
    overview: {
      gymCounts: { trial: 0, active: 1, past_due: 0, suspended: 0, cancelled: 0 },
      branchCount: 1,
      memberCount: 0,
      activeStaffCount: 0,
      activeMrr: { amount: 149_000, currency: "JOD" },
      invoiceTotals: {
        collected: { amount: 0, currency: "JOD" },
        outstanding: { amount: 149_000, currency: "JOD" },
        overdue: { amount: 0, currency: "JOD" },
      },
      billingCurrencyMismatches: 0,
      trialRequests: 0,
      trialConversions: 0,
      pendingApplications: 0,
      provisioningFailures: 0,
      pastDueAccounts: 0,
      trialsExpiringSoon: 0,
      openSupportCases: 0,
      urgentSupportCases: 0,
      billingHistory: [],
      operatorQueue: [],
    },
  };
}

describe("BillingPage", () => {
  beforeEach(() => {
    state.snapshot = undefined;
    state.mutations = [];
    window.history.replaceState({}, "", "/platform/billing");
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
  });

  it("waits for the requested invoice row before focusing it", async () => {
    window.history.replaceState({}, "", "/platform/billing?invoice=INV-2");
    const view = render(<BillingPage />);

    expect(screen.getByText("Loading the persisted invoice ledger…")).toBeInTheDocument();
    expect(HTMLElement.prototype.scrollIntoView).not.toHaveBeenCalled();

    state.snapshot = snapshot([invoice({ id: "INV-2", gym: "Mosaic Women's Fitness" })]);
    view.rerender(<BillingPage />);

    const row = await screen.findByRole("row", { name: /INV-2/ });
    await waitFor(() => expect(row).toHaveClass("bg-info-bg\/50"));
    expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it("follows a same-route invoice query change", async () => {
    state.snapshot = snapshot([invoice(), invoice({ id: "INV-2", gym: "Mosaic Women's Fitness" })]);
    window.history.replaceState({}, "", "/platform/billing?invoice=INV-1");
    const view = render(<BillingPage />);
    expect(await screen.findByRole("row", { name: /INV-1/ })).toHaveClass("bg-info-bg\/50");

    window.history.replaceState({}, "", "/platform/billing?invoice=INV-2");
    view.rerender(<BillingPage />);
    await waitFor(() => expect(screen.getByRole("row", { name: /INV-2/ })).toHaveClass("bg-info-bg\/50"));
  });

  it.each([
    ["0", "Amount must be greater than zero"],
    ["0.0004", "Amount must be greater than zero"],
    ["1e3", "scientific notation"],
    ["9007199254740.992", "too large"],
  ])("rejects unsafe invoice amount %s", async (value, message) => {
    const user = userEvent.setup();
    state.snapshot = snapshot([]);
    render(<BillingPage />);
    await user.click(screen.getByRole("button", { name: "Create exception invoice" }));
    const amount = screen.getByRole("textbox", { name: "Amount (JOD)" });
    await user.type(amount, value);
    expect(screen.getByRole("alert")).toHaveTextContent(message);
    expect(screen.getByRole("button", { name: "Create draft" })).toBeDisabled();
  });

  it("foregrounds automatic renewal states and shows the two-day grace deadline", async () => {
    state.snapshot = snapshot([
      invoice({ id: "AUTO-OPEN", cycleKey: "subscription:gym-1:monthly:1788264000000", billingInterval: "monthly", issuedAt: "2026-08-29T12:00:00.000Z", dueAt: "2026-09-01T12:00:00.000Z", periodEnd: "2026-10-01T12:00:00.000Z", status: "open" }),
      invoice({ id: "AUTO-GRACE", cycleKey: "subscription:gym-1:monthly:1788264000000:grace", billingInterval: "monthly", issuedAt: "2026-08-29T12:00:00.000Z", dueAt: "2026-09-01T12:00:00.000Z", periodEnd: "2026-10-01T12:00:00.000Z", status: "past_due" }),
      invoice({ id: "AUTO-PAID", cycleKey: "subscription:gym-1:monthly:1785672000000", billingInterval: "monthly", issuedAt: "2026-08-01T12:00:00.000Z", dueAt: "2026-08-04T12:00:00.000Z", periodEnd: "2026-09-04T12:00:00.000Z", status: "paid", paymentReference: "BANK-PAID" }),
    ]);
    render(<BillingPage />);

    expect(screen.getByText("Subscription invoices")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Bill a gym/ })).toBeEnabled();
    expect(screen.getByText("Issued T−3 and due at term end")).toBeInTheDocument();
    expect(screen.getByText("In grace / past due")).toBeInTheDocument();
    expect(screen.getAllByText("Automatic renewal", { selector: "span" })).toHaveLength(3);
    expect(screen.getByRole("row", { name: /AUTO-OPEN/ })).toHaveTextContent("Upcoming");
    expect(screen.getByRole("row", { name: /AUTO-GRACE/ })).toHaveTextContent("In grace");
    expect(screen.getByRole("row", { name: /AUTO-GRACE/ })).toHaveTextContent("Grace ends");
    expect(screen.getByRole("row", { name: /AUTO-PAID/ })).toHaveTextContent("Paid");
    expect(screen.queryByText("Manual invoices")).not.toBeInTheDocument();
  });

  it("offers bank/reference payment reactivation during the automated grace period", async () => {
    const user = userEvent.setup();
    state.snapshot = snapshot([invoice({ id: "AUTO-GRACE", cycleKey: "subscription:gym-1:monthly:1788264000000", billingInterval: "monthly", dueAt: "2026-09-01T12:00:00.000Z", periodEnd: "2026-10-01T12:00:00.000Z", status: "past_due" })]);
    render(<BillingPage />);

    const row = screen.getByRole("row", { name: /AUTO-GRACE/ });
    await user.click(within(row).getByRole("button", { name: "Reactivate" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Record bank payment & reactivate");
    expect(screen.getByRole("dialog")).toHaveTextContent("RIVET does not charge a provider");
    await user.type(screen.getByRole("textbox", { name: "Payment reference" }), "BANK-GRACE-1");
    await user.type(screen.getByRole("textbox", { name: "Reason" }), "Bank transfer verified.");
    await user.click(screen.getByRole("button", { name: "Reactivate gym" }));

    const paymentMutation = state.mutations.find((mutation) => mutation.mutate.mock.calls.length > 0);
    expect(paymentMutation?.mutate).toHaveBeenCalledWith({ invoiceId: "AUTO-GRACE", reference: "BANK-GRACE-1", reason: "Bank transfer verified." });
  });
});
