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

  const openMenu = async (user: ReturnType<typeof userEvent.setup>, gym: string) => {
    await user.click(screen.getByRole("button", { name: `More actions for ${gym}` }));
  };

  it("lists provisioned gyms with their plan, status and paid-through date, and no plan changes", () => {
    render(<GymSubscriptions gyms={gyms} />);

    expect(screen.queryByText("Legacy Row")).not.toBeInTheDocument();
    const activeRow = screen.getByRole("row", { name: /Forge Fitness/ });
    expect(activeRow).toHaveTextContent("Pro · Monthly");
    expect(activeRow).toHaveTextContent("15 Sept 2026");
    // Gyms change their own plan now.
    expect(screen.queryByRole("button", { name: /Change plan/ })).not.toBeInTheDocument();
  });

  it("suspends through a reasoned dialog that promises no invoice", async () => {
    const user = userEvent.setup();
    render(<GymSubscriptions gyms={gyms} />);

    await openMenu(user, "Forge Fitness");
    await user.click(await screen.findByRole("menuitem", { name: "Suspend" }));
    const dialog = screen.getByRole("dialog", { name: /Suspend Forge Fitness\?/ });
    expect(dialog).toHaveTextContent("No invoice is issued.");

    const confirm = within(dialog).getByRole("button", { name: "Suspend gym" });
    expect(confirm).toBeDisabled();
    await user.type(within(dialog).getByLabelText("Reason for this change"), "Payment dispute under review.");
    await user.click(confirm);

    expect(state.api.updatePlatformGym).toHaveBeenCalledWith({ gymId: "gym-active", status: "suspended", reason: "Payment dispute under review." });
  });

  it("cancels through its own reasoned dialog", async () => {
    const user = userEvent.setup();
    render(<GymSubscriptions gyms={gyms} />);

    await openMenu(user, "Iron Temple");
    expect(screen.queryByRole("menuitem", { name: "Suspend" })).not.toBeInTheDocument();
    await user.click(await screen.findByRole("menuitem", { name: "Cancel subscription" }));
    const dialog = screen.getByRole("dialog", { name: /Cancel Iron Temple's subscription\?/ });
    await user.type(within(dialog).getByLabelText("Reason for this change"), "Owner closed the business.");
    await user.click(within(dialog).getByRole("button", { name: "Cancel subscription" }));

    expect(state.api.updatePlatformGym).toHaveBeenCalledWith({ gymId: "gym-suspended", status: "cancelled", reason: "Owner closed the business." });
  });

  it("reactivates a suspended gym and says a new term is billed", async () => {
    const user = userEvent.setup();
    render(<GymSubscriptions gyms={gyms} />);

    await openMenu(user, "Iron Temple");
    await user.click(await screen.findByRole("menuitem", { name: "Reactivate & bill" }));
    const dialog = screen.getByRole("dialog", { name: /Reactivate Iron Temple\?/ });
    expect(dialog).toHaveTextContent("gets an invoice for a new term");
    await user.type(within(dialog).getByLabelText("Reason for this change"), "Paid by bank transfer.");
    await user.click(within(dialog).getByRole("button", { name: "Reactivate & bill" }));

    expect(state.api.updatePlatformGym).toHaveBeenCalledWith({ gymId: "gym-suspended", status: "active", reason: "Paid by bank transfer." });
  });
});
