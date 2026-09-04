import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithApp, resetApiForTests } from "@/test/harness";
import { SubscriptionSection } from "./subscription-section";

const routerMock = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => routerMock, usePathname: () => "/settings", useSearchParams: () => new URLSearchParams(), useParams: () => ({}) }));

afterEach(() => { resetApiForTests(); vi.unstubAllGlobals(); });

describe("subscription and invoices", () => {
  it("lists the gym's own RIVET invoices and opens one as the PDF that was emailed", async () => {
    const user = userEvent.setup();
    const opened: Array<{ url: string; type?: string }> = [];
    vi.stubGlobal("URL", { ...URL, createObjectURL: (blob: Blob) => { opened.push({ url: "blob:invoice", type: blob.type }); return "blob:invoice"; }, revokeObjectURL: () => {} });
    const open = vi.fn(() => ({}) as Window);
    vi.stubGlobal("open", open);

    await renderWithApp(<SubscriptionSection />, { role: "owner" });
    const rows = await screen.findAllByTestId("subscription-invoice-row");
    expect(rows).toHaveLength(1);
    expect(within(rows[0]!).getByText("RV-1046")).toBeInTheDocument();
    expect(within(rows[0]!).getByText("Paid")).toBeInTheDocument();
    await user.click(within(rows[0]!).getByRole("button", { name: "View invoice RV-1046" }));
    expect(opened).toEqual([{ url: "blob:invoice", type: "application/pdf" }]);
    expect(open).toHaveBeenCalledWith("blob:invoice", "_blank", "noopener");
  });

  it("states the plan, the cadence, the fee and the day the paid term ends", async () => {
    await renderWithApp(<SubscriptionSection />, { role: "owner" });
    const summary = await screen.findByTestId("subscription-summary");
    expect(within(summary).getByText("Plan")).toBeInTheDocument();
    expect(within(summary).getByText(/per (month|year), excluding any applicable tax/)).toBeInTheDocument();
    expect(within(summary).getByText(/Monthly|Yearly, paid once a year/)).toBeInTheDocument();
    expect(within(summary).getByText(/Paid through|Trial ends/)).toBeInTheDocument();
    // The change rule is stated where the owner can read it.
    expect(within(summary).getByText(/unused days of this one are credited/)).toBeInTheDocument();
  });
});
