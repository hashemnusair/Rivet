import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MarketplaceGym } from "@/lib/public/experience-data";
import { GymSubscriptions } from "./gym-subscriptions";

const state = vi.hoisted(() => ({
  api: { updatePlatformGym: vi.fn() },
}));

vi.mock("@/lib/hooks/use-api", () => ({
  useApiMutation: (factory: (api: typeof state.api) => Promise<unknown>, options?: { onSuccess?: () => void }) => ({
    mutate: () => factory(state.api).then(() => options?.onSuccess?.()),
    isPending: false,
  }),
}));

function gym(overrides: Partial<MarketplaceGym>): MarketplaceGym {
  return {
    id: "gym-active",
    name: "Forge Fitness",
    shortName: "FOR",
    tagline: "",
    description: "",
    city: "Amman",
    areas: [],
    category: "",
    audience: "",
    memberCount: 0,
    branchCount: 1,
    fromPriceMinor: 0,
    amenities: [],
    accent: "#111111",
    featured: false,
    subscriptionStatus: "active",
    rivetPlan: "Pro",
    billingInterval: "monthly",
    currentPeriodEndsAt: "2026-09-15T10:00:00.000Z",
    joinedAt: "",
    lastActiveAt: "",
    monthlyRevenueMinor: 0,
    isPublic: true,
    isProvisioned: true,
    branches: [],
    ...overrides,
  } as MarketplaceGym;
}

const gyms: MarketplaceGym[] = [
  gym({}),
  gym({ id: "gym-suspended", name: "Iron Temple", subscriptionStatus: "suspended", rivetPlan: "Growth", currentPeriodEndsAt: undefined }),
  gym({ id: "gym-directory", name: "Legacy Row", isProvisioned: false }),
];

describe("Gym subscriptions section", () => {
  beforeEach(() => {
    state.api.updatePlatformGym.mockReset().mockResolvedValue(undefined);
  });

  it("lists provisioned tenants with live facts and routes plan changes to the wizard", async () => {
    const user = userEvent.setup();
    const onBill = vi.fn();
    render(<GymSubscriptions gyms={gyms} onBill={onBill} />);

    expect(screen.queryByText("Legacy Row")).not.toBeInTheDocument();
    const activeRow = screen.getByRole("row", { name: /Forge Fitness/ });
    expect(activeRow).toHaveTextContent("Pro · monthly");
    expect(activeRow).toHaveTextContent("15 Sept 2026");

    await user.click(within(activeRow).getByRole("button", { name: /Change plan/ }));
    expect(onBill).toHaveBeenCalledWith("gym-active");

    const suspendedRow = screen.getByRole("row", { name: /Iron Temple/ });
    expect(within(suspendedRow).queryByRole("button", { name: "Suspend" })).not.toBeInTheDocument();
    await user.click(within(suspendedRow).getByRole("button", { name: /Reactivate & bill/ }));
    expect(onBill).toHaveBeenCalledWith("gym-suspended");
  });

  it("suspends through a reasoned dialog that promises no invoice", async () => {
    const user = userEvent.setup();
    render(<GymSubscriptions gyms={gyms} onBill={vi.fn()} />);

    await user.click(within(screen.getByRole("row", { name: /Forge Fitness/ })).getByRole("button", { name: "Suspend" }));
    const dialog = screen.getByRole("dialog", { name: /Suspend Forge Fitness\?/ });
    expect(dialog).toHaveTextContent("No invoice is issued; the paid-through date stays on record");

    const confirm = within(dialog).getByRole("button", { name: "Suspend gym" });
    expect(confirm).toBeDisabled();
    await user.type(within(dialog).getByLabelText("Reason for this change"), "Payment dispute under review.");
    await user.click(confirm);

    expect(state.api.updatePlatformGym).toHaveBeenCalledWith({ gymId: "gym-active", status: "suspended", reason: "Payment dispute under review." });
  });

  it("cancels through its own reasoned dialog", async () => {
    const user = userEvent.setup();
    render(<GymSubscriptions gyms={gyms} onBill={vi.fn()} />);

    await user.click(within(screen.getByRole("row", { name: /Iron Temple/ })).getByRole("button", { name: "Cancel" }));
    const dialog = screen.getByRole("dialog", { name: /Cancel Iron Temple's subscription\?/ });
    await user.type(within(dialog).getByLabelText("Reason for this change"), "Owner closed the business.");
    await user.click(within(dialog).getByRole("button", { name: "Cancel subscription" }));

    expect(state.api.updatePlatformGym).toHaveBeenCalledWith({ gymId: "gym-suspended", status: "cancelled", reason: "Owner closed the business." });
  });
});
