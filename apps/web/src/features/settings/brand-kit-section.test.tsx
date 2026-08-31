import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TenantBrandProvider } from "@/components/shell/tenant-brand-provider";
import { useApp } from "@/lib/providers/app-providers";
import { renderWithApp, resetApiForTests } from "@/test/harness";
import { BrandKitSection } from "./brand-kit-section";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/settings",
  useSearchParams: () => new URLSearchParams("section=brand"),
}));

afterEach(() => resetApiForTests());

function ShellBrandProbe() {
  const { session } = useApp();
  return <output data-testid="shell-brand" data-palette={session?.organization.brand?.paletteKey ?? "none"} data-logo={session?.organization.brand?.logoUrl ?? "none"} />;
}

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

  it("persists palette and logo changes and applies them to the authenticated shell", async () => {
    const user = userEvent.setup();
    const { api } = await renderWithApp(
      <TenantBrandProvider>
        <BrandKitSection />
        <ShellBrandProbe />
      </TenantBrandProvider>,
    );

    await user.click(await screen.findByRole("radio", { name: "gold palette" }));
    const logo = new File(["logo"], "workspace-logo.png", { type: "image/png" });
    await user.upload(await screen.findByLabelText("Upload workspace logo"), logo);
    const save = await screen.findByRole("button", { name: "Save Brand Kit" });
    await waitFor(() => expect(save).toBeEnabled());
    await user.click(save);

    await waitFor(() => expect(screen.getByTestId("shell-brand")).toHaveAttribute("data-palette", "gold"));
    expect(screen.getByTestId("shell-brand").parentElement).toHaveStyle({ "--tenant-brand-primary": "#b88a2b" });
    expect(screen.getByTestId("shell-brand")).toHaveAttribute("data-logo", expect.stringContaining("mock-media://"));
    await expect(api.getBrandKit()).resolves.toMatchObject({ paletteKey: "gold", primaryColor: "#b88a2b", logoAltText: "Forge Fitness Club logo" });
  });

  it("reveals the save bar only after there are edits", async () => {
    const user = userEvent.setup();
    await renderWithApp(<BrandKitSection />);

    expect(screen.queryByRole("button", { name: "Save Brand Kit" })).not.toBeInTheDocument();
    await user.click(await screen.findByRole("radio", { name: "gold palette" }));
    expect(await screen.findByRole("button", { name: "Save Brand Kit" })).toBeEnabled();
    expect(screen.getByRole("status")).toHaveTextContent("Unsaved changes");
  });
});
