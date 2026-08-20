import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithApp, resetApiForTests } from "@/test/harness";
import { BrandKitSection } from "./brand-kit-section";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/settings",
  useSearchParams: () => new URLSearchParams("section=brand"),
}));

afterEach(() => resetApiForTests());

describe("Brand Kit editor", () => {
  it("uses derived foreground contrast in the unsaved preview", async () => {
    const user = userEvent.setup();
    await renderWithApp(<BrandKitSection />);
    const color = await screen.findByLabelText("Primary color hex");
    const action = await screen.findByRole("button", { name: "Primary action" });

    expect(action).toHaveStyle({ color: "#ffffff" });
    await user.clear(color);
    await user.type(color, "#b88a2b");

    await waitFor(() => expect(action).toHaveStyle({ backgroundColor: "#b88a2b", color: "#15140f" }));
  });
});
