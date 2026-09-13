import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PtWorkspace } from "@/lib/domain/types";
import { TrainerDashboard } from "./trainer-dashboard";

const session = { user: { id: "trainer-user", name: "Fadi Khoury" }, organization: { timezone: "Asia/Amman" } };
const state = vi.hoisted(() => ({
  data: undefined as PtWorkspace | undefined,
  isLoading: false, isError: false, isBackgroundError: false, error: undefined as unknown,
  refetch: vi.fn(),
}));
vi.mock("@/lib/providers/app-providers", () => ({ useApp: () => ({ session }) }));
vi.mock("@/lib/hooks/use-api", () => ({
  useApiMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useInvalidate: () => vi.fn(),
}));
vi.mock("@/lib/hooks/use-realtime-api", () => ({ useRealtimeApiQuery: () => state }));

const profile: PtWorkspace["trainers"][number] = { id: "trainer", organizationId: "gym", userId: "trainer-user", displayName: "Fadi Khoury", specialties: [], languages: ["en"], branchIds: ["branch"], status: "published", availabilityRules: [{ id: "rule", trainerProfileId: "trainer", branchId: "branch", weekday: "mon", startMinute: 480, endMinute: 1020, active: true }], createdAt: "2026-09-01T09:00:00Z", updatedAt: "2026-09-01T09:00:00Z" };
const empty: PtWorkspace = { trainers: [profile], packages: [], bookings: [], pendingOrders: [], metrics: { packageRevenue: { amount: 0, currency: "JOD" }, sessionsUsed: 0, sessionsReserved: 0, upcomingBookings: 0, noShows: 0 } };

describe("trainer dashboard setup guidance", () => {
  beforeEach(() => { Object.assign(state, { data: empty, isLoading: false, isError: false, isBackgroundError: false, error: undefined }); state.refetch.mockClear(); });

  it("treats a quiet day as a quiet day once the profile, publication and hours exist", () => {
    render(<TrainerDashboard />);
    expect(screen.queryByTestId("trainer-setup-notice")).not.toBeInTheDocument();
    expect(screen.getByText("No PT sessions today")).toBeInTheDocument();
    expect(screen.getByText(/Sessions the front desk or a member books with you/)).toBeInTheDocument();
  });

  it("names the missing profile as the gym's step rather than showing an empty calendar", () => {
    state.data = { ...empty, trainers: [] };
    render(<TrainerDashboard />);
    expect(screen.getByTestId("trainer-setup-notice")).toHaveTextContent("Your trainer profile is not set up yet");
    expect(screen.getByText("Bookings open once your profile and hours are set up.")).toBeInTheDocument();
  });

  it("sends a published trainer without hours to the PT workspace to add them", () => {
    state.data = { ...empty, trainers: [{ ...profile, availabilityRules: [] }] };
    render(<TrainerDashboard />);
    expect(screen.getByTestId("trainer-setup-notice")).toHaveTextContent("Add your weekly hours");
    expect(screen.getByRole("link", { name: "Set availability" })).toHaveAttribute("href", "/pt");
  });

  it("flags a draft profile as waiting on publication while still offering the hours step", () => {
    state.data = { ...empty, trainers: [{ ...profile, status: "draft" }] };
    render(<TrainerDashboard />);
    expect(screen.getByTestId("trainer-setup-notice")).toHaveTextContent("still a draft");
    expect(screen.getByRole("link", { name: "Set availability" })).toBeInTheDocument();
  });

  it("keeps the loaded calendar visible when a refresh fails", async () => {
    state.isBackgroundError = true;
    render(<TrainerDashboard />);
    expect(screen.getByText("No PT sessions today")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(state.refetch).toHaveBeenCalledOnce();
  });
});
