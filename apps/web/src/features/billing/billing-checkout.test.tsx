import { useState, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithApp, resetApiForTests } from "@/test/harness";
import type { PlatformBillingInvoice } from "@/lib/api/GymOSApi";
import type { MockGymOSApi } from "@/lib/mock/MockGymOSApi";
import { BillingCheckoutContent } from "./billing-checkout";

const routerMock = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => routerMock, usePathname: () => "/billing", useSearchParams: () => new URLSearchParams(), useParams: () => ({}) }));
vi.mock("@clerk/nextjs", () => ({ useClerk: () => ({ signOut: vi.fn() }), useAuth: () => ({ isLoaded: true, isSignedIn: false }) }));

// Radix radio cards measure themselves; jsdom has no ResizeObserver.
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverMock);

afterEach(() => { resetApiForTests(); vi.clearAllMocks(); });

const FIRST_INVOICE: PlatformBillingInvoice = {
  id: "INV-first",
  gymId: "forge-fitness",
  gym: "Forge Fitness Club",
  amount: "JD 94.500",
  amountMinor: 94_500,
  subtotalMinor: 114_000,
  onboardingFeeMinor: 75_000,
  websiteMinor: 0,
  websiteListMinor: 150_000,
  websiteFree: true,
  promoCode: "LAUNCH50",
  promoTarget: "subscription",
  promoPercentOff: 50,
  discountMinor: 19_500,
  currency: "JOD",
  date: "2026-10-19T08:00:00.000Z",
  issuedAt: "2026-10-19T08:00:00.000Z",
  dueAt: "2026-11-02T08:00:00.000Z",
  periodStart: "2026-10-19T08:00:00.000Z",
  periodEnd: "2026-11-19T08:00:00.000Z",
  billingInterval: "monthly",
  firstPayment: true,
  status: "open",
};

async function withInvoice(api: MockGymOSApi) {
  (api as unknown as { platformInvoices: PlatformBillingInvoice[] }).platformInvoices.unshift({ ...FIRST_INVOICE });
}

/** The demo session reseeds the mock when it loads, so the page mounts after the test adds its data. */
function Deferred({ children }: { children: ReactNode }) {
  const [shown, setShown] = useState(false);
  return shown ? <>{children}</> : <button type="button" onClick={() => setShown(true)}>Show page</button>;
}

async function renderPage(role: "owner" | "manager", prepare?: (api: MockGymOSApi) => Promise<void>) {
  const user = userEvent.setup();
  const result = await renderWithApp(<Deferred><BillingCheckoutContent fullAccess /></Deferred>, { role });
  if (prepare) await prepare(result.api);
  await user.click(screen.getByRole("button", { name: "Show page" }));
  return { ...result, user };
}

describe("the gym's payment page", () => {
  it("shows what the first payment is made of and how to pay it", async () => {
    await renderPage("owner", withInvoice);
    const invoice = await screen.findByRole("complementary", { name: /Invoice INV-first/ });
    expect(within(invoice).getByText("Onboarding fee (one time)")).toBeInTheDocument();
    expect(within(invoice).getByText("Custom website")).toBeInTheDocument();
    expect(within(invoice).getByText("Free (launch offer)")).toBeInTheDocument();
    expect(within(invoice).getByText("Promo code LAUNCH50")).toBeInTheDocument();
    expect(within(invoice).getByText(/94\.500/)).toBeInTheDocument();
    expect(within(invoice).getByText(/Your first month starts on the day we confirm your payment/)).toBeInTheDocument();
    // Preview payment details from the mock: CliQ and bank transfer, each copyable.
    expect(screen.getByText("RIVETDEMO")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy IBAN" })).toBeInTheDocument();
    expect(screen.getByText(/Write INV-first in the payment note/)).toBeInTheDocument();
  });

  it("checks the details, sends them, and then says RIVET is checking", async () => {
    const { api, user } = await renderPage("owner", withInvoice);
    await screen.findByRole("complementary", { name: /Invoice INV-first/ });
    await user.click(screen.getByRole("button", { name: "Send payment details" }));
    expect(await screen.findByText("Choose how you paid.")).toBeInTheDocument();
    expect(screen.getByText("Enter the reference number.")).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "CliQ" }));
    await user.type(screen.getByLabelText(/Reference number/), "CLIQ-778");
    await user.type(screen.getByLabelText(/Name on the paying account/), "Omar Al-Khatib");
    await user.click(screen.getByRole("button", { name: "Send payment details" }));
    expect(await screen.findByText("We are checking your payment")).toBeInTheDocument();
    expect(screen.getByText(/Reference: CLIQ-778/)).toBeInTheDocument();
    const checkout = await api.getBillingCheckout();
    expect(checkout.invoice?.paymentClaim).toMatchObject({ status: "submitted", method: "cliq", reference: "CLIQ-778", payerName: "Omar Al-Khatib" });
  });

  it("shows the reason when RIVET sent the payment back", async () => {
    const { api } = await renderPage("owner", async (mock) => {
      await withInvoice(mock);
      await mock.submitPlatformPayment({ invoiceId: "INV-first", method: "bank_transfer", reference: "TRX-1", payerName: "Omar", paidOn: "2026-10-01" });
      await mock.rejectPlatformInvoicePayment({ invoiceId: "INV-first", reason: "No transfer with this reference arrived." });
    });
    expect(await screen.findByText("We could not match your payment")).toBeInTheDocument();
    expect(screen.getByText(/No transfer with this reference arrived/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send the new details" })).toBeInTheDocument();
    void api;
  });

  it("tells staff only the owner can pay, and says when nothing is due", async () => {
    const staff = await renderPage("manager", withInvoice);
    expect(await screen.findByText("Only the gym owner can pay")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Send payment details" })).not.toBeInTheDocument();
    staff.unmount();
    resetApiForTests();
    await renderPage("owner");
    await waitFor(() => expect(screen.getByText("Nothing to pay right now")).toBeInTheDocument());
  });
});
