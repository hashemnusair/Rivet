import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PlatformGymDetail } from "@/lib/api/GymOSApi";
import GymAdminDetail, { validateSubscriptionDraft } from "./gym-admin-detail";

const state = vi.hoisted(() => ({
  query: {
    data: undefined as unknown,
    isLoading: false,
    isError: false,
    error: undefined as unknown,
    refetch: vi.fn(),
  },
  mutate: vi.fn(),
  mutationFactory: undefined as unknown,
  invalidate: vi.fn(async () => undefined),
  api: { updatePlatformGym: vi.fn() },
}));

vi.mock("@/lib/hooks/use-realtime-api", () => ({
  useRealtimeApiQuery: () => state.query,
}));

vi.mock("@/lib/hooks/use-api", () => ({
  useInvalidate: () => state.invalidate,
  useApiMutation: (factory: unknown) => {
    state.mutationFactory = factory;
    return { mutate: state.mutate, isPending: false };
  },
}));

const available = <T,>(value: T) => ({ state: "available" as const, value });

function detail(overrides: Partial<PlatformGymDetail["controls"]> = {}, organizationState: "available" | "not_available" = "available"): PlatformGymDetail {
  return {
    id: "gym-1",
    name: "Forge Fitness",
    shortName: "FOR",
    accent: "#15140f",
    controls: { status: "active", plan: "Growth", isPublic: true, ...overrides },
    organization: organizationState === "available" ? available({ id: "10000000-0000-4000-8000-000000000001", name: "Forge Fitness", status: "active", currency: "JOD", timezone: "Asia/Amman" }) : { state: "not_available" },
    joinedAt: available("2026-01-01T00:00:00.000Z"),
    branches: available([{ id: "branch-1", name: "Main branch", code: "FOR-MAIN", address: "Amman", status: "active" }]),
    owner: available({ name: "Owner", email: "owner@example.com", phone: "+962 79 000 0000" }),
    usage: {
      memberCount: available(100),
      activeStaffCount: available(5),
      staffLimit: available(25),
      automationRuleCount: available(2),
      paymentTransactionCount: available(12),
      storage: available("10 MB"),
    },
    subscription: {
      plan: available("Growth"),
      status: available("active"),
      startedAt: available("2026-01-01T00:00:00.000Z"),
      trialEndsAt: { state: "not_configured" },
      currentPeriodEndsAt: available("2026-02-01T00:00:00.000Z"),
      cancelledAt: { state: "not_configured" },
      statusReason: available("Initial subscription"),
      recurringAmount: available({ amount: 149_000, currency: "JOD" }),
      renewalDate: available("2026-02-01"),
      paymentMethod: { state: "not_configured" },
      invoices: available([]),
    },
    activity: available([]),
  };
}

