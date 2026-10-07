import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PlatformSaasPlan } from "@/lib/api/GymOSApi";
import type { MarketplaceGym } from "@/lib/public/experience-data";
import { LocaleProvider, useLocale } from "@/lib/i18n/provider";
import { BillGymWizard } from "./bill-gym-wizard";

const state = vi.hoisted(() => ({
  api: { updatePlatformGym: vi.fn() },
}));

vi.mock("@/lib/hooks/use-api", () => ({
  useApiMutation: (factory: (api: typeof state.api) => Promise<unknown>, options?: { onSuccess?: () => void }) => ({
    mutate: () => factory(state.api).then(() => options?.onSuccess?.()),
    isPending: false,
  }),
}));

const DAY_MS = 86_400_000;

function gym(overrides: Partial<MarketplaceGym>): MarketplaceGym {
  const subscriptionStatus = overrides.subscriptionStatus ?? "active";
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
    subscriptionStatus,
    rivetPlan: "Pro",
    billingInterval: "monthly",
    currentPeriodEndsAt: new Date(Date.now() + 16 * DAY_MS).toISOString(),
    currentTermValueMinor: subscriptionStatus === "active" ? 199_000 : undefined,
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

const plans: PlatformSaasPlan[] = [
  { name: "Starter", priceMinor: 39_000, branches: 1, staff: 3, members: 150, onboardingFeeMinor: 75_000, operationalEmails: 600, tone: "paper" },
  { name: "Growth", priceMinor: 89_000, branches: 2, staff: 8, members: 300, onboardingFeeMinor: 150_000, operationalEmails: 1_500, tone: "signal" },
  { name: "Pro", priceMinor: 199_000, branches: 5, staff: 20, members: 1_000, onboardingFeeMinor: 300_000, operationalEmails: 5_000, tone: "night" },
  { name: "Enterprise", priceMinor: 500_000, branches: 25, staff: 250, members: 50_000, onboardingFeeMinor: 0, operationalEmails: 20_000, tone: "night" },
] as PlatformSaasPlan[];

function renderWizard() {
  return render(<BillGymWizard open onOpenChange={vi.fn()} gyms={gyms} plans={plans} />);
}

function LocaleSwitch() {
  const { locale, setLocale } = useLocale();
  return <button type="button" data-testid="locale-switch" onClick={() => setLocale(locale === "en" ? "ar" : "en")}>toggle-locale</button>;
}

describe("Bill a gym wizard", () => {
  beforeEach(() => {
    state.api.updatePlatformGym.mockReset().mockResolvedValue(undefined);
    Object.defineProperty(HTMLElement.prototype, "hasPointerCapture", { configurable: true, value: () => false });
    Object.defineProperty(HTMLElement.prototype, "setPointerCapture", { configurable: true, value: () => undefined });
    Object.defineProperty(HTMLElement.prototype, "releasePointerCapture", { configurable: true, value: () => undefined });
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: () => undefined });
  });

  it("lists only provisioned gyms and filters them by search", async () => {
    const user = userEvent.setup();
    renderWizard();

    const list = screen.getByRole("listbox", { name: "Billable gyms" });
    expect(within(list).getByText("Forge Fitness")).toBeInTheDocument();
    expect(within(list).getByText("Iron Temple")).toBeInTheDocument();
    // Directory-only rows cannot be billed and never appear.
    expect(within(list).queryByText("Legacy Row")).not.toBeInTheDocument();

    await user.type(screen.getByRole("textbox", { name: "Search gyms" }), "iron");
    expect(within(list).queryByText("Forge Fitness")).not.toBeInTheDocument();
    expect(within(list).getByText("Iron Temple")).toBeInTheDocument();
  });

  it("walks an active gym to annual with the credit preview and bills without a status change", async () => {
    const user = userEvent.setup();
    renderWizard();

    await user.click(screen.getByRole("option", { name: /Forge Fitness/ }));
    expect(screen.getByText(/is currently/)).toHaveTextContent("Forge Fitness is currently active on Pro · monthly.");
    expect(within(screen.getByRole("radio", { name: /Pro/ })).getByText("Current")).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: /Annual · saves 5%/ }));
    await user.click(screen.getByRole("button", { name: /Review/ }));

    expect(screen.getByText(/An invoice for JOD.2,268\.600 \(Pro · annual, saves 5%\) is issued today\./)).toBeInTheDocument();
    const creditPreview = screen.getByText((_content, element) => element?.tagName === "LI" && element.textContent?.startsWith("A credit of") === true);
    expect(creditPreview.textContent?.replaceAll("\u00a0", " ")).toMatch(/A credit of JOD \d+\.\d{3} for 16 days remaining in the current paid term will reduce the invoice, leaving JOD [\d,]+\.\d{3} to pay\./);
    expect(screen.getByText(/no need to wait for the current term to end/)).toBeInTheDocument();

    const confirm = screen.getByRole("button", { name: /Confirm & bill/ });
    expect(confirm).toBeDisabled();
    await user.type(screen.getByLabelText("Reason for this change"), "Owner approved annual billing.");
    expect(confirm).toBeEnabled();
    await user.click(confirm);

    expect(state.api.updatePlatformGym).toHaveBeenCalledWith({
      gymId: "gym-active",
      plan: "Pro",
      billingInterval: "annual",
      reason: "Owner approved annual billing.",
    });
  });

  it("retains the selected billing terms and audit reason when the locale changes at review", async () => {
    const user = userEvent.setup();
    render(<LocaleProvider initialLocale="en"><LocaleSwitch /><BillGymWizard open onOpenChange={vi.fn()} gyms={gyms} plans={plans} /></LocaleProvider>);

    await user.click(screen.getByRole("option", { name: /Forge Fitness/ }));
    await user.click(screen.getByRole("radio", { name: /Annual · saves 5%/ }));
    await user.click(screen.getByRole("button", { name: /Review/ }));
    await user.type(screen.getByLabelText("Reason for this change"), "Owner approved annual billing.");

    fireEvent.click(screen.getByTestId("locale-switch"));

    expect(screen.getByText(/فاتورة بقيمة/)).toHaveTextContent("سنوي مع توفير 5٪");
    expect(screen.getByLabelText("سبب التغيير")).toHaveValue("Owner approved annual billing.");
    expect(screen.getByRole("button", { name: "تأكيد الفاتورة" })).toBeEnabled();
    expect(screen.queryByText(/An invoice for JOD/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "تأكيد الفاتورة" }));
    expect(state.api.updatePlatformGym).toHaveBeenCalledWith({ gymId: "gym-active", plan: "Pro", billingInterval: "annual", reason: "Owner approved annual billing." });
  });

  it("reactivates a suspended gym with an explicit active status and no credit line", async () => {
    const user = userEvent.setup();
    renderWizard();

    await user.click(screen.getByRole("option", { name: /Iron Temple/ }));
    await user.click(screen.getByRole("button", { name: /Review/ }));

    expect(screen.getByText(/reactivates Iron Temple/)).toBeInTheDocument();
    expect(screen.getByText(/An invoice for JOD.89\.000 \(Growth · monthly\) is issued today\./)).toBeInTheDocument();
    expect(screen.queryByText(/are credited/)).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("Reason for this change"), "Reactivate after payment plan agreed.");
    await user.click(screen.getByRole("button", { name: /Confirm & bill/ }));

    expect(state.api.updatePlatformGym).toHaveBeenCalledWith({
      gymId: "gym-suspended",
      plan: "Growth",
      billingInterval: "monthly",
      status: "active",
      reason: "Reactivate after payment plan agreed.",
    });
  });

  it("opens directly on the plan step when a gym is preselected", () => {
    render(<BillGymWizard open onOpenChange={vi.fn()} gyms={gyms} plans={plans} initialGymId="gym-suspended" />);

    expect(screen.queryByRole("listbox", { name: "Billable gyms" })).not.toBeInTheDocument();
    expect(screen.getByText(/is currently/)).toHaveTextContent("Iron Temple is currently suspended on Growth · monthly.");
  });

  it("shows the captured one-time onboarding fee in the first invoice preview", async () => {
    const user = userEvent.setup();
    const trialGym = gym({ id: "gym-first-term", name: "New Gym", rivetPlan: "Starter", subscriptionStatus: "trial", currentPeriodEndsAt: undefined, pendingOnboardingFeeMinor: 75_000 });
    render(<BillGymWizard open onOpenChange={vi.fn()} gyms={[trialGym]} plans={plans} />);

    await user.click(screen.getByRole("option", { name: /New Gym/ }));
    await user.click(screen.getByRole("button", { name: /Review/ }));

    expect(screen.getByText(/An invoice for JOD.114\.000 \(Starter · monthly\) is issued today\./)).toBeInTheDocument();
    expect(screen.getByText(/One-time onboarding fee: JOD.75\.000\. It is included in the invoice above\./)).toBeInTheDocument();
  });

  it("refuses to bill an active gym for the exact plan and cadence it already has", async () => {
    const user = userEvent.setup();
    renderWizard();

    await user.click(screen.getByRole("option", { name: /Forge Fitness/ }));
    await user.click(screen.getByRole("button", { name: /Review/ }));

    expect(screen.getByText(/already active on exactly this plan and billing — there is nothing to bill/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Reason for this change")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Confirm & bill/ })).toBeDisabled();
    expect(state.api.updatePlatformGym).not.toHaveBeenCalled();
  });
});
