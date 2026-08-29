import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LeadSummary } from "@/lib/domain/types";
import { qk } from "@/lib/api/keys";
import PipelinePage from "./page";

const state = vi.hoisted(() => ({
  queryKey: undefined as unknown,
  moveMutation: vi.fn(),
  closeMutation: vi.fn(),
  mutationHookCall: 0,
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
    const mutation = state.mutationHookCall++ % 2 === 0 ? state.moveMutation : state.closeMutation;
    return { mutate: mutation, isPending: false };
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
    state.mutationHookCall = 0;
    state.moveMutation.mockReset();
    state.closeMutation.mockReset();
    vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    vi.stubGlobal("ResizeObserver", class ResizeObserver { observe() {} unobserve() {} disconnect() {} });
    HTMLElement.prototype.scrollIntoView = () => undefined;
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
    expect(screen.getByRole("link", { name: "Open Pipeline Lead" })).toHaveAttribute("href", "/crm/leads/lead-1");
    expect(screen.getByRole("article", { name: "Pipeline Lead, Trial" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "No answer for Pipeline Lead" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mark Pipeline Lead not sold" })).toBeInTheDocument();
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

  it("requires a reason when a lead is dropped into the terminal not-sold column", async () => {
    const user = userEvent.setup();
    render(<PipelinePage />);

    const card = screen.getByRole("article", { name: "Pipeline Lead, Trial" });
    const target = screen.getByRole("region", { name: "Membership not sold" });
    const dataTransfer = {
      effectAllowed: "",
      setData: vi.fn(),
      getData: vi.fn(() => "lead-1"),
    };

    fireEvent.dragStart(card, { dataTransfer });
    fireEvent.drop(target, { dataTransfer });

    expect(await screen.findByRole("dialog", { name: "Mark membership as not sold?" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mark not sold" })).toBeDisabled();
    await user.type(screen.getByLabelText("Reason"), "Price was outside the prospect's budget");
    await user.click(screen.getByRole("button", { name: "Mark not sold" }));
    expect(state.closeMutation).toHaveBeenCalledWith({ lead, reason: "Price was outside the prospect's budget" });
    expect(state.moveMutation).not.toHaveBeenCalled();
  });

  it("offers a one-tap no-answer action without closing the lead", async () => {
    const user = userEvent.setup();
    render(<PipelinePage />);

    await user.click(screen.getByRole("button", { name: "No answer for Pipeline Lead" }));
    expect(state.moveMutation).toHaveBeenCalledWith({ lead, target: "no_answer" });
  });
});
