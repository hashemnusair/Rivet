import { fireEvent, render, screen, within } from "@testing-library/react";
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
  api: { updatePlatformGym: vi.fn(), archivePlatformGym: vi.fn(), publishPlatformGymProfile: vi.fn() },
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
    logoUrl: available("https://cdn.example/forge.png"),
    controls: { status: "active", plan: "Growth", isPublic: true, ...overrides },
    organization: organizationState === "available" ? available({ id: "10000000-0000-4000-8000-000000000001", name: "Forge Fitness", status: "active", currency: "JOD", timezone: "Asia/Amman" }) : { state: "not_available" },
    publicPage: organizationState === "available" ? available({ publishedVersion: 1 }) : { state: "not_available" as const },
    joinedAt: available("2026-01-01T00:00:00.000Z"),
    branches: available([{ id: "branch-1", name: "Main branch", code: "FOR-MAIN", address: "Amman", status: "active" }]),
    owner: available({ name: "Owner", email: "owner@example.com", phone: "+962 79 000 0000" }),
    agreement: { state: "not_configured" },
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

describe("Gym admin detail (informational record)", () => {
  beforeEach(() => {
    state.query = { data: detail(), isLoading: false, isError: false, error: undefined, refetch: vi.fn() };
    state.mutate.mockReset();
    state.invalidate.mockClear();
    state.api.updatePlatformGym.mockReset().mockResolvedValue(undefined);
    state.api.archivePlatformGym.mockReset().mockResolvedValue(undefined);
    state.api.publishPlatformGymProfile.mockReset().mockResolvedValue({ id: "gym-1", publishedVersion: 2 });
    Object.defineProperty(HTMLElement.prototype, "hasPointerCapture", { configurable: true, value: () => false });
    Object.defineProperty(HTMLElement.prototype, "setPointerCapture", { configurable: true, value: () => undefined });
    Object.defineProperty(HTMLElement.prototype, "releasePointerCapture", { configurable: true, value: () => undefined });
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: () => undefined });
  });

  it("keeps the page informational and routes subscription work to the billing page", () => {
    render(<GymAdminDetail gymId="gym-1" />);

    // No subscription editing controls live here anymore.
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Suspend" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save controls" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Membership end date")).not.toBeInTheDocument();

    // The facts stay, and both entry points deep-link into billing.
    expect(screen.getByText("Subscription facts")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Manage subscription/ })).toHaveAttribute("href", "/platform/billing?bill=gym-1");
    expect(screen.getByRole("link", { name: "Manage in Billing" })).toHaveAttribute("href", "/platform/billing?bill=gym-1");
  });

  it("renders the canonical logo and keeps initials as the missing-logo fallback", () => {
    render(<GymAdminDetail gymId="gym-1" />);

    const logo = screen.getByRole("img", { name: "Forge Fitness logo" });
    expect(logo.querySelector("img")).toHaveAttribute("src", "https://cdn.example/forge.png");

    state.query = { data: { ...detail(), logoUrl: { state: "not_configured" } }, isLoading: false, isError: false, error: undefined, refetch: vi.fn() };
    // A fresh render represents the same detail after the server clears the
    // logo reference; the component must remain identifiable without media.
    render(<GymAdminDetail gymId="gym-1" />);
    expect(screen.getAllByRole("img", { name: "Forge Fitness logo" })[1]).toHaveTextContent("FF");
  });

  it("keeps an unprovisioned directory row cleanup-only", () => {
    state.query = { data: detail({}, "not_available"), isLoading: false, isError: false, error: undefined, refetch: vi.fn() };
    render(<GymAdminDetail gymId="gym-1" />);

    expect(screen.getByRole("status")).toHaveTextContent("Cleanup-only record");
    expect(screen.getByRole("button", { name: /Manage subscription/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Public page" })).toBeDisabled();
    expect(screen.getByText("Suppressed: this row is not provisioned.")).toBeInTheDocument();
    expect(screen.getByLabelText("Public directory listing")).toBeDisabled();
    expect(screen.getByLabelText("Public directory listing")).not.toBeChecked();
  });

  it("saves an audited public-listing change without touching the subscription", async () => {
    render(<GymAdminDetail gymId="gym-1" />);

    const listingSwitch = screen.getByRole("switch", { name: "Public directory listing" });
    expect(listingSwitch).toBeChecked();
    fireEvent.click(listingSwitch);

    const save = screen.getByRole("button", { name: "Save listing" });
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText("Required for the immutable platform audit trail"), { target: { value: "Hide from the marketplace during rebrand." } });
    expect(save).toBeEnabled();
    fireEvent.click(save);

    expect(state.api.updatePlatformGym).toHaveBeenCalledWith({ gymId: "gym-1", isPublic: false, reason: "Hide from the marketplace during rebrand." });
  });

  it("shows a suppressed, locked listing for a suspended gym and points at billing to reactivate", () => {
    state.query = { data: detail({ status: "suspended", isPublic: false }), isLoading: false, isError: false, error: undefined, refetch: vi.fn() };
    render(<GymAdminDetail gymId="gym-1" />);

    const listingSwitch = screen.getByRole("switch", { name: "Public directory listing" });
    expect(listingSwitch).not.toBeChecked();
    expect(listingSwitch).toBeDisabled();
    expect(screen.getByText(/Reactivate from Billing first/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Public page" })).toBeDisabled();
  });

  it("offers a reviewed publish when the gym's draft is newer than the live page", () => {
    const withDraft = detail();
    withDraft.publicPage = available({ publishedVersion: 1, draftVersion: 2, draftStatus: "draft", draftUpdatedAt: "2026-08-27T10:00:00.000Z" });
    state.query = { data: withDraft, isLoading: false, isError: false, error: undefined, refetch: vi.fn() };
    render(<GymAdminDetail gymId="gym-1" />);

    expect(screen.getByText(/awaiting your review/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Publish draft v2/ }));
    const dialog = screen.getByRole("dialog", { name: /Publish Forge Fitness/ });
    const confirm = within(dialog).getByRole("button", { name: "Publish draft" });
    expect(confirm).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText("Reason for this change"), { target: { value: "Reviewed the rebrand request." } });
    fireEvent.click(confirm);

    expect(state.api.publishPlatformGymProfile).toHaveBeenCalledWith({ gymId: "gym-1", reason: "Reviewed the rebrand request." });
  });

  it("archives only through a confirmation dialog with an exact gym name and reason", () => {
    render(<GymAdminDetail gymId="gym-1" />);

    expect(screen.queryByRole("button", { name: "Delete gym" })).not.toBeInTheDocument();
    // The confirmation form must live inside the modal, never inline.
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Archive gym" })).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Archive gym" }));
    const dialog = screen.getByRole("dialog", { name: /Archive Forge Fitness\?/ });
    const confirm = () => within(dialog).getByRole("button", { name: "Archive gym" });
    expect(confirm()).toBeDisabled();

    fireEvent.change(within(dialog).getByLabelText("Type the gym name to confirm"), { target: { value: "Forge" } });
    fireEvent.change(within(dialog).getByLabelText("Reason for archiving"), { target: { value: "Customer requested account closure." } });
    expect(confirm()).toBeDisabled();

    fireEvent.change(within(dialog).getByLabelText("Type the gym name to confirm"), { target: { value: "Forge Fitness" } });
    expect(confirm()).toBeEnabled();
    fireEvent.click(confirm());

    expect(state.api.archivePlatformGym).toHaveBeenCalledWith({ gymId: "gym-1", confirmation: "Forge Fitness", reason: "Customer requested account closure." });
  });
});
