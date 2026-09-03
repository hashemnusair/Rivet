import { afterEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => undefined, replace: () => undefined, back: () => undefined }),
  usePathname: () => "/finance",
  useSearchParams: () => new URLSearchParams(),
}));

HTMLElement.prototype.hasPointerCapture = () => false;
HTMLElement.prototype.setPointerCapture = () => undefined;
HTMLElement.prototype.releasePointerCapture = () => undefined;
HTMLElement.prototype.scrollIntoView = () => undefined;

import { ManagementLedgerWorkspace } from "./management-ledger-workspace";
import { renderWithApp, resetApiForTests } from "@/test/harness";

afterEach(() => resetApiForTests());

describe("ManagementLedgerWorkspace", () => {
  it("renders the management-ledger controls and explicit empty states through the API boundary", async () => {
    await renderWithApp(<ManagementLedgerWorkspace />);

    expect(await screen.findByTestId("management-ledger-workspace")).toBeInTheDocument();
    expect(screen.getByText("Management ledger")).toBeInTheDocument();
    expect(await screen.findByText("Chart of accounts")).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("tab", { name: /source queue/i }));
    expect(await screen.findByText("Source queue is empty")).toBeInTheDocument();
    expect(screen.getByText(/not a statutory filing system/i)).toBeInTheDocument();
  });

  it("requires a concrete branch before an owner can open a manual journal", async () => {
    const user = userEvent.setup();
    const { api } = await renderWithApp(<ManagementLedgerWorkspace />);
    const session = await api.getSession();
    const branchName = session.branches[0]!.name;
    expect(screen.queryByRole("button", { name: /manual journal/i })).not.toBeInTheDocument();
    await user.click(await screen.findByRole("combobox", { name: "Ledger branch scope" }));
    await user.click(await screen.findByRole("option", { name: branchName }));

    await user.click(await screen.findByRole("button", { name: /manual journal/i }));
    expect(await screen.findByRole("dialog", { name: /post manual journal/i })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Manual journal branch" })).toHaveTextContent(branchName);
  });

  it("allows an owner to refresh the source queue in the consolidated view without exposing posting", async () => {
    const user = userEvent.setup();
    const { api } = await renderWithApp(<ManagementLedgerWorkspace />);
    const refreshSpy = vi.spyOn(api, "refreshAccountingSourceQueue");

    await user.click(await screen.findByRole("tab", { name: /source queue/i }));
    expect(await screen.findByText(/queue refresh covers all accessible branches/i)).toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: /refresh queue/i }));

    expect(refreshSpy).toHaveBeenCalledWith({ branchId: undefined });
    expect(screen.queryByRole("button", { name: /post source/i })).not.toBeInTheDocument();
  });

  it("keeps source posting actions out of a read-only manager view while preserving the queue", async () => {
    await renderWithApp(<ManagementLedgerWorkspace />, { role: "manager", prepare: async (api) => {
      const managerPermissions = (await api.switchDemoRole("manager")).permissions.filter((permission) => permission !== "accounting.post");
      await api.switchDemoRole("owner");
      await api.updateRolePermissions("manager", { permissions: managerPermissions });
    } });

    expect(await screen.findByText(/read-only for this role/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /manual journal/i })).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("tab", { name: /source queue/i }));
    expect(await screen.findByText(/read-only access/i)).toBeInTheDocument();
    expect(await screen.findByText("Source queue is empty")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /refresh queue/i })).not.toBeInTheDocument();
  });
});
