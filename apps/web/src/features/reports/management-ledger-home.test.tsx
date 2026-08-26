import { afterEach, describe, expect, it, vi } from "vitest";
import { act, screen } from "@testing-library/react";
import { renderWithApp, resetApiForTests } from "@/test/harness";
import { ManagementLedgerHome } from "./management-ledger-home";

const mockSearchParams = { value: new URLSearchParams() };

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => undefined, replace: () => undefined, back: () => undefined }),
  useSearchParams: () => mockSearchParams.value,
}));

afterEach(() => {
  resetApiForTests();
  mockSearchParams.value = new URLSearchParams();
});

describe("ManagementLedgerHome", () => {
  it("keeps the ledger home focused on exactly three statement destinations", async () => {
    await renderWithApp(<ManagementLedgerHome />);

    expect(await screen.findByTestId("management-ledger-home")).toBeInTheDocument();
    const cards = screen.getAllByTestId(/^statement-card-/);
    expect(cards).toHaveLength(3);
    expect(cards.map((card) => card.getAttribute("href"))).toEqual([
      "/finance/income-statement",
      "/finance/balance-sheet",
      "/finance/cash-flow",
    ]);
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /payments|shifts|cash reports|reports/i })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ledger controls" })).toHaveAttribute("href", "/finance/controls");
  });

  it("normalizes and preserves statement scope on every destination", async () => {
    mockSearchParams.value = new URLSearchParams("fromDate=2026-08-01&toDate=2026-08-20&branchId=branch-sweifieh&unrelated=ignored");

    await renderWithApp(<ManagementLedgerHome />);

    expect(await screen.findByTestId("management-ledger-home")).toBeInTheDocument();
    expect(screen.getByTestId("statement-card-income")).toHaveAttribute("href", "/finance/income-statement?from=2026-08-01&to=2026-08-20&branchId=branch-sweifieh");
    expect(screen.getByTestId("statement-card-balance")).toHaveAttribute("href", "/finance/balance-sheet?from=2026-08-01&to=2026-08-20&branchId=branch-sweifieh");
    expect(screen.getByTestId("statement-card-cashflow")).toHaveAttribute("href", "/finance/cash-flow?from=2026-08-01&to=2026-08-20&branchId=branch-sweifieh");
  });

  it("does not show statement destinations when reporting is not entitled", async () => {
    const { api } = await renderWithApp(<ManagementLedgerHome />);
    await act(async () => {
      await api.updatePlatformGym({
        gymId: "forge-fitness",
        plan: "Starter",
        currentPeriodEndsAt: "2099-12-31T23:59:59.999Z",
        reason: "Verify management ledger entitlement gate.",
      });
    });

    expect(await screen.findByText("Management reporting is not included", { exact: true })).toBeInTheDocument();
    expect(screen.queryAllByTestId(/^statement-card-/)).toHaveLength(0);
  });
});
