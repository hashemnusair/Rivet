import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithApp, resetApiForTests } from "@/test/harness";
import { NotificationsSection } from "./settings-sections";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/settings",
  useSearchParams: () => new URLSearchParams("section=notifications"),
}));

afterEach(() => resetApiForTests());

describe("NotificationsSection", () => {
  it("keeps renewal recovery off until an authorized user enables it and saves", async () => {
    const user = userEvent.setup();
    const { api } = await renderWithApp(<NotificationsSection />);
    const update = vi.spyOn(api, "updateNotificationSettings");
    const renewalRecovery = await screen.findByRole("switch", { name: "Renewal recovery" });

    expect(renewalRecovery).toHaveAttribute("data-state", "unchecked");
    expect(screen.queryByRole("button", { name: "Save notifications" })).not.toBeInTheDocument();
    await user.click(renewalRecovery);

    // Flipping the switch is a draft; nothing reaches the server until Save.
    expect(renewalRecovery).toHaveAttribute("data-state", "checked");
    expect(update).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("Unsaved changes");
    await user.click(screen.getByRole("button", { name: "Save notifications" }));

    await waitFor(() => {
      expect(update).toHaveBeenCalledWith(expect.objectContaining({ renewalRecoveryEnabled: true }));
      expect(renewalRecovery).toHaveAttribute("data-state", "checked");
    });
    await waitFor(() => expect(screen.queryByRole("button", { name: "Save notifications" })).not.toBeInTheDocument());
  });

  it("restores the saved values on discard", async () => {
    const user = userEvent.setup();
    const { api } = await renderWithApp(<NotificationsSection />);
    const update = vi.spyOn(api, "updateNotificationSettings");
    const cashVariance = await screen.findByRole("switch", { name: "Cash variance" });
    const before = cashVariance.getAttribute("data-state");
    await user.click(cashVariance);
    expect(cashVariance).not.toHaveAttribute("data-state", before ?? "");
    await user.click(screen.getByRole("button", { name: "Discard" }));
    expect(cashVariance).toHaveAttribute("data-state", before ?? "");
    expect(update).not.toHaveBeenCalled();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
