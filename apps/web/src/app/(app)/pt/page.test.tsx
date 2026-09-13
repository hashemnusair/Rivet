import { render, screen, within } from "@testing-library/react";
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

describe("PT workspace trainer guidance", () => {
  const publishedWithHours = { ...workspace.trainers[0]!, availabilityRules: [{ id: "rule", trainerProfileId: "trainer", branchId: "branch", weekday: "mon" as const, startMinute: 480, endMinute: 1020, active: true }] };
  beforeEach(() => { Object.assign(state, { data: workspace, isError: false, isBackgroundError: false, error: undefined, permissions: ["pt.schedule.self", "pt.outcome.self"] }); });

  it("tells a trainer without a linked profile who has to create it and hides the gym's catalogue", () => {
    state.data = { ...workspace, trainers: [] };
    render(<PersonalTrainingPage />);
    expect(screen.getByTestId("trainer-setup-notice")).toHaveTextContent("Your trainer profile is not set up yet");
    expect(screen.getByTestId("trainer-setup-notice")).toHaveTextContent("An owner or manager links a profile");
    expect(screen.queryByRole("button", { name: "Set availability" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Your trainer profile" })).toBeInTheDocument();
    expect(screen.getByText("No profile is linked to your account")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "PT packages" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Pending package orders" })).not.toBeInTheDocument();
  });

  it("lets a trainer with a draft profile set hours now and says publication is the gym's step", async () => {
    state.data = { ...workspace, trainers: [{ ...workspace.trainers[0]!, status: "draft" }] };
    render(<PersonalTrainingPage />);
    expect(screen.getByTestId("trainer-setup-notice")).toHaveTextContent("Your trainer profile is still a draft");
    await userEvent.click(screen.getByRole("button", { name: "Set availability" }));
    expect(screen.getByRole("dialog", { name: "Fadi Khoury availability" })).toBeInTheDocument();
  });

  it("asks a published trainer without hours to add them, and stays quiet once they exist", () => {
    const { unmount } = render(<PersonalTrainingPage />);
    expect(screen.getByTestId("trainer-setup-notice")).toHaveTextContent("Add your weekly hours");
    unmount();
    state.data = { ...workspace, trainers: [publishedWithHours] };
    render(<PersonalTrainingPage />);
    expect(screen.queryByTestId("trainer-setup-notice")).not.toBeInTheDocument();
    expect(screen.getByText("No upcoming PT sessions")).toBeInTheDocument();
    expect(screen.getByText(/Sessions the front desk or a member books with you/)).toBeInTheDocument();
  });

  it("lets a trainer cancel only their own upcoming session", () => {
    const now = Date.now();
    const base = { organizationId: "gym", memberId: "member", branchId: "branch", branchName: "Main", entitlementId: "entitlement", status: "reserved" as const, createdAt: "2026-09-01T09:00:00Z", updatedAt: "2026-09-01T09:00:00Z", startsAt: new Date(now + 3 * 3_600_000).toISOString(), endsAt: new Date(now + 4 * 3_600_000).toISOString() };
    state.data = { ...workspace, trainers: [publishedWithHours], bookings: [
      { ...base, id: "own", memberName: "Aya Own", trainerProfileId: "trainer", trainerName: "Fadi Khoury" },
      { ...base, id: "other", memberName: "Basel Other", trainerProfileId: "other-trainer", trainerName: "Nour" },
    ] };
    render(<PersonalTrainingPage />);
    const rows = screen.getAllByTestId("pt-booking-row");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("Aya Own");
    expect(rows[0]!.querySelector("button")).toHaveTextContent("Cancel");
    expect(rows[1]).toHaveTextContent("Basel Other");
    expect(rows[1]!.querySelector("button")).toBeNull();
  });

  it("keeps the catalogue, orders and setup notice off a manager's page and explains an empty trainer picker", async () => {
    state.permissions = ["pt.manage", "pt.reports.read", "pt.book_for_member", "payments.collect"];
    state.data = { ...workspace, trainers: [] };
    render(<PersonalTrainingPage />);
    expect(screen.queryByTestId("trainer-setup-notice")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "PT packages" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Pending package orders" })).toBeInTheDocument();
    expect(screen.getByText("No trainer profiles")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Trainer" }));
    const dialog = screen.getByRole("dialog", { name: "Add a trainer profile" });
    expect(within(dialog).getByRole("status")).toHaveTextContent("No active trainer accounts yet.");
    expect(within(dialog).getByRole("link", { name: "Settings → Users" })).toHaveAttribute("href", "/settings?section=users");
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
