import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PlatformSaasPlan, PlatformSnapshot } from "@/lib/api/GymOSApi";
import { setApiForTests } from "@/lib/api/client";
import { MockGymOSApi } from "@/lib/mock/MockGymOSApi";
import { workspaceFeatureLabels } from "@/lib/platform/workspace-feature-labels";
import SubscriptionsPage from "./page";

const state = vi.hoisted(() => ({ snapshot: undefined as PlatformSnapshot | undefined }));

vi.mock("@/lib/providers/experience-provider", () => ({
  useExperience: () => ({
    platformSnapshot: state.snapshot,
    saasPlans: state.snapshot?.plans ?? [],
    experienceError: undefined,
    experienceStatus: "ready",
    retryExperience: vi.fn(),
  }),
}));

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><SubscriptionsPage /></QueryClientProvider>);
}

describe("pricing and entitlement catalog", () => {
  let api: MockGymOSApi;

  beforeEach(async () => {
    Object.defineProperty(HTMLElement.prototype, "hasPointerCapture", { configurable: true, value: () => false });
    Object.defineProperty(HTMLElement.prototype, "setPointerCapture", { configurable: true, value: () => undefined });
    Object.defineProperty(HTMLElement.prototype, "releasePointerCapture", { configurable: true, value: () => undefined });
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: () => undefined });
    api = new MockGymOSApi();
    setApiForTests(api);
    state.snapshot = await api.getPlatformSnapshot();
  });

  it("uses the shared workspace entitlement contract for all four tiers", () => {
    expect(workspaceFeatureLabels("Starter")).toEqual(["Gym foundation", "Revenue protection"]);
    expect(workspaceFeatureLabels("Growth")).toContain("Daily operations");
    expect(workspaceFeatureLabels("Growth")).not.toContain("Financial operating system");
    expect(workspaceFeatureLabels("Pro")).toContain("Management reporting");
    expect(workspaceFeatureLabels("Enterprise")).toEqual(["Gym foundation", "Revenue protection", "Daily operations", "Financial operating system", "Management reporting"]);
  });

  it("renders one canonical catalog without duplicate gym subscription controls", () => {
    renderPage();
    expect(screen.getByRole("heading", { name: "Pricing & entitlements" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Four tiers, one live contract" })).toBeInTheDocument();
    expect(screen.getAllByText(/branches?/i).length).toBeGreaterThan(0);
    expect(screen.queryByText("Manage a gym subscription")).not.toBeInTheDocument();
    expect(screen.queryByText("Current subscriptions")).not.toBeInTheDocument();
    expect(screen.getByText("Up to 25 branches")).toBeInTheDocument();
    expect(screen.getByText("Up to 50,000 members")).toBeInTheDocument();
  });

  it("requires an audit reason and updates the shared catalog", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("button", { name: "Edit Starter plan" }));
    await user.click(screen.getByRole("button", { name: "Save plan" }));
    expect(screen.getByRole("alert")).toHaveTextContent("A reason is required");

    const price = screen.getByRole("textbox", { name: "Monthly price (JOD)" });
    await user.clear(price);
    await user.type(price, "80");
    await user.type(screen.getByRole("textbox", { name: "Reason for this change" }), "Approved annual catalog review.");
    await user.click(screen.getByRole("button", { name: "Save plan" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await expect(api.listPublicSaasPlans()).resolves.toEqual(expect.arrayContaining([expect.objectContaining({ name: "Starter", priceMinor: 80_000 })]));
  });

  it("edits canonical workspace capabilities and persists the selected module keys", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("button", { name: "Edit Growth plan" }));
    const operations = screen.getByRole("checkbox", { name: "Daily operations" });
    expect(operations).toBeChecked();
    await user.click(operations);
    await user.type(screen.getByRole("textbox", { name: "Reason for this change" }), "Pause operations for the starter launch package.");
    await user.click(screen.getByRole("button", { name: "Save plan" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await expect(api.listPublicSaasPlans()).resolves.toEqual(expect.arrayContaining([expect.objectContaining({ name: "Growth", entitledModules: ["foundation", "revenue"] })]));
  });

  it("lets an operator package a non-default module into a lower tier with dependencies", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("button", { name: "Edit Starter plan" }));
    await user.click(screen.getByRole("checkbox", { name: "Management reporting" }));
    expect(screen.getByRole("checkbox", { name: "Daily operations" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Financial operating system" })).toBeChecked();
    await user.type(screen.getByRole("textbox", { name: "Reason for this change" }), "Package reporting for a pilot Starter customer.");
    await user.click(screen.getByRole("button", { name: "Save plan" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await expect(api.listPublicSaasPlans()).resolves.toEqual(expect.arrayContaining([expect.objectContaining({ name: "Starter", entitledModules: ["foundation", "revenue", "operations", "finance", "reporting"] })]));
  });

  it("publishes catalog edits to a public plan subscriber", async () => {
    const values: PlatformSaasPlan[][] = [];
    const unsubscribe = await api.subscribePublicSaasPlans((plans) => values.push(plans));
    const starter = values[0]!.find((plan) => plan.name === "Starter")!;
    await api.updatePlatformPlan({ name: "Starter", priceMinor: starter.priceMinor + 1_000, reason: "Public catalog review." });
    expect(values.at(-1)?.find((plan) => plan.name === "Starter")).toMatchObject({ priceMinor: starter.priceMinor + 1_000 });
    unsubscribe();
  });
});
