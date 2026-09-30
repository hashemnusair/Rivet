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
    expect(tabs).toEqual(["My profile", "Public profile", "Staff", "Roles & access", "Daily checklists"]);
    expect(screen.queryByRole("tab", { name: "Gym details" })).not.toBeInTheDocument();

    // The URL still names Gym details; the section says why it is closed instead of an editable form that would be refused.
    expect(screen.getByRole("status")).toHaveTextContent("You don't have access");
    expect(screen.getByRole("status")).toHaveTextContent("needs the “Manage settings” access");
    expect(screen.queryByLabelText("Gym name")).not.toBeInTheDocument();
  });

  it("gives a staff role access to personal settings while keeping organization settings closed", async () => {
    await renderWithApp(<SettingsPageInner />, { role: "receptionist" });

    expect(await screen.findByRole("heading", { name: "Settings" })).toBeInTheDocument();
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["My profile"]);
    expect(screen.getByRole("status")).toHaveTextContent("You don't have access");

    // The account section is available without widening the receptionist's
    // organization-management permissions.
    const profileTab = await screen.findByRole("tab", { name: "My profile" });
    await profileTab.click();
    expect(await screen.findByRole("heading", { name: "My profile", level: 2 })).toBeInTheDocument();
    expect(await screen.findByLabelText(/Your name/)).toBeInTheDocument();
  });

  it("lets the owner reach every section", async () => {
    await renderWithApp(<SettingsPageInner />);
    expect(await screen.findByRole("heading", { name: "Gym details", level: 2 })).toBeInTheDocument();
    expect(screen.getAllByRole("tab")).toHaveLength(17);
  });
});
