import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, ERR } from "@/lib/api/errors";
import type { PtWorkspace } from "@/lib/domain/types";
import PersonalTrainingPage from "./page";

const session = { user: { id: "trainer-user" }, branches: [{ id: "branch", name: "Main", status: "active" }] };
const state = vi.hoisted(() => ({
  data: undefined as PtWorkspace | undefined,
  isError: false, isBackgroundError: false, error: undefined as unknown,
  refetch: vi.fn(), permissions: ["pt.schedule.self", "pt.outcome.self"],
}));
vi.mock("@/lib/providers/app-providers", () => ({
  useApp: () => ({ session }),
  usePermissions: () => ({ can: (permission: string) => state.permissions.includes(permission) }),
}));
vi.mock("@/lib/hooks/use-api", () => ({
  useApiQuery: () => ({ data: [], isLoading: false }),
  useApiMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useInvalidate: () => vi.fn(),
}));
vi.mock("@/lib/hooks/use-realtime-api", () => ({ useRealtimeApiQuery: () => state }));

const workspace: PtWorkspace = {
  trainers: [{ id: "trainer", organizationId: "gym", userId: "trainer-user", displayName: "Fadi Khoury", specialties: ["Strength"], languages: ["en"], branchIds: ["branch"], status: "published", createdAt: "2026-09-01T09:00:00Z", updatedAt: "2026-09-01T09:00:00Z" }],
  packages: [], bookings: [], pendingOrders: [],
  metrics: { packageRevenue: { amount: 0, currency: "JOD" }, sessionsUsed: 3, sessionsReserved: 0, upcomingBookings: 0, noShows: 0 },
};

describe("PT workspace states", () => {
  beforeEach(() => { Object.assign(state, { data: workspace, isError: false, isBackgroundError: false, error: undefined }); state.refetch.mockClear(); });

  it("lets a trainer edit their availability without exposing payment or package management", async () => {
    render(<PersonalTrainingPage />);
    expect(screen.queryByRole("button", { name: "Package" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Pending package orders" })).not.toBeInTheDocument();
    expect(screen.queryByText("PT package revenue")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Availability" }));
    expect(screen.getByRole("dialog", { name: "Fadi Khoury availability" })).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Branch" }), "branch");
    expect(screen.getByRole("button", { name: "Save availability" })).toBeEnabled();
  });

  it("keeps the loaded schedule visible during a failed refresh", async () => {
    state.isBackgroundError = true;
    render(<PersonalTrainingPage />);
    expect(screen.getByText("Fadi Khoury")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(state.refetch).toHaveBeenCalledOnce();
  });

  it("separates denied access from a retryable failure", () => {
    Object.assign(state, { data: undefined, isError: true, error: ApiError.of(ERR.FORBIDDEN, "This role cannot open PT reports.") });
    render(<PersonalTrainingPage />);
    expect(screen.getByRole("heading", { name: "Not allowed for this role" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });
});

describe("PT workspace outcome context", () => {
  it("separates sessions that need an outcome from upcoming ones and unlocks outcomes only after the start", () => {
    const now = Date.now();
    const base = { organizationId: "gym", memberId: "member", trainerProfileId: "trainer", trainerName: "Fadi Khoury", branchId: "branch", branchName: "Main", entitlementId: "entitlement", status: "reserved" as const, createdAt: "2026-09-01T09:00:00Z", updatedAt: "2026-09-01T09:00:00Z" };
    Object.assign(state, {
      isError: false, isBackgroundError: false, error: undefined,
      data: { ...workspace, cancellationCutoffHours: 12, bookings: [
        { ...base, id: "started", memberName: "Aya Started", startsAt: new Date(now - 30 * 60_000).toISOString(), endsAt: new Date(now + 30 * 60_000).toISOString() },
        { ...base, id: "future", memberName: "Basel Future", startsAt: new Date(now + 3 * 3_600_000).toISOString(), endsAt: new Date(now + 4 * 3_600_000).toISOString() },
      ] },
    });
    render(<PersonalTrainingPage />);
    expect(screen.getByRole("heading", { name: "Needs an outcome" })).toBeInTheDocument();
    expect(screen.getByText("Awaiting outcome")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Complete" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "No-show" })).toHaveLength(1);
    expect(screen.getByText(/Basel Future/)).toBeInTheDocument();
    expect(screen.getByText("Outcome controls unlock when the session begins.")).toBeInTheDocument();
  });
});
