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
    await user.click(screen.getByRole("button", { name: "تصدير السجل المالي" }));
    const saved = state.download.mock.calls[0]?.[0] as { content: string; fileName: string };
    expect(saved.fileName).toBe("rivet-platform-invoices.csv");
    expect(saved.content).toContain("رقم الفاتورة,النادي,نوع الفاتورة");
    expect(saved.content).toContain("متأخر عن السداد");
    expect(saved.content).toContain("149.000,JOD");
    expect(saved.content).toContain("'=Authored Gym");
    expect(saved.content).toContain("2 تشرين الأول 2026");
    expect(saved.content).toContain("REF-1");
  });

  it("opens the billing wizard on the tenant a gym page deep-links with ?bill=", async () => {
    window.history.replaceState({}, "", "/platform/billing?bill=gym-1");
    const enriched = snapshot([]);
    enriched.gyms = [{ ...enriched.gyms[0]!, isProvisioned: true, billingInterval: "monthly", currentPeriodEndsAt: "2026-09-15T10:00:00.000Z" }];
    enriched.plans = [{ name: "Growth", priceMinor: 149_000, branches: 3, staff: 25, members: 2_500, tone: "signal" }] as PlatformSnapshot["plans"];
    state.snapshot = enriched;
    render(<BillingPage />);

    const dialog = await screen.findByRole("dialog", { name: "Bill a gym" });
    expect(within(dialog).getByText(/is currently/)).toHaveTextContent("Northline Strength is currently active on Growth · monthly.");
    // The subscriptions section is the on-page home for the same actions
    // (aria-hidden while the modal wizard is open, hence hidden queries).
    expect(screen.getByRole("heading", { name: "Gym subscriptions", hidden: true })).toBeInTheDocument();
    expect(screen.getByRole("row", { name: /Northline Strength/, hidden: true })).toHaveTextContent("Growth · Monthly");
  });

  it("waits for the requested invoice row before focusing it", async () => {
    window.history.replaceState({}, "", "/platform/billing?invoice=INV-2");
    const view = render(<BillingPage />);

    expect(screen.getByText("Loading the persisted invoice ledger…")).toBeInTheDocument();
    expect(HTMLElement.prototype.scrollIntoView).not.toHaveBeenCalled();

    state.snapshot = snapshot([invoice({ id: "INV-2", gym: "Mosaic Women's Fitness" })]);
    view.rerender(<BillingPage />);

    const row = await screen.findByRole("row", { name: /INV-2/ });
    await waitFor(() => expect(row).toHaveClass("bg-sunken\/60"));
    expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it("preserves Arabic amount and period drafts through a locale change and submits exact minor units", async () => {
    const user = userEvent.setup();
    state.snapshot = snapshot([]);
    render(<LocaleProvider initialLocale="en"><LocaleSwitch /><BillingPage /></LocaleProvider>);
    await user.click(screen.getByRole("button", { name: "Create exception invoice" }));
    await user.selectOptions(screen.getByLabelText("Gym"), "gym-1");
    fireEvent.change(screen.getByLabelText("Amount (JOD)"), { target: { value: "١٤٩٫٠٠١" } });
    fireEvent.change(screen.getByLabelText("Period start"), { target: { value: "2026-10-01" } });
    fireEvent.change(screen.getByLabelText("Period end"), { target: { value: "2026-10-31" } });
    fireEvent.change(screen.getByLabelText("Due date"), { target: { value: "2026-10-15" } });

    fireEvent.click(screen.getByTestId("locale-switch"));

    expect(screen.getByLabelText("المبلغ (د.أ)")).toHaveValue("١٤٩٫٠٠١");
    expect(screen.getByLabelText("بداية الفترة")).toHaveValue("2026-10-01");
    expect(screen.getByLabelText("نهاية الفترة")).toHaveValue("2026-10-31");
    expect(screen.getByLabelText("تاريخ الاستحقاق")).toHaveValue("2026-10-15");
    await user.click(screen.getByRole("button", { name: "إنشاء مسودة" }));

    const created = state.mutations.find((mutation) => mutation.mutate.mock.calls.length > 0);
    expect(created?.mutate).toHaveBeenCalledWith({ gymId: "gym-1", amountMinor: 149_001, currency: "JOD", dueAt: "2026-10-15", periodStart: "2026-10-01", periodEnd: "2026-10-31" });
  });

  it("keeps the payment action identity and typed reference across a locale change", async () => {
    const user = userEvent.setup();
    state.snapshot = snapshot([invoice({ id: "AUTO-GRACE", cycleKey: "subscription:gym-1:monthly:1788264000000", status: "past_due" })]);
    render(<LocaleProvider initialLocale="en"><LocaleSwitch /><BillingPage /></LocaleProvider>);
    const row = screen.getByRole("row", { name: /AUTO-GRACE/ });
    await user.click(within(row).getByRole("button", { name: "Reactivate" }));
    await user.type(screen.getByLabelText("Payment reference"), "حوالة-٧١");
    await user.type(screen.getByLabelText("Reason"), "تأكيد الحوالة البنكية.");

    fireEvent.click(screen.getByTestId("locale-switch"));

    expect(screen.getByLabelText("مرجع الدفعة")).toHaveValue("حوالة-٧١");
    expect(screen.getByLabelText("السبب")).toHaveValue("تأكيد الحوالة البنكية.");
    await user.click(screen.getByRole("button", { name: "إعادة تفعيل النادي" }));
    const payment = state.mutations.find((mutation) => mutation.mutate.mock.calls.length > 0);
    expect(payment?.mutate).toHaveBeenCalledWith({ invoiceId: "AUTO-GRACE", reference: "حوالة-٧١", reason: "تأكيد الحوالة البنكية." });
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

  it.each([
    ["0", "Amount must be greater than zero"],
    ["0.0004", "no more than 3 decimal places"],
    ["1e3", "valid positive decimal amount"],
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

  it("foregrounds automatic renewal states and shows the agreement's own deadlines", async () => {
    state.snapshot = snapshot([
      invoice({ id: "AUTO-OPEN", cycleKey: "subscription:gym-1:monthly:1788264000000", billingInterval: "monthly", issuedAt: "2026-08-29T12:00:00.000Z", dueAt: "2026-09-01T12:00:00.000Z", periodEnd: "2026-10-01T12:00:00.000Z", status: "open" }),
      invoice({ id: "AUTO-GRACE", cycleKey: "subscription:gym-1:monthly:1788264000000:grace", billingInterval: "monthly", issuedAt: "2026-08-29T12:00:00.000Z", dueAt: "2026-09-01T12:00:00.000Z", periodEnd: "2026-10-01T12:00:00.000Z", status: "past_due" }),
      invoice({ id: "AUTO-PAID", cycleKey: "subscription:gym-1:monthly:1785672000000", billingInterval: "monthly", issuedAt: "2026-08-01T12:00:00.000Z", dueAt: "2026-08-04T12:00:00.000Z", periodEnd: "2026-09-04T12:00:00.000Z", status: "paid", paymentReference: "BANK-PAID" }),
    ]);
    render(<BillingPage />);

    expect(screen.getByText("Subscription invoices")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Bill a gym/ })).toBeEnabled();
    expect(screen.getByText("Issued 3 days early, payable within 14")).toBeInTheDocument();
    expect(screen.getByText("Access may close 21 days after the due date")).toBeInTheDocument();
    expect(screen.getByText("In grace / past due")).toBeInTheDocument();
    expect(screen.getAllByText("Automatic renewal", { selector: "span" })).toHaveLength(3);
    expect(screen.getByRole("row", { name: /AUTO-OPEN/ })).toHaveTextContent("Upcoming");
    expect(screen.getByRole("row", { name: /AUTO-GRACE/ })).toHaveTextContent("In grace");
    expect(screen.getByRole("row", { name: /AUTO-GRACE/ })).toHaveTextContent("Grace ends");
    expect(screen.getByRole("row", { name: /AUTO-GRACE/ })).toHaveTextContent("Due + 21 days");
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
