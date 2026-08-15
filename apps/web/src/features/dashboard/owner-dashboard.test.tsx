import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { money } from "@/lib/utils/money";
import { OperatingPriorities } from "./owner-dashboard";

describe("owner operating priorities", () => {
  it("surfaces actionable queues instead of the dashboard pipeline funnel", () => {
    render(
      <OperatingPriorities
        loading={false}
        kpis={{
          revenueToday: money(0),
          revenueThisMonth: money(0),
          revenuePrevMonth: money(0),
          outstandingTotal: money(250_000),
          newMembersThisMonth: 4,
          renewalsDueNext7Days: 3,
          expiredUnactioned: 2,
          checkInsToday: 18,
          activeLeads: 9,
          overdueFollowUps: 1,
        }}
      />,
    );

    expect(screen.getByRole("heading", { name: "Move the numbers that matter" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Renewals due next 7 days/ })).toHaveAttribute("href", "/crm/queues");
    expect(screen.getByRole("link", { name: /Outstanding balances/ })).toHaveAttribute("href", "/payments");
    expect(screen.getByRole("link", { name: /Open lead follow-up/ })).toHaveAttribute("href", "/crm/pipeline");
    expect(screen.queryByText("Pipeline funnel")).not.toBeInTheDocument();
  });
});
