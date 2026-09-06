import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithApp, resetApiForTests } from "@/test/harness";
import { SettingsPageInner } from "@/features/settings/settings-page-inner";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/settings",
  useSearchParams: () => new URLSearchParams("section=organization"),
}));

afterEach(() => resetApiForTests());

describe("Settings sections follow the signed-in role's permissions", () => {
  it("shows a manager with staff rights only the sections their role can save, and explains a deep link it cannot", async () => {
    await renderWithApp(<SettingsPageInner />, {
      role: "manager",
      prepare: async (api) => {
        const settings = await api.getOrganizationSettings();
        const manager = settings.roles.find((role) => role.key === "manager")!;
        await api.updateRolePermissions("manager", { permissions: [...manager.permissions, "users.manage"] });
      },
    });

    expect(await screen.findByRole("heading", { name: "Settings" })).toBeInTheDocument();
    const tabs = screen.getAllByRole("tab").map((tab) => tab.textContent);
    expect(tabs).toEqual(["Public profile", "Users", "Roles & permissions", "Daily checklists"]);
    expect(screen.queryByRole("tab", { name: "Organization" })).not.toBeInTheDocument();

    // The URL still names Organization; the section says why it is closed instead of an editable form that would be refused.
    expect(screen.getByRole("status")).toHaveTextContent("Not allowed for this role");
    expect(screen.getByRole("status")).toHaveTextContent("needs the Manage settings permission");
    expect(screen.queryByLabelText("Organization name")).not.toBeInTheDocument();
  });

  it("lets the owner reach every section", async () => {
    await renderWithApp(<SettingsPageInner />);
    expect(await screen.findByRole("heading", { name: "Organization", level: 2 })).toBeInTheDocument();
    expect(screen.getAllByRole("tab")).toHaveLength(16);
  });
});
