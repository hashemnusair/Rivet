import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppProviders } from "@/lib/providers/app-providers";
import { renderWithApp, resetApiForTests } from "@/test/harness";
import { MockGymOSApi } from "@/lib/mock/MockGymOSApi";
import { ManagementStatementPage } from "./management-statements-workspace";

const routerMock = { push: vi.fn(), replace: vi.fn(), back: vi.fn() };
const searchParamsMock = vi.hoisted(() => ({ value: new URLSearchParams() }));

vi.mock("next/navigation", () => ({
  useRouter: () => routerMock,
  usePathname: () => "/finance/income-statement",
  useSearchParams: () => searchParamsMock.value,
}));

afterEach(() => {
  resetApiForTests();
  vi.restoreAllMocks();
  routerMock.push.mockClear();
  routerMock.replace.mockClear();
  routerMock.back.mockClear();
  searchParamsMock.value = new URLSearchParams();
});

describe("ManagementStatementPage", () => {
  it("renders the real income statement without the payments navigation", async () => {
    const incomeSpy = vi.spyOn(MockGymOSApi.prototype, "getIncomeStatement");
    const { api } = await renderWithApp(<ManagementStatementPage kind="income" />);

    expect(await screen.findByTestId("management-statements-workspace")).toBeInTheDocument();
    expect(await screen.findByTestId("income-statement")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Income statement" })).toBeInTheDocument();
    expect(screen.getByText("Net income")).toBeInTheDocument();
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Finance views" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /All statements/i })).toHaveAttribute("href", expect.stringContaining("/finance?"));
    const balanceSpy = vi.spyOn(api, "getBalanceSheet");
    const cashflowSpy = vi.spyOn(api, "getCashflowStatement");
    await waitFor(() => expect(incomeSpy).toHaveBeenCalledTimes(1));
    expect(balanceSpy).not.toHaveBeenCalled();
    expect(cashflowSpy).not.toHaveBeenCalled();
  });

  it.each([
    ["balance", "Balance sheet", "balance-sheet"],
    ["cashflow", "Cash flow statement", "cashflow-statement"],
  ] as const)("fetches only the %s backend projection", async (kind, title, testId) => {
    const incomeSpy = vi.spyOn(MockGymOSApi.prototype, "getIncomeStatement");
    const balanceSpy = vi.spyOn(MockGymOSApi.prototype, "getBalanceSheet");
    const cashflowSpy = vi.spyOn(MockGymOSApi.prototype, "getCashflowStatement");
    await renderWithApp(<ManagementStatementPage kind={kind} />, { latencyMs: 100 });

    expect(await screen.findByTestId(testId)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    await waitFor(() => expect(kind === "balance" ? balanceSpy : cashflowSpy).toHaveBeenCalledTimes(1));
    if (kind !== "balance") expect(balanceSpy).not.toHaveBeenCalled();
    if (kind !== "cashflow") expect(cashflowSpy).not.toHaveBeenCalled();
    expect(incomeSpy).not.toHaveBeenCalled();
  });

  it("passes date and branch scope to the active statement and preserves it in links", async () => {
    const { api } = await renderWithApp(<ManagementStatementPage kind="income" />);
    expect(await screen.findByTestId("income-statement")).toBeInTheDocument();
    const incomeSpy = vi.spyOn(api, "getIncomeStatement");
    incomeSpy.mockClear();

    fireEvent.change(screen.getByLabelText("From date"), { target: { value: "2026-08-01" } });
    fireEvent.change(screen.getByLabelText("To date"), { target: { value: "2026-08-20" } });

    await waitFor(() => expect(incomeSpy).toHaveBeenCalledWith(expect.objectContaining({ fromDate: "2026-08-01", toDate: "2026-08-20" })));
    expect(screen.getByRole("link", { name: /All statements/i })).toHaveAttribute("href", expect.stringContaining("from=2026-08-01"));
    expect(routerMock.replace).toHaveBeenCalled();
  });

  it("keeps invalid date ranges visible and prevents a statement fetch", async () => {
    const { api } = await renderWithApp(<ManagementStatementPage kind="income" />);
    expect(await screen.findByTestId("income-statement")).toBeInTheDocument();
    const incomeSpy = vi.spyOn(api, "getIncomeStatement");
    incomeSpy.mockClear();

    fireEvent.change(screen.getByLabelText("From date"), { target: { value: "2099-01-02" } });

    expect(await screen.findByRole("alert")).toHaveTextContent("Choose a from date on or before the to date.");
    expect(screen.getByRole("button", { name: /^Reload$/i })).toBeDisabled();
    await userEvent.setup().click(screen.getByRole("button", { name: /^Reload$/i }));
    expect(incomeSpy).not.toHaveBeenCalled();
  });

  it("does not send an arbitrary URL branch to the statement API", async () => {
    searchParamsMock.value = new URLSearchParams("from=2026-08-01&to=2026-08-20&branchId=not-a-session-branch");
    const incomeSpy = vi.spyOn(MockGymOSApi.prototype, "getIncomeStatement");
    await renderWithApp(<ManagementStatementPage kind="income" />);

    expect(await screen.findByTestId("income-statement")).toBeInTheDocument();
    await waitFor(() => expect(incomeSpy).toHaveBeenCalled());
    expect(incomeSpy.mock.calls.every(([input]) => input.branchId === undefined)).toBe(true);
    expect(screen.getAllByText("All accessible branches").length).toBeGreaterThan(0);
    await waitFor(() => expect(routerMock.replace).toHaveBeenCalledWith(expect.not.stringContaining("not-a-session-branch"), { scroll: false }));
  });

  it("syncs its controls when the external URL scope changes", async () => {
    const rendered = await renderWithApp(<ManagementStatementPage kind="income" />);
    expect(await screen.findByTestId("income-statement")).toBeInTheDocument();
    const session = await rendered.api.getSession();
    const branchId = session.branches[0]?.id;
    expect(branchId).toBeTruthy();

    searchParamsMock.value = new URLSearchParams(`from=2026-08-01&to=2026-08-20&branchId=${branchId}`);
    await act(async () => {
      rendered.rerender(
        <AppProviders>
          <ManagementStatementPage kind="income" />
        </AppProviders>,
      );
    });

    await waitFor(() => {
      expect(screen.getByLabelText("From date")).toHaveValue("2026-08-01");
      expect(screen.getByLabelText("To date")).toHaveValue("2026-08-20");
    });
    expect(screen.getAllByText(session.branches[0]?.name ?? "").length).toBeGreaterThan(0);
  });

  it("keeps the last successful statement visible when a reload fails", async () => {
    const { api } = await renderWithApp(<ManagementStatementPage kind="income" />);
    expect(await screen.findByTestId("income-statement")).toBeInTheDocument();
    vi.spyOn(api, "getIncomeStatement").mockRejectedValueOnce(new Error("Temporary report outage"));

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /^Reload$/i }));

    expect(await screen.findByRole("status", { name: "Stale statement data" })).toBeInTheDocument();
    expect(screen.getByTestId("income-statement")).toBeInTheDocument();
    expect(screen.queryByText(/Temporary report outage/i)).not.toBeInTheDocument();
  });

  it("locks the direct route when a live subscription downgrade removes reporting", async () => {
    const { api } = await renderWithApp(<ManagementStatementPage kind="income" />);

    expect(await screen.findByTestId("income-statement")).toBeInTheDocument();
    await act(async () => {
      await api.updatePlatformGym({ gymId: "forge-fitness", plan: "Starter", currentPeriodEndsAt: "2099-12-31T23:59:59.999Z", reason: "Verify direct reporting route entitlement lock." });
    });

    expect(await screen.findByText("Management reporting is not included", { exact: true })).toBeInTheDocument();
    expect(screen.queryByTestId("management-statements-workspace")).not.toBeInTheDocument();
  });

  it("keeps management reporting behind the financial-report permission", async () => {
    await renderWithApp(<ManagementStatementPage kind="income" />, { role: "receptionist" });

    expect(await screen.findByText(/limited to roles with financial reporting access/i)).toBeInTheDocument();
    expect(screen.queryByTestId("management-statements-workspace")).not.toBeInTheDocument();
  });

  it("links ledger controls only for owner and manager roles", async () => {
    await renderWithApp(<ManagementStatementPage kind="income" />);
    expect(await screen.findByTestId("income-statement")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ledger controls" })).toHaveAttribute("href", "/finance/controls");

    cleanup();
    resetApiForTests();
    await renderWithApp(<ManagementStatementPage kind="income" />, { role: "auditor" });
    expect(await screen.findByTestId("income-statement")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Ledger controls" })).not.toBeInTheDocument();
    expect(screen.getByText("Read-only access")).toBeInTheDocument();
  });
});
