import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SupportPage from "./page";

const state = vi.hoisted(() => ({
  createSupportCase: vi.fn(),
  cases: [] as unknown[],
}));

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(), useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), usePathname: () => "/support" }));

vi.mock("@/lib/providers/app-providers", () => ({
  useApp: () => ({
    session: {
      user: { email: "owner@gym.example" },
      permissions: ["settings.manage"],
      branches: [{ id: "branch-1", name: "Main branch" }],
      workspace: { entitlements: { subscriptionPlan: "Starter" } },
    },
  }),
}));

vi.mock("@/lib/providers/experience-provider", () => ({
  useExperience: () => ({
    saasPlans: [
      { name: "Starter", priceMinor: 79_000, branches: 1, staff: 8, members: 500, tone: "paper" },
      { name: "Growth", priceMinor: 149_000, branches: 3, staff: 25, members: 2_500, tone: "signal" },
      { name: "Pro", priceMinor: 249_000, branches: 8, staff: 80, members: 10_000, tone: "night" },
      { name: "Enterprise", priceMinor: 500_000, branches: 25, staff: 250, members: 50_000, tone: "night" },
    ],
  }),
}));

vi.mock("@/lib/api/client", () => ({
  getApi: () => ({
    subscribeSupportCases: async (onValue: (cases: unknown[]) => void) => { onValue(state.cases); return () => undefined; },
    createSupportCase: state.createSupportCase,
  }),
}));

describe("gym support", () => {
  beforeEach(() => {
    state.cases = [];
    state.createSupportCase.mockReset();
    state.createSupportCase.mockResolvedValue({ id: "SUP-NEW", subject: "Door code", status: "open", priority: "normal", gym: "Gym A" });
  });

  it("sends plan changes to Settings instead of a support request", async () => {
    const user = userEvent.setup();
    render(<SupportPage />);
    expect(screen.getByRole("link", { name: "Change plan" })).toHaveAttribute("href", "/settings?section=subscription&change=plan");
    expect(screen.queryByRole("button", { name: "Request plan upgrade" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Ask for help" }));
    await user.type(screen.getByRole("textbox", { name: "Subject" }), "Door code");
    await user.type(screen.getByRole("textbox", { name: "What happened?" }), "The kiosk shows an error.");
    await user.click(screen.getByRole("button", { name: "Send to RIVET" }));
    await waitFor(() => expect(state.createSupportCase).toHaveBeenCalledWith(expect.objectContaining({ requestType: "general", subject: "Door code" })));
  });

  it("follows a payment the gym sent, and says what to fix when RIVET sends it back", async () => {
    state.cases = [{
      id: "SUP-PAY", gym: "Gym A", subject: "Upgrade to Growth", body: "Payment sent.", priority: "normal", status: "waiting", requestType: "billing",
      createdAt: "2026-10-19T08:00:00.000Z", updatedAt: "2026-10-19T09:00:00.000Z", messages: [],
      billing: { invoiceId: "INV-1234abcd", kind: "upgrade", planFrom: "Starter", planTo: "Growth", currency: "JOD", amountMinor: 50_000, state: "returned", returnReason: "No transfer with this reference arrived." },
    }];
    render(<SupportPage />);
    expect(await screen.findByRole("heading", { name: "Upgrade to Growth" })).toBeInTheDocument();
    const progress = screen.getByTestId("payment-progress");
    expect(progress).toHaveTextContent("Payment details sent back");
    expect(progress).toHaveTextContent("No transfer with this reference arrived.");
    expect(progress).toHaveTextContent("Plan changes to Growth");
    expect(screen.getByRole("link", { name: "Send the new details" })).toHaveAttribute("href", "/billing");
    // The English summary written for RIVET's team is not shown to the gym.
    expect(screen.queryByText("Payment sent.")).not.toBeInTheDocument();
  });
});
