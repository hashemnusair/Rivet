import { afterEach, describe, expect, it, vi } from "vitest";
import { act, screen } from "@testing-library/react";
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

  it("renders statement metadata, warnings, and the four reporting views", async () => {
    await renderWithApp(<ManagementStatementsWorkspace />);

    expect(await screen.findByTestId("management-statements-workspace")).toBeInTheDocument();
    expect(await screen.findByText("Source status counts")).toBeInTheDocument();
    expect(screen.getAllByText(/management accounting/i).length).toBeGreaterThan(0);
    expect(screen.getByRole("tab", { name: /Income statement/i })).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: /Balance sheet/i }));
    expect(await screen.findByTestId("balance-sheet")).toBeInTheDocument();
    expect(screen.getByText(/balance sheet equation/i)).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /Cashflow/i }));
    expect(await screen.findByTestId("cashflow-statement")).toBeInTheDocument();
    expect(screen.getByText(/cashflow reconciles|cashflow reconciliation needs review/i)).toBeInTheDocument();
    expect(screen.getByText("Unproven")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /GM analysis/i }));
    expect(await screen.findByTestId("gm-analysis")).toBeInTheDocument();
    expect(screen.getAllByText(/Not available|Not configured/).length).toBeGreaterThan(0);
  });

});
