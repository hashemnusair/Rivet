import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithApp, resetApiForTests } from "@/test/harness";
import { PlatformPromos } from "./promos.client";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), usePathname: () => "/platform/promos", useSearchParams: () => new URLSearchParams(), useParams: () => ({}) }));
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverMock);
afterEach(() => resetApiForTests());

describe("platform promos", () => {
  it("shows the website offer and creates a promo code with a reason", async () => {
    const user = userEvent.setup();
    const { api } = await renderWithApp(<PlatformPromos />);
    expect(await screen.findByText("0 of 3 free places taken")).toBeInTheDocument();
    expect(screen.getByText("No gym holds a place yet.")).toBeInTheDocument();
    const codes = screen.getByRole("region", { name: "Promo codes" });
    expect(within(codes).getByText("LAUNCH50")).toBeInTheDocument();
    expect(within(codes).getByText("50% off the first month or year")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "New promo code" }));
    const dialog = await screen.findByRole("dialog", { name: "New promo code" });
    await user.type(within(dialog).getByLabelText(/^Code/), "ramadan25");
    await user.click(within(dialog).getByRole("radio", { name: "Onboarding fee" }));
    await user.type(within(dialog).getByLabelText(/Percent \(1 to 100\)/), "25");
    await user.type(within(dialog).getByLabelText(/Why are you making this code/), "Ramadan campaign");
    await user.click(within(dialog).getByRole("button", { name: "Create code" }));

    expect(await within(codes).findByText("RAMADAN25")).toBeInTheDocument();
    expect(within(codes).getByText("25% off the onboarding fee")).toBeInTheDocument();
    expect(await api.checkPromoCode({ code: "RAMADAN25", plan: "Growth" })).toMatchObject({ valid: true, promo: { target: "onboarding", percentOff: 25 } });
  });

  it("pauses a code so gyms can no longer use it", async () => {
    const user = userEvent.setup();
    const { api } = await renderWithApp(<PlatformPromos />);
    const codes = await screen.findByRole("region", { name: "Promo codes" });
    await user.click(within(codes).getByRole("button", { name: "Pause" }));
    const dialog = await screen.findByRole("dialog", { name: "Pause LAUNCH50" });
    await user.type(within(dialog).getByRole("textbox"), "Campaign over");
    await user.click(within(dialog).getByRole("button", { name: "Pause" }));
    expect(await within(codes).findByText("Paused")).toBeInTheDocument();
    expect(await api.checkPromoCode({ code: "LAUNCH50", plan: "Starter" })).toEqual({ valid: false, reason: "paused" });
  });
});
