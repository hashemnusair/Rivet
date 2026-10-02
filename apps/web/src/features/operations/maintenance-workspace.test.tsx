import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }));
const navigation = vi.hoisted(() => ({ search: "" }));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/maintenance",
  useSearchParams: () => new URLSearchParams(navigation.search),
}));

import { MaintenanceWorkspace } from "./maintenance-workspace";
import { renderWithApp, resetApiForTests } from "@/test/harness";

afterEach(() => resetApiForTests());

beforeEach(() => {
  navigation.search = "";
  HTMLElement.prototype.scrollIntoView = vi.fn();
  HTMLElement.prototype.hasPointerCapture = vi.fn(() => false);
  HTMLElement.prototype.setPointerCapture = vi.fn();
  HTMLElement.prototype.releasePointerCapture = vi.fn();
});

async function selectBranch(user: ReturnType<typeof userEvent.setup>, branchName: string) {
  await screen.findByTestId("maintenance-workspace");
  const picker = screen.getByRole("combobox", { name: "Branch" });
  await user.click(picker);
  await user.click(await screen.findByRole("option", { name: branchName }));
  await waitFor(() => expect(picker).toHaveTextContent(branchName));
}

describe("MaintenanceWorkspace", () => {
  it("runs the branch and area maintenance workflow on its own page", async () => {
    const user = userEvent.setup();
    const { api } = await renderWithApp(<MaintenanceWorkspace />, { role: "manager" });
    expect(await screen.findByText("Choose a branch first")).toBeInTheDocument();
    await selectBranch(user, "Forge — Abdoun");
    const taskMutation = vi.spyOn(api, "upsertFacilityTask");

    expect(await screen.findByTestId("operations-facilities")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Maintenance list" })).toBeInTheDocument();
    expect(screen.getByText("Main floor inspection")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Stock & purchasing/ })).toHaveAttribute("href", expect.stringMatching(/^\/operations\?branch=/));

    await user.click(screen.getByRole("button", { name: "New job" }));
    const dialog = await screen.findByRole("dialog", { name: "Add maintenance job" });
    await user.click(within(dialog).getByRole("button", { name: /Cleaning needed/ }));
    await user.clear(within(dialog).getByRole("textbox", { name: "What needs doing?" }));
    await user.type(within(dialog).getByRole("textbox", { name: "What needs doing?" }), "Refill sanitizer station");
    await user.click(within(dialog).getByRole("button", { name: "Add job" }));
    await waitFor(() => expect(taskMutation).toHaveBeenCalledWith(expect.objectContaining({ branchId: expect.any(String), zoneId: expect.any(String), kind: "cleaning", title: "Refill sanitizer station" })));
    expect(await screen.findByText("Refill sanitizer station")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Area QR code" }));
    expect(await screen.findByRole("dialog", { name: "Area QR code" })).toBeInTheDocument();
    expect(screen.getByText(/The code only picks the area for them/i)).toBeInTheDocument();
  });

  it("opens the preselected task form from an authenticated area QR shortcut", async () => {
    navigation.search = "branch=10000000-0000-4a00-8a00-000000000002&zone=10000000-0000-4a00-8a00-000000000049&action=new-task";
    await renderWithApp(<MaintenanceWorkspace />, { role: "manager" });
    expect(await screen.findByRole("dialog", { name: "Add maintenance job" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Where in the gym?" })).toHaveTextContent("Main floor");
  });
});
