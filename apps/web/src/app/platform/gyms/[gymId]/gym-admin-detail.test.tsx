import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PlatformGymDetail } from "@/lib/api/GymOSApi";
import GymAdminDetail from "./gym-admin-detail";

const state = vi.hoisted(() => ({
  query: {
    data: undefined as unknown,
    isLoading: false,
    isError: false,
    error: undefined as unknown,
    refetch: vi.fn(),
  },
  mutate: vi.fn(),
  invalidate: vi.fn(async () => undefined),
  api: { updatePlatformGym: vi.fn(), archivePlatformGym: vi.fn() },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/lib/hooks/use-realtime-api", () => ({
  useRealtimeApiQuery: () => state.query,
}));

vi.mock("@/lib/hooks/use-api", () => ({
  useInvalidate: () => state.invalidate,
  useApiMutation: (factory: (api: typeof state.api, variables: unknown) => Promise<unknown>) => {
    return {
      mutate: (variables: unknown) => {
        state.mutate(variables);
        void factory(state.api, variables);
      },
      isPending: false,
    };
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
      billingInterval: available("monthly"),
      status: available("active"),
      startedAt: available("2026-01-01T00:00:00.000Z"),
      trialEndsAt: available("2026-01-31T00:00:00.000Z"),
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
    state.api.archivePlatformGym.mockReset().mockResolvedValue(undefined);
    Object.defineProperty(HTMLElement.prototype, "hasPointerCapture", { configurable: true, value: () => false });
    Object.defineProperty(HTMLElement.prototype, "setPointerCapture", { configurable: true, value: () => undefined });
    Object.defineProperty(HTMLElement.prototype, "releasePointerCapture", { configurable: true, value: () => undefined });
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: () => undefined });
  });

  it("renders server-owned lifecycle dates without editable date controls", () => {
    render(<GymAdminDetail gymId="gym-1" />);

    expect(screen.queryByLabelText("Trial ends")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Subscription started")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Current period ends")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Cancelled on")).not.toBeInTheDocument();
    expect(screen.getByText(/Subscription dates are server-owned/)).toBeInTheDocument();
    expect(screen.getByText("Trial ends")).toBeInTheDocument();
    expect(screen.getByText("Period ends")).toBeInTheDocument();
    expect(screen.getAllByText("Billing cadence").length).toBeGreaterThanOrEqual(2);
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
    expect(screen.getByLabelText("Public directory listing")).toBeDisabled();
    expect(screen.getByLabelText("Public directory listing")).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Save controls" })).toBeDisabled();
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
    render(<GymAdminDetail gymId="gym-1" />);

    fireEvent.click(screen.getByRole("button", { name: "Suspend" }));
    fireEvent.change(screen.getByPlaceholderText("Required for the immutable platform audit trail"), { target: { value: "Account requested a temporary pause." } });
    fireEvent.click(screen.getByRole("button", { name: "Save controls" }));

    expect(state.api.updatePlatformGym).toHaveBeenCalledWith(expect.objectContaining({ gymId: "gym-1", status: "suspended", isPublic: false, reason: "Account requested a temporary pause." }));
  });

  it("submits an annual billing cadence change with the audited controls", async () => {
    const user = userEvent.setup();
    render(<GymAdminDetail gymId="gym-1" />);

    await user.click(screen.getByRole("combobox", { name: "Billing cadence" }));
    await user.click(screen.getByRole("option", { name: /Annual/ }));
    await user.type(screen.getByPlaceholderText("Required for the immutable platform audit trail"), "Approved annual billing.");
    await user.click(screen.getByRole("button", { name: "Save controls" }));

    expect(state.api.updatePlatformGym).toHaveBeenCalledWith(expect.objectContaining({ gymId: "gym-1", billingInterval: "annual", reason: "Approved annual billing." }));
  });

  it("omits a historical cancellation date when reactivating a cancelled gym", () => {
    const cancelled = detail({ status: "cancelled", isPublic: false });
    cancelled.subscription.cancelledAt = available("2026-08-01T00:00:00.000Z");
    state.query = { data: cancelled, isLoading: false, isError: false, error: undefined, refetch: vi.fn() };
    render(<GymAdminDetail gymId="gym-1" />);

    fireEvent.click(screen.getByRole("button", { name: "Reactivate" }));
    fireEvent.change(screen.getByPlaceholderText("Required for the immutable platform audit trail"), { target: { value: "Reactivated after billing review." } });
    fireEvent.click(screen.getByRole("button", { name: "Save controls" }));

    const input = state.api.updatePlatformGym.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(input).toMatchObject({ status: "active", reason: "Reactivated after billing review." });
    expect(input).not.toHaveProperty("cancelledAt");
  });

  it("requires an exact gym name and reason before archiving", () => {
    render(<GymAdminDetail gymId="gym-1" />);

    fireEvent.click(screen.getAllByRole("button", { name: "Delete gym" })[0]!);
    const confirm = () => screen.getAllByRole("button", { name: "Delete gym" })[1]!;
    expect(confirm()).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Type the gym name to confirm"), { target: { value: "Forge" } });
    fireEvent.change(screen.getByLabelText("Reason for deletion"), { target: { value: "Customer requested account closure." } });
    expect(confirm()).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Type the gym name to confirm"), { target: { value: "Forge Fitness" } });
    expect(confirm()).toBeEnabled();
    fireEvent.click(confirm());

    expect(state.api.archivePlatformGym).toHaveBeenCalledWith({ gymId: "gym-1", confirmation: "Forge Fitness", reason: "Customer requested account closure." });
  });
});
