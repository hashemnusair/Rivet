import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MarketplaceGym } from "@/lib/public/experience-data";
import { GymSubscriptions } from "./gym-subscriptions";

const state = vi.hoisted(() => ({
  api: { updatePlatformGym: vi.fn() },
}));

vi.mock("@/lib/hooks/use-api", () => ({
  useApiMutation: (factory: (api: typeof state.api, input?: unknown) => Promise<unknown>, options?: { onSuccess?: () => void }) => ({
    mutate: (input?: unknown) => factory(state.api, input).then(() => options?.onSuccess?.()),
    isPending: false,
  }),
}));

// The plan list falls back to the launch catalogue, as on the landing page.
vi.mock("@/lib/providers/experience-provider", () => ({ useExperience: () => ({ saasPlans: [] }) }));

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
  gym({ id: "gym-enterprise", name: "Summit Club", rivetPlan: "Enterprise", quotedPriceMinor: 420_000 }),
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

  it("lists provisioned gyms with their plan, status and paid-through date, and an Enterprise gym's quote", () => {
    render(<GymSubscriptions gyms={gyms} />);

    expect(screen.queryByText("Legacy Row")).not.toBeInTheDocument();
    const activeRow = screen.getByRole("row", { name: /Forge Fitness/ });
    expect(activeRow).toHaveTextContent("Pro · Monthly");
    expect(activeRow).toHaveTextContent("15 Sept 2026");
    expect(screen.getByRole("row", { name: /Summit Club/ })).toHaveTextContent("JOD 420.000 a month");
  });

  it("moves a gym onto Enterprise only with the price agreed with it", async () => {
    const user = userEvent.setup();
    render(<GymSubscriptions gyms={gyms} />);

    await openMenu(user, "Forge Fitness");
    await user.click(await screen.findByRole("menuitem", { name: "Change plan" }));
    const dialog = screen.getByRole("dialog", { name: /Change Forge Fitness's plan/ });
    expect(dialog).toHaveTextContent("Days it already paid for come off that invoice.");
    expect(within(dialog).getByRole("radio", { name: /Enterprise/ })).toHaveTextContent("Custom quote");
    await user.click(within(dialog).getByRole("radio", { name: /Enterprise/ }));
    await user.type(within(dialog).getByLabelText("Reason for this change"), "Signed the Enterprise quote.");
    await user.click(within(dialog).getByRole("button", { name: "Change plan" }));
    expect(dialog).toHaveTextContent("Enter the monthly price you agreed with the gym.");
    expect(state.api.updatePlatformGym).not.toHaveBeenCalled();

    await user.type(within(dialog).getByRole("textbox", { name: /Price a month/ }), "380");
    await user.click(within(dialog).getByRole("button", { name: "Change plan" }));
    expect(state.api.updatePlatformGym).toHaveBeenCalledWith({ gymId: "gym-active", plan: "Enterprise", quotedPriceMinor: 380_000, reason: "Signed the Enterprise quote." });
  });

  it("changes only what RIVET changed: an Enterprise quote, or a billing cycle", async () => {
    const user = userEvent.setup();
    render(<GymSubscriptions gyms={gyms} />);

    await openMenu(user, "Summit Club");
    await user.click(await screen.findByRole("menuitem", { name: "Change plan" }));
    let dialog = screen.getByRole("dialog", { name: /Change Summit Club's plan/ });
    const price = within(dialog).getByRole("textbox", { name: /Price a month/ });
    expect(price).toHaveValue("420.000");
    await user.type(within(dialog).getByLabelText("Reason for this change"), "Nothing yet.");
    await user.click(within(dialog).getByRole("button", { name: "Change plan" }));
    expect(dialog).toHaveTextContent("Change the plan, the billing or the price first.");
    await user.clear(price);
    await user.type(price, "450");
    await user.click(within(dialog).getByRole("button", { name: "Change plan" }));
    expect(state.api.updatePlatformGym).toHaveBeenLastCalledWith({ gymId: "gym-enterprise", quotedPriceMinor: 450_000, reason: "Nothing yet." });

    await openMenu(user, "Forge Fitness");
    await user.click(await screen.findByRole("menuitem", { name: "Change plan" }));
    dialog = screen.getByRole("dialog", { name: /Change Forge Fitness's plan/ });
    await user.click(within(dialog).getByRole("radio", { name: "Yearly (5% off)" }));
    await user.type(within(dialog).getByLabelText("Reason for this change"), "Owner asked for yearly billing.");
    await user.click(within(dialog).getByRole("button", { name: "Change plan" }));
    expect(state.api.updatePlatformGym).toHaveBeenLastCalledWith({ gymId: "gym-active", billingInterval: "annual", reason: "Owner asked for yearly billing." });
  });

  it("corrects a gym that has not paid yet by replacing its first invoice", async () => {
    const user = userEvent.setup();
    render(<GymSubscriptions gyms={[gym({ id: "gym-new", name: "New Gym", subscriptionStatus: "pending_payment", rivetPlan: "Starter", currentPeriodEndsAt: undefined })]} />);
    await openMenu(user, "New Gym");
    await user.click(await screen.findByRole("menuitem", { name: "Change plan" }));
    const dialog = screen.getByRole("dialog", { name: /Change New Gym's plan/ });
    expect(dialog).toHaveTextContent("New Gym has not paid yet. Its first invoice is replaced with one for the new plan.");
    await user.click(within(dialog).getByRole("radio", { name: /Growth/ }));
    await user.type(within(dialog).getByLabelText("Reason for this change"), "Owner chose Growth on the phone.");
    await user.click(within(dialog).getByRole("button", { name: "Change plan" }));
    expect(state.api.updatePlatformGym).toHaveBeenCalledWith({ gymId: "gym-new", plan: "Growth", reason: "Owner chose Growth on the phone." });
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
