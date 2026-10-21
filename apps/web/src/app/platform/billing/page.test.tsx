import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PlatformBillingInvoice, PlatformSnapshot } from "@/lib/api/GymOSApi";
import { LocaleProvider, useLocale } from "@/lib/i18n/provider";
import BillingPage from "./page";

const state = vi.hoisted(() => ({
  snapshot: undefined as PlatformSnapshot | undefined,
  download: vi.fn(),
  mutations: [] as Array<{ isPending: boolean; mutate: ReturnType<typeof vi.fn> }>,
}));

vi.mock("@/lib/exports/download", () => ({ downloadTextFile: state.download }));
// The page renders without a query client here; the PDF reads RIVET's payment details through one.
vi.mock("@/features/billing/invoice-pdf", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/features/billing/invoice-pdf")>()), usePaymentDetailsLoader: () => async () => undefined }));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

vi.mock("@/lib/providers/experience-provider", () => ({
  useExperience: () => ({ platformSnapshot: state.snapshot }),
}));

vi.mock("@/lib/hooks/use-api", () => ({
  // The payment details panel reads the console's commerce view; these tests leave it loading.
  useApiQuery: () => ({ data: undefined, isLoading: true, isError: false, refetch: vi.fn() }),
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
      gymCounts: { trial: 0, pending_payment: 0, active: 1, past_due: 0, suspended: 0, cancelled: 0 },
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

function LocaleSwitch() {
  const { locale, setLocale } = useLocale();
  return <button type="button" data-testid="locale-switch" onClick={() => setLocale(locale === "en" ? "ar" : "en")}>toggle-locale</button>;
}

describe("BillingPage", () => {
  beforeEach(() => {
    state.snapshot = undefined;
    state.mutations = [];
    state.download.mockReset();
    window.history.replaceState({}, "", "/platform/billing");
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
  });

  it("downloads Arabic invoice headings, status and dates with exact numeric amounts", async () => {
    const user = userEvent.setup();
    state.snapshot = snapshot([invoice({ gym: "=Authored Gym", status: "past_due", billingInterval: "monthly", periodStart: "2026-10-01T21:00:00Z", periodEnd: "2026-11-01T21:00:00Z", paymentReference: "REF-1" })]);
    render(<LocaleProvider initialLocale="ar"><BillingPage /></LocaleProvider>);
    await user.click(screen.getByRole("button", { name: "تحميل الفواتير" }));
    const saved = state.download.mock.calls[0]?.[0] as { content: string; fileName: string };
    expect(saved.fileName).toBe("rivet-platform-invoices.csv");
    expect(saved.content).toContain("رقم الفاتورة,النادي,نوع الفاتورة");
    expect(saved.content).toContain("متأخر عن السداد");
    expect(saved.content).toContain("149.000,JOD");
    expect(saved.content).toContain("'=Authored Gym");
    expect(saved.content).toContain("2 تشرين الأول 2026");
    expect(saved.content).toContain("REF-1");
  });

  it("shows unpaid invoices first, sums what is owed and paid this month, and filters on request", async () => {
    const user = userEvent.setup();
    const paidAt = new Date().toISOString();
    state.snapshot = snapshot([
      invoice({ id: "INV-OPEN", status: "open", dueAt: "2026-11-01T08:00:00.000Z" }),
      invoice({ id: "INV-PAID", status: "paid", amountMinor: 89_000, paidAt }),
      invoice({ id: "INV-VOID", status: "void" }),
    ]);
    render(<BillingPage />);
    const totals = screen.getByRole("region", { name: "Billing totals" });
    expect(totals).toHaveTextContent("JOD 149.000");
    expect(totals).toHaveTextContent("JOD 89.000");
    const invoices = screen.getByRole("table");
    expect(within(invoices).getByRole("row", { name: /INV-OPEN/ })).toHaveTextContent("Due 1 Nov 2026");
    expect(within(invoices).queryByRole("row", { name: /INV-PAID/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Paid" }));
    expect(screen.getByRole("row", { name: /INV-PAID/ })).toBeInTheDocument();
    expect(screen.queryByRole("row", { name: /INV-OPEN/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "All" }));
    expect(screen.getAllByRole("row", { name: /INV-/ })).toHaveLength(3);
  });

  it("says what each invoice is for", () => {
    state.snapshot = snapshot([
      invoice({ id: "INV-FIRST", firstPayment: true }),
      invoice({ id: "INV-UP", planChange: { from: "Starter", to: "Growth" } }),
      invoice({ id: "INV-RENEW", cycleKey: "subscription:gym-1:monthly:1" }),
      invoice({ id: "INV-OTHER" }),
    ]);
    render(<BillingPage />);
    expect(screen.getByRole("row", { name: /INV-FIRST/ })).toHaveTextContent("First payment");
    expect(screen.getByRole("row", { name: /INV-UP/ })).toHaveTextContent("Upgrade to Growth");
    expect(screen.getByRole("row", { name: /INV-RENEW/ })).toHaveTextContent("Renewal");
    expect(screen.getByRole("row", { name: /INV-OTHER/ })).toHaveTextContent("Other");
  });

  it("shows one gym's invoices when a gym page links here, with a way back to all", async () => {
    const user = userEvent.setup();
    window.history.replaceState({}, "", "/platform/billing?gym=gym-1");
    state.snapshot = snapshot([invoice({ id: "INV-A" }), invoice({ id: "INV-B", gymId: "gym-2", gym: "Mosaic Women's Fitness" })]);
    render(<BillingPage />);
    expect(screen.getByText("Invoices for Northline Strength")).toBeInTheDocument();
    expect(screen.getByRole("row", { name: /INV-A/ })).toBeInTheDocument();
    expect(screen.queryByRole("row", { name: /INV-B/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "All gyms" }));
    expect(screen.getByRole("row", { name: /INV-B/ })).toBeInTheDocument();
    // There is no plan wizard any more: gyms change their own plan.
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("waits for the requested invoice row before focusing it", async () => {
    window.history.replaceState({}, "", "/platform/billing?invoice=INV-2");
    const view = render(<BillingPage />);

    expect(screen.getByText("Loading invoices")).toBeInTheDocument();
    expect(HTMLElement.prototype.scrollIntoView).not.toHaveBeenCalled();

    state.snapshot = snapshot([invoice({ id: "INV-2", gym: "Mosaic Women's Fitness", status: "paid" })]);
    view.rerender(<BillingPage />);

    const row = await screen.findByRole("row", { name: /INV-2/ });
    await waitFor(() => expect(row).toHaveClass("bg-sunken\/60"));
    expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it("follows a same-route invoice query change", async () => {
    state.snapshot = snapshot([invoice(), invoice({ id: "INV-2", gym: "Mosaic Women's Fitness" })]);
    window.history.replaceState({}, "", "/platform/billing?invoice=INV-1");
    const view = render(<BillingPage />);
    expect(await screen.findByRole("row", { name: /INV-1/ })).toHaveClass("bg-sunken\/60");

    window.history.replaceState({}, "", "/platform/billing?invoice=INV-2");
    view.rerender(<BillingPage />);
    await waitFor(() => expect(screen.getByRole("row", { name: /INV-2/ })).toHaveClass("bg-sunken\/60"));
  });

  it("marks an invoice paid with a reference and a note, kept across a locale change", async () => {
    const user = userEvent.setup();
    state.snapshot = snapshot([invoice({ id: "INV-LATE", status: "past_due" })]);
    render(<LocaleProvider initialLocale="en"><LocaleSwitch /><BillingPage /></LocaleProvider>);
    await user.click(screen.getByRole("button", { name: "More actions for invoice INV-LATE" }));
    await user.click(await screen.findByRole("menuitem", { name: "Mark paid" }));
    await user.type(screen.getByLabelText(/Payment reference/), "حوالة-٧١");
    await user.type(screen.getByLabelText(/Note for the record/), "تأكيد الحوالة البنكية.");

    fireEvent.click(screen.getByTestId("locale-switch"));

    expect(screen.getByLabelText(/رقم مرجع الدفعة/)).toHaveValue("حوالة-٧١");
    expect(screen.getByLabelText(/ملاحظة للسجل/)).toHaveValue("تأكيد الحوالة البنكية.");
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "تسجيل كمدفوعة" }));
    const payment = state.mutations.find((mutation) => mutation.mutate.mock.calls.length > 0);
    expect(payment?.mutate).toHaveBeenCalledWith({ invoiceId: "INV-LATE", reference: "حوالة-٧١", reason: "تأكيد الحوالة البنكية." });
  });

  it("does not offer Mark paid while payment details a gym sent are waiting", async () => {
    const user = userEvent.setup();
    state.snapshot = snapshot([invoice({ id: "INV-SENT", paymentClaim: { status: "submitted", method: "cliq", reference: "CLIQ-1", payerName: "Owner", paidOn: "2026-10-19", amountMinor: 149_000, submittedAt: "2026-10-19T08:00:00.000Z" } })]);
    render(<BillingPage />);
    const row = screen.getByRole("row", { name: /INV-SENT/ });
    expect(row).toHaveTextContent("To confirm");
    await user.click(within(row).getByRole("button", { name: "More actions for invoice INV-SENT" }));
    expect(await screen.findByRole("menuitem", { name: "Void invoice" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Mark paid" })).not.toBeInTheDocument();
  });
});
