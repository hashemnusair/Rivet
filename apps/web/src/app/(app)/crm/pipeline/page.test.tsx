import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LeadSummary } from "@/lib/domain/types";
import { qk } from "@/lib/api/keys";
import PipelinePage from "./page";

const state = vi.hoisted(() => ({
  queryKey: undefined as unknown,
  mutation: undefined as ReturnType<typeof vi.fn> | undefined,
}));

const lead = {
  id: "lead-1",
  organizationId: "org-1",
  branchId: "branch-1",
  branchName: "Main branch",
  fullName: "Pipeline Lead",
  phone: "+962790000001",
  stage: "new",
  source: "walk_in",
  expectedValue: { amount: 40_000, currency: "JOD" },
  createdAt: "2026-08-14T08:00:00.000Z",
  updatedAt: "2026-08-14T08:00:00.000Z",
  overdue: false,
} as unknown as LeadSummary;

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/lib/providers/app-providers", () => ({
  useApp: () => ({ session: { activeBranchId: "branch-1" } }),
}));

vi.mock("@/lib/hooks/use-debounced", () => ({
  useDebouncedValue: <T,>(value: T) => value,
}));

vi.mock("@/lib/hooks/use-api", () => ({
  useApiQuery: () => ({ data: { modules: [{ key: "revenue", entitled: true, enabled: true }] }, isLoading: false, error: undefined, refetch: vi.fn() }),
  useApiMutation: () => {
    state.mutation = vi.fn();
    return { mutate: state.mutation, isPending: false };
  },
  useInvalidate: () => vi.fn(async () => undefined),
}));

vi.mock("@/lib/hooks/use-realtime-api", () => ({
  useRealtimeApiQuery: (options: { queryKey: unknown }) => {
    state.queryKey = options.queryKey;
    return { data: { items: [lead] }, isLoading: false, isError: false, refetch: vi.fn() };
  },
}));

vi.mock("@/features/crm/new-lead-dialog", () => ({
  NewLeadDialog: () => null,
}));

describe("CRM pipeline semantics", () => {
  beforeEach(() => {
    state.queryKey = undefined;
    state.mutation = undefined;
    vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  });

  it("keys the active-stage query with the actual lead query and renders cards as links", async () => {
    render(<PipelinePage />);

    expect(state.queryKey).toEqual(qk.leads({
      branchId: "branch-1",
      search: undefined,
      pageSize: 100,
      sort: "nextFollowUpAt",
      stage: ["new", "attempted", "contacted", "trial_booked", "trial_completed", "offer_sent", "won", "lost"],
    }));
    expect(screen.getByRole("group", { name: "Lead view" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Board" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("link", { name: "Pipeline Lead, Trial" })).toHaveAttribute("href", "/crm/leads/lead-1");
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Membership sold" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Membership not sold" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Did not answer" })).toBeInTheDocument();
  });

  it("keeps the pressed state truthful when switching to list view", async () => {
    const user = userEvent.setup();
    render(<PipelinePage />);

    await user.click(screen.getByRole("button", { name: "List" }));
    expect(screen.getByRole("button", { name: "Board" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "List" })).toHaveAttribute("aria-pressed", "true");
  });

  it("moves a lead through the outcome columns with native drag and drop", () => {
    render(<PipelinePage />);

    const card = screen.getByRole("link", { name: "Pipeline Lead, Trial" });
    const target = screen.getByRole("region", { name: "Membership not sold" });
    const dataTransfer = {
      effectAllowed: "",
      setData: vi.fn(),
      getData: vi.fn(() => "lead-1"),
    };

    fireEvent.dragStart(card, { dataTransfer });
    fireEvent.drop(target, { dataTransfer });

    expect(state.mutation).toHaveBeenCalledWith({ lead, target: "not_sold" });
  });
});
