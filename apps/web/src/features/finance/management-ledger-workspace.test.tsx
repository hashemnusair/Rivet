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

  it("lets an owner open a manual journal with a consolidated scope that has no branch", async () => {
    const user = userEvent.setup();
    await renderWithApp(<ManagementLedgerWorkspace />);

    await user.click(await screen.findByRole("button", { name: /manual journal/i }));
    expect(await screen.findByRole("dialog", { name: /post manual journal/i })).toBeInTheDocument();
    const scope = screen.getByRole("combobox", { name: "Manual journal scope" });
    await user.click(scope);
    await user.click(await screen.findByRole("option", { name: "Consolidated journal" }));
    expect(screen.getByText("Consolidated journals have no branch.")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Manual journal branch" })).toBeDisabled();
  });

  it("keeps source posting actions out of the auditor view while preserving the queue", async () => {
    await renderWithApp(<ManagementLedgerWorkspace />, { role: "auditor" });

    expect(await screen.findByText(/read-only for this role/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /manual journal/i })).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("tab", { name: /source queue/i }));
    expect(await screen.findByText(/read-only access/i)).toBeInTheDocument();
    expect(await screen.findByText("Source queue is empty")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /refresh queue/i })).not.toBeInTheDocument();
  });
});
