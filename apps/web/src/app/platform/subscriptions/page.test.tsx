import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PlatformSnapshot } from "@/lib/api/GymOSApi";
import { setApiForTests } from "@/lib/api/client";
import { MockGymOSApi } from "@/lib/mock/MockGymOSApi";
import type { MarketplaceGym } from "@/lib/public/experience-data";
import {
  default as SubscriptionsPage,
  directoryListingAllowed,
  draftFromGym,
  validateSubscriptionDraft,
} from "./page";

const state = vi.hoisted(() => ({
  gyms: [] as MarketplaceGym[],
  snapshot: undefined as PlatformSnapshot | undefined,
}));

vi.mock("@/lib/providers/experience-provider", () => ({
  usePlatformGyms: () => state.gyms,
  useExperience: () => ({
    platformSnapshot: state.snapshot,
    experienceError: undefined,
    experienceStatus: "ready",
    retryExperience: vi.fn(),
  }),
}));

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const renderCurrentPage = () => <QueryClientProvider client={client}><SubscriptionsPage /></QueryClientProvider>;
  const view = render(renderCurrentPage());
  return { ...view, rerenderPage: () => view.rerender(renderCurrentPage()) };
}

function dateFromNow(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

describe("subscription lifecycle controls", () => {
  let api: MockGymOSApi;

  beforeEach(async () => {
    Object.defineProperty(HTMLElement.prototype, "hasPointerCapture", { configurable: true, value: () => false });
    Object.defineProperty(HTMLElement.prototype, "setPointerCapture", { configurable: true, value: () => undefined });
    Object.defineProperty(HTMLElement.prototype, "releasePointerCapture", { configurable: true, value: () => undefined });
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: () => undefined });
    api = new MockGymOSApi();
    setApiForTests(api);
    state.snapshot = await api.getPlatformSnapshot();
    state.gyms = state.snapshot.gyms;
  });

  it("keeps non-operational gyms hidden even when a stale listing flag is true", () => {
    expect(directoryListingAllowed("active")).toBe(true);
    expect(directoryListingAllowed("trial")).toBe(true);
    expect(directoryListingAllowed("suspended")).toBe(false);
    expect(directoryListingAllowed("overdue")).toBe(false);
    expect(directoryListingAllowed("cancelled")).toBe(false);

    const staleSuspended = { ...state.gyms[0]!, subscriptionStatus: "suspended" as const, isPublic: true };
    expect(draftFromGym(staleSuspended).isPublic).toBe(false);

    const missingVisibility = { ...state.gyms[0]!, isPublic: undefined };
    expect(draftFromGym(missingVisibility).isPublic).toBe(false);

    const staleActive = { ...state.gyms[0]!, subscriptionStatus: "active" as const, cancelledAt: "2026-08-20T00:00:00.000Z" };
    expect(draftFromGym(staleActive).cancelledAt).toBe("");
  });

  it("requires reasons and trial end dates before confirmation", () => {
    const gym = state.gyms[0]!;
    const draft = draftFromGym(gym);
    expect(validateSubscriptionDraft(draft)).toMatchObject({ reason: expect.any(String) });
    expect(validateSubscriptionDraft({ ...draft, status: "trial", reason: "Start trial" })).toMatchObject({ trialEndsAt: "Required when starting a trial." });
    expect(validateSubscriptionDraft({ ...draft, reason: "Pause account", subscriptionStartedAt: "2026-08-20", currentPeriodEndsAt: "2026-08-19" })).toMatchObject({ currentPeriodEndsAt: expect.any(String) });

    const trialStart = dateFromNow(3);
    expect(validateSubscriptionDraft({ ...draft, status: "trial", reason: "Start trial", trialEndsAt: dateFromNow(2), subscriptionStartedAt: trialStart })).toMatchObject({ trialEndsAt: "Must be on or after the subscription start date." });
    expect(validateSubscriptionDraft({ ...draft, status: "trial", reason: "Start trial", trialEndsAt: dateFromNow(-1) })).toMatchObject({ trialEndsAt: "Must be in the future for a trial." });
    expect(validateSubscriptionDraft({ ...draft, status: "cancelled", reason: "End account", subscriptionStartedAt: trialStart, cancelledAt: dateFromNow(2) })).toMatchObject({ cancelledAt: "Must be on or after the subscription start date." });
  });

  it("requires a reason before saving a plan catalog edit", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: "Edit Starter plan" }));
    await user.click(screen.getByRole("button", { name: "Save plan" }));
    expect(screen.getByRole("alert")).toHaveTextContent("A reason is required");

    const price = screen.getByRole("textbox", { name: "Monthly price (JOD)" });
    await user.clear(price);
    await user.type(price, "80");
    await user.type(screen.getByRole("textbox", { name: "Reason for this change" }), "Updated pricing after review.");
    await user.click(screen.getByRole("button", { name: "Save plan" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("blocks audited no-op plan catalog saves", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: "Edit Starter plan" }));
    await user.type(screen.getByRole("textbox", { name: "Reason for this change" }), "Reviewed catalog values.");
    await user.click(screen.getByRole("button", { name: "Save plan" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Change at least one price or limit before saving.");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("preserves an unsaved draft when a background snapshot refresh replaces table rows", async () => {
    const user = userEvent.setup();
    const view = renderPage();

    await user.click(screen.getAllByRole("button", { name: "Manage" })[0]!);
    await user.click(screen.getByRole("combobox", { name: "Subscription status" }));
    await user.click(screen.getByRole("option", { name: /suspended/i }));
    fireEvent.change(screen.getByRole("textbox", { name: "Reason for this change" }), { target: { value: "Draft must survive refresh." } });

    state.snapshot = {
      ...state.snapshot!,
      gyms: state.snapshot!.gyms.map((gym) => gym.id === "forge-fitness" ? { ...gym, subscriptionStatusReason: "Background operator update." } : gym),
    };
    state.gyms = state.snapshot.gyms;
    view.rerenderPage();

    await waitFor(() => expect(screen.getByRole("textbox", { name: "Reason for this change" })).toHaveValue("Draft must survive refresh."));
    expect(screen.getByRole("combobox", { name: "Subscription status" })).toHaveTextContent("suspended");
  });

  it("fails closed for missing visibility and allows stale public flags to be repaired", async () => {
    const staleSuspended = { ...state.gyms[0]!, subscriptionStatus: "suspended" as const, isPublic: true };
    state.snapshot = { ...state.snapshot!, gyms: [staleSuspended, ...state.snapshot!.gyms.slice(1)] };
    state.gyms = state.snapshot.gyms;
    const updateSpy = vi.spyOn(api, "updatePlatformGym");
    const user = userEvent.setup();
    renderPage();

    expect(screen.getAllByText("Hidden", { selector: "span" }).length).toBeGreaterThan(0);
    await user.click(screen.getAllByRole("button", { name: "Manage" })[0]!);
    expect(screen.getByRole("button", { name: "Review changes" })).toBeEnabled();
    fireEvent.change(screen.getByRole("textbox", { name: "Reason for this change" }), { target: { value: "Repair stale public flag." } });
    await user.click(screen.getByRole("button", { name: "Review changes" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("gym will be hidden from member discovery");
    await user.click(screen.getByRole("button", { name: "Confirm changes" }));

    await waitFor(() => expect(updateSpy).toHaveBeenCalled());
    expect(updateSpy.mock.calls.at(-1)?.[0]).toMatchObject({ status: "suspended", isPublic: false, reason: "Repair stale public flag." });
  });

  it("keeps unprovisioned platform rows cleanup-only instead of opening subscription controls", async () => {
    const cleanupGym = state.gyms.find((gym) => gym.isProvisioned === false);
    expect(cleanupGym).toBeDefined();
    const user = userEvent.setup();
    renderPage();

    expect(screen.getByRole("button", { name: `Cleanup-only ${cleanupGym!.name}` })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Manage" })).toBeInTheDocument();

    await user.click(screen.getByRole("combobox", { name: "Gym to manage" }));
    const cleanupOption = screen.getByRole("option", { name: `${cleanupGym!.name} · Cleanup-only · not provisioned` });
    expect(cleanupOption).toHaveAttribute("aria-disabled", "true");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("guards closing a dirty dialog until the operator confirms discard", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getAllByRole("button", { name: "Manage" })[0]!);
    await user.click(screen.getByRole("combobox", { name: "Subscription status" }));
    await user.click(screen.getByRole("option", { name: /suspended/i }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(confirmSpy).toHaveBeenCalledWith("Discard the unsaved subscription changes?");

    confirmSpy.mockReturnValue(true);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    confirmSpy.mockRestore();
  });

  it("selects a gym, reviews the consequences, and persists a suspension as hidden", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getAllByRole("button", { name: "Manage" })[0]!);
    expect(screen.getByRole("dialog")).toHaveTextContent("Manage Forge Fitness Club");

    await user.click(screen.getByRole("combobox", { name: "Subscription status" }));
    await user.click(screen.getByRole("option", { name: /suspended/i }));
    fireEvent.change(screen.getByRole("textbox", { name: "Reason for this change" }), { target: { value: "Payment account is overdue." } });
    await user.click(screen.getByRole("button", { name: "Review changes" }));

    expect(screen.getByRole("dialog")).toHaveTextContent("The tenant loses public discovery");
    expect(screen.getByRole("button", { name: "Confirm changes" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Confirm changes" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(await api.getPlatformSnapshot()).toEqual(expect.objectContaining({ gyms: expect.arrayContaining([expect.objectContaining({ id: "forge-fitness", subscriptionStatus: "suspended" })]) }));
    expect(screen.getAllByText("Hidden", { selector: "span" }).length).toBeGreaterThan(0);
  });

  it("omits a stale cancellation date when reactivating a cancelled gym", async () => {
    await api.updatePlatformGym({ gymId: "forge-fitness", status: "cancelled", reason: "Customer ended service." });
    state.snapshot = await api.getPlatformSnapshot();
    state.gyms = state.snapshot.gyms;
    const updateSpy = vi.spyOn(api, "updatePlatformGym");
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getAllByRole("button", { name: "Manage" })[0]!);
    await user.click(screen.getByRole("combobox", { name: "Subscription status" }));
    await user.click(screen.getByRole("option", { name: /^active$/i }));
    fireEvent.change(screen.getByRole("textbox", { name: "Reason for this change" }), { target: { value: "Customer resumed service." } });
    await user.click(screen.getByRole("button", { name: "Review changes" }));
    await user.click(screen.getByRole("button", { name: "Confirm changes" }));

    await waitFor(() => expect(updateSpy).toHaveBeenCalled());
    const lastInput = updateSpy.mock.calls.at(-1)?.[0];
    expect(lastInput).toMatchObject({ gymId: "forge-fitness", status: "active" });
    expect(lastInput).not.toHaveProperty("cancelledAt");
  });
});
