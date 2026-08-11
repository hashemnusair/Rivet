import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DashboardPage from "./page";

const state = vi.hoisted(() => ({ role: "owner" }));

vi.mock("@/lib/providers/app-providers", () => ({ useApp: () => ({ session: { roles: [state.role] } }) }));
vi.mock("@/features/dashboard/owner-dashboard", () => ({ OwnerDashboard: () => <div data-testid="owner-dashboard" /> }));
vi.mock("@/features/dashboard/manager-dashboard", () => ({ ManagerDashboard: () => <div data-testid="manager-dashboard" /> }));
vi.mock("@/features/dashboard/sales-dashboard", () => ({ SalesDashboard: () => <div data-testid="sales-dashboard" /> }));
vi.mock("@/features/dashboard/reception-dashboard", () => ({ ReceptionDashboard: () => <div data-testid="reception-dashboard" /> }));
vi.mock("@/features/dashboard/trainer-dashboard", () => ({ TrainerDashboard: () => <div data-testid="trainer-dashboard" /> }));

describe("role-specific dashboard routing", () => {
  beforeEach(() => { state.role = "owner"; });

  it("routes trainers to their PT operations dashboard", () => {
    state.role = "trainer";
    render(<DashboardPage />);
    expect(screen.getByTestId("trainer-dashboard")).toBeInTheDocument();
    expect(screen.queryByTestId("reception-dashboard")).not.toBeInTheDocument();
  });

  it("keeps receptionists on the reception dashboard", () => {
    state.role = "receptionist";
    render(<DashboardPage />);
    expect(screen.getByTestId("reception-dashboard")).toBeInTheDocument();
    expect(screen.queryByTestId("trainer-dashboard")).not.toBeInTheDocument();
  });
});
