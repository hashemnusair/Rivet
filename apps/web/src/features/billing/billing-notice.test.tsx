import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { BillingNotice } from "@/lib/domain/types";
import { LocaleProvider } from "@/lib/i18n/provider";
import { BillingNoticeBanner } from "./billing-notice";

const state = vi.hoisted(() => ({ notice: undefined as BillingNotice | undefined, role: "owner", permissions: [] as string[] }));
vi.mock("@/lib/providers/app-providers", () => ({
  useApp: () => ({ session: { roles: [state.role], permissions: state.permissions, organization: { subscription: { status: "active", billingInterval: "monthly", billingNotice: state.notice } } } }),
}));

afterEach(() => {
  state.notice = undefined;
  state.role = "owner";
  window.sessionStorage.clear();
});

const LAST_DAY: BillingNotice = { state: "last_day", periodEndsAt: "2026-11-01T21:00:00.000Z", invoiceId: "INV-77", amountMinor: 39_000, currency: "JOD", accessEndsAt: "2026-11-22T21:00:00.000Z" };

describe("the workspace billing warning", () => {
  it("says nothing in a normal month", () => {
    render(<LocaleProvider initialLocale="en"><BillingNoticeBanner /></LocaleProvider>);
    expect(screen.queryByTestId("billing-notice")).not.toBeInTheDocument();
  });

  it("warns the owner on the last day, once as a prompt, and leads to the payment page", async () => {
    const user = userEvent.setup();
    state.notice = LAST_DAY;
    const { unmount } = render(<LocaleProvider initialLocale="en"><BillingNoticeBanner /></LocaleProvider>);
    const dialog = await screen.findByRole("dialog", { name: "Your RIVET subscription ends today" });
    expect(dialog).toHaveTextContent(/Pay invoice INV-77 \(JOD 39\.000\) today so your team keeps access/);
    await user.click(screen.getByRole("button", { name: "Later" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const banner = screen.getByTestId("billing-notice");
    expect(banner).toHaveAttribute("data-state", "last_day");
    expect(screen.getByRole("link", { name: "Pay now" })).toHaveAttribute("href", "/billing");
    unmount();
    // Dismissed today: the banner stays, the prompt does not come back.
    render(<LocaleProvider initialLocale="en"><BillingNoticeBanner /></LocaleProvider>);
    expect(screen.getByTestId("billing-notice")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("tells staff to ask the owner, says when access stops, and calms down once the payment is sent", () => {
    state.role = "receptionist";
    state.notice = { ...LAST_DAY, state: "overdue" };
    const { rerender } = render(<LocaleProvider initialLocale="en"><BillingNoticeBanner /></LocaleProvider>);
    expect(screen.getByRole("alert")).toHaveTextContent(/If it stays unpaid, access stops on 23 Nov 2026/);
    expect(screen.getByText("Ask your gym owner to pay.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Pay now" })).not.toBeInTheDocument();
    state.notice = { ...LAST_DAY, state: "payment_sent" };
    rerender(<LocaleProvider initialLocale="en"><BillingNoticeBanner /></LocaleProvider>);
    expect(screen.getByRole("status")).toHaveTextContent("We are checking your payment for invoice INV-77.");
  });
});
