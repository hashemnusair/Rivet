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
  it("keeps renewal recovery off until an authorized user enables it", async () => {
    const user = userEvent.setup();
    const { api } = await renderWithApp(<NotificationsSection />);
    const update = vi.spyOn(api, "updateNotificationSettings");
    const renewalRecovery = await screen.findByRole("switch", { name: "Renewal recovery" });

    expect(renewalRecovery).toHaveAttribute("data-state", "unchecked");
    await user.click(renewalRecovery);

    await waitFor(() => {
      expect(update).toHaveBeenCalledWith(expect.objectContaining({ renewalRecoveryEnabled: true }));
      expect(renewalRecovery).toHaveAttribute("data-state", "checked");
    });
  });
});
