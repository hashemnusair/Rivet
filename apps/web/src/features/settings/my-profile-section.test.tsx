import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MyProfileSection } from "@/features/settings/my-profile-section";
import { renderWithApp, resetApiForTests } from "@/test/harness";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/settings",
  useSearchParams: () => new URLSearchParams(),
}));

afterEach(() => resetApiForTests());

describe("My profile", () => {
  it("updates only the signed-in staff member and refreshes the active session", async () => {
    const user = userEvent.setup();
    const { api } = await renderWithApp(<MyProfileSection />, { role: "receptionist" });

    const displayName = await screen.findByLabelText(/Your name/);
    await user.clear(displayName);
    await user.type(displayName, "Reception lead");
    await user.click(screen.getByRole("button", { name: "Save profile" }));

    await waitFor(() => expect(screen.getByLabelText(/Your name/)).toHaveValue("Reception lead"));
    expect((await api.getMyProfile()).name).toBe("Reception lead");
    expect((await api.getSession()).user.name).toBe("Reception lead");
  });

  it("gives staff without settings access a password panel of its own, apart from the profile form", async () => {
    await renderWithApp(<MyProfileSection />, { role: "trainer" });

    const panel = await screen.findByTestId("my-password-panel");
    expect(panel.closest("#password")).not.toBeNull();
    expect(panel).toHaveTextContent("Change the password you use to sign in.");
    // The test build has no Clerk account, so it says so instead of asking for one.
    expect(panel).toHaveTextContent("You cannot change a password in this demo.");
    expect(screen.queryByLabelText("New password")).not.toBeInTheDocument();
  });
});
