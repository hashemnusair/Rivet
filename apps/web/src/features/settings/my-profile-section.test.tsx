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

    const displayName = await screen.findByLabelText(/Display name/);
    await user.clear(displayName);
    await user.type(displayName, "Reception lead");
    await user.click(screen.getByRole("button", { name: "Save profile" }));

    await waitFor(() => expect(screen.getByLabelText(/Display name/)).toHaveValue("Reception lead"));
    expect((await api.getMyProfile()).name).toBe("Reception lead");
    expect((await api.getSession()).user.name).toBe("Reception lead");
  });
});
