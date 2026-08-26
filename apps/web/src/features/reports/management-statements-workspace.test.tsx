import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithApp, resetApiForTests } from "@/test/harness";
import { ManagementStatementsWorkspace } from "./management-statements-workspace";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => undefined, replace: () => undefined, back: () => undefined }),
  usePathname: () => "/reports/statements",
  useSearchParams: () => new URLSearchParams(),
}));

afterEach(() => resetApiForTests());

describe("ManagementStatementsWorkspace", () => {
  it("locks the direct route when a live subscription downgrade removes reporting", async () => {
    const { api } = await renderWithApp(<ManagementStatementsWorkspace />);

    expect(await screen.findByTestId("management-statements-workspace")).toBeInTheDocument();
    await act(async () => {
      await api.updatePlatformGym({ gymId: "forge-fitness", plan: "Starter", currentPeriodEndsAt: "2099-12-31T23:59:59.999Z", reason: "Verify direct reporting route entitlement lock." });
    });

    expect(await screen.findByText("Management reporting is not included", { exact: true })).toBeInTheDocument();
    expect(screen.queryByTestId("management-statements-workspace")).not.toBeInTheDocument();
  });

  it("keeps management reporting behind the financial-report permission", async () => {
    await renderWithApp(<ManagementStatementsWorkspace />, { role: "receptionist" });

    expect(await screen.findByText(/limited to roles with financial reporting access/i)).toBeInTheDocument();
    expect(screen.queryByTestId("management-statements-workspace")).not.toBeInTheDocument();
  });

  it("labels auditor access as read-only while keeping statements visible", async () => {
    await renderWithApp(<ManagementStatementsWorkspace />, { role: "auditor" });

    expect(await screen.findByTestId("management-statements-workspace")).toBeInTheDocument();
    expect(screen.getByText("Read-only access")).toBeInTheDocument();
  });

  it("renders exactly three statement views and switches them in place", async () => {
    const { api } = await renderWithApp(<ManagementStatementsWorkspace />);

    expect(await screen.findByTestId("management-statements-workspace")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Management ledger" })).toBeInTheDocument();
    expect(screen.getByRole("tablist", { name: "Management statements" })).toBeInTheDocument();
    expect(screen.getAllByRole("tab")).toHaveLength(3);
    expect(screen.getByRole("tab", { name: /Income statement/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Balance sheet/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Cash flow statement/i })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /GM analysis/i })).not.toBeInTheDocument();
    expect(screen.queryByTestId("gm-analysis")).not.toBeInTheDocument();
    const balanceSpy = vi.spyOn(api, "getBalanceSheet");
    expect(balanceSpy).not.toHaveBeenCalled();

    const user = userEvent.setup();
    expect(await screen.findByTestId("income-statement")).toBeInTheDocument();
    expect(await screen.findByText("Net income")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: /Balance sheet/i }));
    expect(await screen.findByTestId("balance-sheet")).toBeInTheDocument();
    expect(balanceSpy).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Total assets")).toBeInTheDocument();
    expect(screen.getByText(/balance sheet equation/i)).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /Cash flow statement/i }));
    expect(await screen.findByTestId("cashflow-statement")).toBeInTheDocument();
    expect(screen.getByText("Closing cash")).toBeInTheDocument();
    expect(screen.getByText(/cashflow reconciles|cashflow reconciliation needs review/i)).toBeInTheDocument();
    expect(screen.getByText("Unproven")).toBeInTheDocument();
  });

  it("keeps invalid date ranges visible and prevents a statement fetch", async () => {
    const { api } = await renderWithApp(<ManagementStatementsWorkspace />);
    expect(await screen.findByTestId("income-statement")).toBeInTheDocument();
    const incomeSpy = vi.spyOn(api, "getIncomeStatement");

    fireEvent.change(screen.getByLabelText("From date"), { target: { value: "2099-01-02" } });

    expect(await screen.findByRole("alert")).toHaveTextContent("Choose a from date on or before the to date.");
    expect(incomeSpy).not.toHaveBeenCalled();
  });

  it("reloads the active statement when the reporting date changes", async () => {
    const { api } = await renderWithApp(<ManagementStatementsWorkspace />);
    expect(await screen.findByTestId("income-statement")).toBeInTheDocument();
    const incomeSpy = vi.spyOn(api, "getIncomeStatement");
    incomeSpy.mockClear();

    fireEvent.change(screen.getByLabelText("To date"), { target: { value: "2099-01-01" } });

    await waitFor(() => expect(incomeSpy).toHaveBeenCalledWith(expect.objectContaining({ toDate: "2099-01-01" })));
  });

  it("keeps the last successful statement visible when a reload fails", async () => {
    const { api } = await renderWithApp(<ManagementStatementsWorkspace />);
    expect(await screen.findByTestId("income-statement")).toBeInTheDocument();
    vi.spyOn(api, "getIncomeStatement").mockRejectedValueOnce(new Error("Temporary report outage"));

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /^Reload$/i }));

    expect(await screen.findByRole("status", { name: "Stale statement data" })).toBeInTheDocument();
    expect(screen.getByTestId("income-statement")).toBeInTheDocument();
    expect(screen.queryByText(/Temporary report outage/i)).not.toBeInTheDocument();
  });

});
