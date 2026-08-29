import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { TodayQueueData } from "@/lib/domain/types";
import { money } from "@/lib/utils/money";
import { renderWithApp, resetApiForTests } from "@/test/harness";
import { TodayQueue } from "./today-queue";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/dashboard",
  useSearchParams: () => new URLSearchParams(),
}));

const queue: TodayQueueData = {
  generatedAt: "2026-08-29T08:00:00.000Z",
  totalItems: 3,
  urgentItems: 1,
  highPriorityItems: 1,
  kindCounts: { outstanding_balance: 1, follow_up: 1, approval: 1 },
  items: [
    {
      id: "balance:member-1",
      kind: "outstanding_balance",
      priority: "urgent",
      title: "Collect from Ahmad Khalil",
      detail: "Membership balance is overdue",
      href: "/members/member-1?action=collect",
      action: { kind: "navigate", label: "Collect" },
      amount: money(45_000),
      dueAt: "2026-08-28T08:00:00.000Z",
    },
    {
      id: "task:task-1",
      kind: "follow_up",
      priority: "high",
      title: "Call Dana about trial",
      detail: "Trial follow-up",
      href: "/crm/leads/lead-1",
      action: { kind: "complete_task", label: "Done", taskId: "task-1" },
      dueAt: "2026-08-29T09:00:00.000Z",
    },
    {
      id: "approval:approval-1",
      kind: "approval",
      priority: "normal",
      title: "Review discount request",
      detail: "Requested by Reception",
      href: "/approvals",
      action: { kind: "navigate", label: "Review" },
    },
  ],
};

describe("Today queue", () => {
  beforeEach(() => resetApiForTests());

  it("makes the highest-priority item unmistakable and keeps actions direct", async () => {
    await renderWithApp(<TodayQueue data={queue} initialVisible={2} />);

    expect(screen.getByRole("heading", { name: "Today" })).toBeInTheDocument();
    expect(screen.getByText("Do this next")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Collect: Collect from Ahmad Khalil" })).toHaveAttribute(
      "href",
      "/members/member-1?action=collect",
    );
    expect(screen.getByRole("button", { name: "Complete Call Dana about trial" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show 1 more" })).toBeInTheDocument();
  });

  it("reveals the rest of the queue without navigating away", async () => {
    const user = userEvent.setup();
    await renderWithApp(<TodayQueue data={queue} initialVisible={2} />);

    expect(screen.queryByRole("link", { name: "Review: Review discount request" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show 1 more" }));
    expect(screen.getByRole("link", { name: "Review: Review discount request" })).toHaveAttribute("href", "/approvals");
    expect(screen.getByRole("button", { name: "Show less" })).toBeInTheDocument();
  });

  it("shows a calm, useful empty state", async () => {
    await renderWithApp(
      <TodayQueue
        data={{ generatedAt: queue.generatedAt, items: [], totalItems: 0, urgentItems: 0, highPriorityItems: 0, kindCounts: {} }}
      />,
    );

    expect(screen.getByText("You're clear for now")).toBeInTheDocument();
    expect(screen.getByText(/appear here automatically/)).toBeInTheDocument();
  });
});