describe("Gym admin detail subscription controls", () => {
  beforeEach(() => {
    state.query = { data: detail(), isLoading: false, isError: false, error: undefined, refetch: vi.fn() };
    state.mutate.mockReset();
    state.invalidate.mockClear();
    state.api.updatePlatformGym.mockReset().mockResolvedValue(undefined);
    state.mutationFactory = undefined;
  });

  it("mirrors backend lifecycle validation for malformed, future, and ordered dates", () => {
    const base = detail();
    const now = Date.parse("2026-08-20T12:00:00.000Z");
    expect(validateSubscriptionDraft(base, { status: "trial", trialEndsAt: "2026-02-31", subscriptionStartedAt: "2026-01-01", currentPeriodEndsAt: "2026-03-01", cancelledAt: "" }, now)).toMatchObject({ trialEndsAt: "Enter a valid date" });
    expect(validateSubscriptionDraft(base, { status: "trial", trialEndsAt: "2026-08-20", subscriptionStartedAt: "2026-01-01", currentPeriodEndsAt: "2026-09-01", cancelledAt: "" }, now)).toMatchObject({ trialEndsAt: "Must be in the future" });
    expect(validateSubscriptionDraft(base, { status: "trial", trialEndsAt: "2026-09-09", subscriptionStartedAt: "2026-09-10", currentPeriodEndsAt: "2026-09-30", cancelledAt: "" }, now)).toMatchObject({ trialEndsAt: "Must be on or after the start date" });
    expect(validateSubscriptionDraft(base, { status: "active", trialEndsAt: "", subscriptionStartedAt: "2026-09-10", currentPeriodEndsAt: "2026-09-09", cancelledAt: "" }, now)).toMatchObject({ currentPeriodEndsAt: "Must be on or after the start date" });
    expect(validateSubscriptionDraft(base, { status: "cancelled", trialEndsAt: "", subscriptionStartedAt: "2026-09-10", currentPeriodEndsAt: "2026-09-30", cancelledAt: "2026-09-09" }, now)).toMatchObject({ cancelledAt: "Must be on or after the start date" });
  });

  it("keeps an unprovisioned directory row cleanup-only", () => {
    state.query = { data: detail({}, "not_available"), isLoading: false, isError: false, error: undefined, refetch: vi.fn() };
    render(<GymAdminDetail gymId="gym-1" />);

    expect(screen.getByRole("status")).toHaveTextContent("Cleanup-only record");
    expect(screen.getByRole("button", { name: "Suspend" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Marketplace profile unavailable" })).toBeDisabled();
    expect(screen.getByText("Already suppressed because this directory row is not provisioned.")).toBeInTheDocument();
    expect(screen.getByText(/no save is available for cleanup-only rows/i)).toBeInTheDocument();
    expect(screen.getAllByRole("combobox").every((control) => (control as HTMLButtonElement).disabled)).toBe(true);
    expect(screen.getByLabelText("Trial ends")).toBeDisabled();
    expect(screen.getByLabelText("Subscription started")).toBeDisabled();
    expect(screen.getByLabelText("Current period ends")).toBeDisabled();
    expect(screen.getByLabelText("Public directory listing")).toBeDisabled();
    expect(screen.getByLabelText("Public directory listing")).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Save controls" })).toBeDisabled();
  });

  it("shows lifecycle ordering errors inline before calling the API", () => {
    render(<GymAdminDetail gymId="gym-1" />);

    fireEvent.click(screen.getByRole("button", { name: "Suspend" }));
    fireEvent.change(screen.getByLabelText("Subscription started"), { target: { value: "2026-09-10" } });
    fireEvent.change(screen.getByLabelText("Current period ends"), { target: { value: "2026-09-09" } });
    fireEvent.change(screen.getByPlaceholderText("Required for the immutable platform audit trail"), { target: { value: "Correcting lifecycle dates." } });
    fireEvent.click(screen.getByRole("button", { name: "Save controls" }));

    expect(screen.getByText("Must be on or after the start date")).toBeInTheDocument();
    expect(state.mutate).not.toHaveBeenCalled();
  });

  it("suppresses the public listing when an operator suspends a gym", () => {
    render(<GymAdminDetail gymId="gym-1" />);

    expect(screen.getByRole("switch", { name: "Public directory listing" })).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Suspend" }));

    expect(screen.getByRole("button", { name: "Suspend" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Restore access" })).not.toBeInTheDocument();
    const listingSwitch = screen.getByRole("switch", { name: "Public directory listing" });
    expect(listingSwitch).not.toBeChecked();
    expect(listingSwitch).toBeDisabled();
    expect(screen.getByText("Suppressed while this subscription is not active or in trial.")).toBeInTheDocument();
  });

  it("surfaces a stale public flag on an already suspended record for audited repair", () => {
    state.query = { data: detail({ status: "suspended", isPublic: true }), isLoading: false, isError: false, error: undefined, refetch: vi.fn() };
    render(<GymAdminDetail gymId="gym-1" />);

    expect(screen.getByRole("switch", { name: "Public directory listing" })).not.toBeChecked();
    expect(screen.getByRole("switch", { name: "Public directory listing" })).toBeDisabled();
    expect(screen.getByText("Unsaved changes.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save controls" })).toBeDisabled();
  });

  it("does not offer a dead marketplace link for a hidden suspended gym", () => {
    state.query = { data: detail({ status: "suspended", isPublic: false }), isLoading: false, isError: false, error: undefined, refetch: vi.fn() };
    render(<GymAdminDetail gymId="gym-1" />);

    expect(screen.getByRole("button", { name: "Marketplace profile unavailable" })).toBeDisabled();
    expect(screen.queryByRole("link", { name: /Marketplace profile/i })).not.toBeInTheDocument();
  });

  it("sends an explicit hidden listing when saving a suspension", () => {
    state.mutate.mockImplementation(() => {
      const factory = state.mutationFactory as ((api: typeof state.api) => Promise<unknown>);
      return factory(state.api);
    });
    render(<GymAdminDetail gymId="gym-1" />);

    fireEvent.click(screen.getByRole("button", { name: "Suspend" }));
    fireEvent.change(screen.getByPlaceholderText("Required for the immutable platform audit trail"), { target: { value: "Account requested a temporary pause." } });
    fireEvent.click(screen.getByRole("button", { name: "Save controls" }));

    expect(state.api.updatePlatformGym).toHaveBeenCalledWith(expect.objectContaining({ gymId: "gym-1", status: "suspended", isPublic: false, reason: "Account requested a temporary pause." }));
  });

  it("omits a historical cancellation date when reactivating a cancelled gym", () => {
    const cancelled = detail({ status: "cancelled", isPublic: false });
    cancelled.subscription.cancelledAt = available("2026-08-01T00:00:00.000Z");
    state.query = { data: cancelled, isLoading: false, isError: false, error: undefined, refetch: vi.fn() };
    state.mutate.mockImplementation(() => {
      const factory = state.mutationFactory as ((api: typeof state.api) => Promise<unknown>);
      return factory(state.api);
    });
    render(<GymAdminDetail gymId="gym-1" />);

    fireEvent.click(screen.getByRole("button", { name: "Reactivate" }));
    fireEvent.change(screen.getByPlaceholderText("Required for the immutable platform audit trail"), { target: { value: "Reactivated after billing review." } });
    fireEvent.click(screen.getByRole("button", { name: "Save controls" }));

    expect(state.api.updatePlatformGym).toHaveBeenCalledWith(expect.objectContaining({ status: "active", cancelledAt: undefined, reason: "Reactivated after billing review." }));
  });
});
