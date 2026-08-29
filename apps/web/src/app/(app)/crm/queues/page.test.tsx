import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { qk } from "@/lib/api/keys";
import QueuesPage from "./page";

const state = vi.hoisted(() => ({
  queryKey: undefined as unknown,
  refetch: vi.fn(),
  result: {
    data: {
      items: [{
        member: { id: "member-1", fullName: "Renewal Member", phone: "+962790000001" },
        membership: {
          id: "membership-1",
          status: "active",
          planName: "Monthly",
          endDate: "2026-08-28",
          outstanding: { amount: 0, currency: "JOD" },
        },
        daysUntilExpiry: 14,
      }],
      totalItems: 1,
    },
    isLoading: false,
    isError: false,
  },
}));

vi.mock("@/lib/providers/app-providers", () => ({
  useApp: () => ({ session: { activeBranchId: "branch-1" } }),
}));

vi.mock("@/lib/hooks/use-api", () => ({
  useApiQuery: () => ({ data: { modules: [{ key: "revenue", entitled: true, enabled: true }] }, isLoading: false, error: undefined, refetch: vi.fn() }),
}));

vi.mock("@/lib/hooks/use-realtime-api", () => ({
  useRealtimeApiQuery: (options: { queryKey: unknown }) => {
    state.queryKey = options.queryKey;
    return { ...state.result, refetch: state.refetch };
  },
}));

vi.mock("@/features/crm/contact-work-panel", () => ({
  LogContactDialog: () => <button type="button" data-testid="log-contact-dialog">Log contact</button>,
}));

vi.mock("@/features/crm/whatsapp-handoff", () => ({
  WhatsAppHandoff: () => <button type="button" data-testid="whatsapp-handoff">WhatsApp</button>,
}));

describe("follow-up workspace layout", () => {
  beforeEach(() => {
    state.queryKey = undefined;
    state.refetch.mockReset();
  });

  it("places vertical filters beside the found matches workspace", () => {
    render(<QueuesPage />);

    expect(screen.getByRole("complementary", { name: "Follow-up filters" })).toBeInTheDocument();
    expect(screen.getByTestId("follow-up-results")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Found matches" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Follow-up membership status" })).toHaveClass("grid");
    expect(screen.getByRole("button", { name: "Expiring" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Expired" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("Renewal Member")).toBeInTheDocument();
  });

  it("changes the renewal query when the filter rail switches buckets", async () => {
    const user = userEvent.setup();
    render(<QueuesPage />);

    await user.click(screen.getByRole("button", { name: "Expired" }));

    expect(state.queryKey).toEqual(qk.renewalQueue({
      bucket: "expired",
      branchId: "branch-1",
      days: 45,
      fromDate: undefined,
      toDate: undefined,
      pageSize: 100,
    }));
    expect(screen.getByRole("button", { name: "Expired" })).toHaveAttribute("aria-pressed", "true");
  });

  it("exposes the selected member row as a pressed control", async () => {
    const user = userEvent.setup();
    render(<QueuesPage />);

    const row = screen.getByRole("button", { name: /Renewal Member/ });
    expect(row).toHaveAttribute("aria-pressed", "false");
    await user.click(row);
    expect(row).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("follow-up-panel")).toBeInTheDocument();
    expect(screen.getByTestId("log-contact-dialog")).toBeInTheDocument();
  });
});
