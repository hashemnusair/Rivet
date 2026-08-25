import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/operations",
  useSearchParams: () => new URLSearchParams(),
}));

import { OperationsCommandCenter } from "./operations-command-center";
import { renderWithApp, resetApiForTests } from "@/test/harness";

afterEach(() => resetApiForTests());

beforeEach(() => {
  HTMLElement.prototype.scrollIntoView = vi.fn();
  HTMLElement.prototype.hasPointerCapture = vi.fn(() => false);
  HTMLElement.prototype.setPointerCapture = vi.fn();
  HTMLElement.prototype.releasePointerCapture = vi.fn();
});

async function selectBranch(user: ReturnType<typeof userEvent.setup>, branchName?: string) {
  await screen.findByTestId("operations-command-center");
  const picker = screen.getByRole("combobox", { name: "Operations branch" });
  await user.click(picker);
  const options = await screen.findAllByRole("option");
  const option = branchName ? options.find((candidate) => candidate.textContent === branchName) : options.find((candidate) => candidate.textContent !== "All branches");
  if (!option) throw new Error("No concrete branch option was rendered.");
  await user.click(option);
  await waitFor(() => expect(picker).not.toHaveTextContent("All branches"));
}

describe("OperationsCommandCenter", () => {
  it("starts with a clear branch comparison view and compact inventory actions", async () => {
    await renderWithApp(<OperationsCommandCenter />);

    expect(await screen.findByTestId("operations-command-center")).toBeInTheDocument();
    expect(screen.getAllByRole("tab")).toHaveLength(3);
    expect(screen.getByRole("tab", { name: /Inventory/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: /Equipment/ })).toHaveAttribute("aria-selected", "false");
    expect(screen.getByRole("tab", { name: /Checkout/ })).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "Operations branch" })).toHaveTextContent("All branches");
    expect(screen.getByText(/Compare stock across branches/)).toBeInTheDocument();
    expect(await screen.findByRole("columnheader", { name: "Available" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Selling price" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Running low" })).not.toBeInTheDocument();
    expect(screen.queryByText(/How Operations works|Refill to|Delivery time|Supplier unit cost|projected at delivery/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Select a branch above to add items/)).toBeInTheDocument();
  });

  it("uses the selected branch for independent inventory and enables checkout", async () => {
    const user = userEvent.setup();
    const { api } = await renderWithApp(<OperationsCommandCenter />);
    const listInventory = vi.spyOn(api, "listInventory");

    await selectBranch(user);
    const session = await api.getSession();
    const selectedBranch = session.activeBranchId;
    expect(selectedBranch).toBeTruthy();
    await waitFor(() => expect(listInventory).toHaveBeenCalledWith(expect.objectContaining({ branchId: selectedBranch })));
    expect(screen.getByRole("tab", { name: /Checkout/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add item" })).toBeEnabled();
    expect(screen.getByRole("combobox", { name: "Operations branch" })).toHaveTextContent(session.branches.find((branch) => branch.id === selectedBranch)?.name ?? "branch");

    await user.click(screen.getByRole("tab", { name: /Checkout/ }));
    expect(await screen.findByTestId("retail-checkout")).toBeInTheDocument();
    expect(router.push).not.toHaveBeenCalled();
  });

  it("opens a centered transfer dialog and submits the selected source and destination branches", async () => {
    const user = userEvent.setup();
    const { api } = await renderWithApp(<OperationsCommandCenter />);
    await selectBranch(user, "Forge — Abdoun");
    const transferMutation = vi.spyOn(api, "transferInventory");

    await user.click(screen.getByRole("button", { name: "Move stock" }));
    const dialog = await screen.findByRole("dialog", { name: "Move stock to another branch" });
    expect(dialog).toBeInTheDocument();
    await user.click(within(dialog).getByRole("combobox", { name: "Transfer destination" }));
    await user.click(await screen.findByRole("option", { name: "Forge — Sweifieh" }));
    await user.clear(within(dialog).getByRole("spinbutton", { name: "Transfer quantity" }));
    await user.type(within(dialog).getByRole("spinbutton", { name: "Transfer quantity" }), "2");
    await user.type(within(dialog).getByRole("textbox", { name: "Transfer reason" }), "Balance the Abdoun branch");
    await user.click(within(dialog).getByRole("button", { name: "Move stock" }));

    await waitFor(() => expect(transferMutation).toHaveBeenCalledWith(expect.objectContaining({ sourceBranchId: expect.any(String), destinationBranchId: expect.any(String), quantity: 2, reason: "Balance the Abdoun branch", idempotencyKey: expect.stringMatching(/^inventory-transfer-/) })));
    expect(transferMutation.mock.calls[0]?.[0].sourceBranchId).toBe((await api.getSession()).activeBranchId);
  });

  it("switches between inventory and equipment without leaving the page", async () => {
    const user = userEvent.setup();
    await renderWithApp(<OperationsCommandCenter />);
    await selectBranch(user);

    await user.click(screen.getByRole("tab", { name: /Equipment/ }));
    expect(await screen.findByTestId("operations-equipment")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Machine register" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Issue history" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Work orders" })).toBeInTheDocument();
    expect(screen.getByText("Commercial treadmill")).toBeInTheDocument();
    expect(router.push).not.toHaveBeenCalled();

    await user.click(screen.getByRole("tab", { name: /Inventory/ }));
    expect(await screen.findByTestId("operations-inventory")).toBeInTheDocument();
  });

  it("keeps equipment writes in centered dialogs and records issue and work-order changes", async () => {
    const user = userEvent.setup();
    const { api } = await renderWithApp(<OperationsCommandCenter />, { role: "manager" });
    await selectBranch(user);
    await user.click(screen.getByRole("tab", { name: /Equipment/ }));

    await user.click(await screen.findByRole("button", { name: "Edit Commercial treadmill" }));
    expect(screen.getByRole("dialog", { name: "Edit machine" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Machine name" })).toHaveValue("Commercial treadmill");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    const issueMutation = vi.spyOn(api, "reportEquipmentIssue");
    await user.click(screen.getByRole("button", { name: "Report issue" }));
    expect(screen.getByRole("dialog", { name: "Report machine issue" })).toBeInTheDocument();
    await user.type(screen.getByRole("textbox", { name: "Issue title" }), "Display flickers");
    await user.click(screen.getByRole("button", { name: "Report issue" }));
    await waitFor(() => expect(issueMutation).toHaveBeenCalledWith(expect.objectContaining({ title: "Display flickers", branchId: expect.any(String), assetId: expect.any(String) })));
    await waitFor(() => expect(screen.getByText("Display flickers")).toBeInTheDocument());

    const orderMutation = vi.spyOn(api, "upsertEquipmentWorkOrder");
    await user.click(screen.getByRole("button", { name: "Open work order" }));
    expect(screen.getByRole("dialog", { name: "Open work order" })).toBeInTheDocument();
    await user.type(screen.getByRole("textbox", { name: "Description" }), "Inspect display wiring");
    await user.click(screen.getByRole("button", { name: "Open work order" }));
    await waitFor(() => expect(orderMutation).toHaveBeenCalledWith(expect.objectContaining({ description: "Inspect display wiring", status: "draft" })));
    await waitFor(() => expect(screen.getByText("Inspect display wiring")).toBeInTheDocument());
    const draftOrder = screen.getByText("Inspect display wiring").parentElement?.parentElement?.parentElement;
    expect(draftOrder).toBeTruthy();
    expect(within(draftOrder as HTMLElement).getByRole("button", { name: "Approve" })).toBeInTheDocument();
    expect(within(draftOrder as HTMLElement).queryByRole("button", { name: "Start work" })).not.toBeInTheDocument();
    expect(within(draftOrder as HTMLElement).getByRole("button", { name: "Cancel order" })).toBeInTheDocument();
  });

  it("allows managers to move a machine issue through investigation and resolution", async () => {
    const user = userEvent.setup();
    const { api } = await renderWithApp(<OperationsCommandCenter />, { role: "manager" });
    await selectBranch(user);
    await user.click(screen.getByRole("tab", { name: /Equipment/ }));
    const issueMutation = vi.spyOn(api, "updateEquipmentIssue");

    expect(screen.getByRole("button", { name: "Mark active" })).toBeDisabled();
    expect(screen.getByText(/Resolve the out-of-service issue below before marking active/i)).toBeInTheDocument();
    const resolve = await screen.findByRole("button", { name: "Resolve issue" });
    await user.click(resolve);
    await waitFor(() => expect(issueMutation).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ status: "resolved", safetyStatus: "safe_to_operate" })));
  });

  it("opens item, supplier, and purchase-order workflows only after a branch is selected", async () => {
    const user = userEvent.setup();
    await renderWithApp(<OperationsCommandCenter />, { role: "manager" });
    await screen.findByRole("columnheader", { name: "Available" });
    expect(screen.getByRole("button", { name: "Add item" })).toBeDisabled();
    await selectBranch(user);

    await user.click(screen.getByRole("button", { name: "Suppliers" }));
    expect(screen.getByRole("dialog", { name: "Suppliers" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add supplier" }));
    expect(screen.getByRole("dialog", { name: "Add supplier" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    await user.click(screen.getByRole("button", { name: "Add item" }));
    expect(screen.getByRole("dialog", { name: "Add stock item" })).toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: "Available quantity" })).toHaveValue(0);
    expect(screen.getByRole("spinbutton", { name: /Selling price/ })).toBeInTheDocument();
    expect(screen.queryByText(/Refill to|Delivery time|Supplier unit cost|Preferred supplier/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    await user.click(screen.getByRole("button", { name: "Purchase orders" }));
    expect(screen.getByRole("dialog", { name: "Purchase orders" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "New purchase order" }));
    expect(screen.getByRole("dialog", { name: "Create purchase order" })).toBeInTheDocument();
    await user.click(screen.getByRole("combobox", { name: "Purchase order source" }));
    await user.click(await screen.findByRole("option", { name: /Private \/ bought elsewhere/ }));
    expect(screen.getByRole("status")).toHaveTextContent(/source name will not be recorded/i);
  });

  it("edits selected-branch availability without sending removed product fields", async () => {
    const user = userEvent.setup();
    const { api } = await renderWithApp(<OperationsCommandCenter />, { role: "manager" });
    await selectBranch(user);
    const upsertProduct = vi.spyOn(api, "upsertProduct");
    await user.click(await screen.findByRole("button", { name: "Edit Creatine monohydrate" }));
    const available = screen.getByRole("spinbutton", { name: "Available quantity" });
    await user.clear(available);
    await user.type(available, "24");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(upsertProduct).toHaveBeenCalledWith(expect.objectContaining({ branchId: expect.any(String), availableQuantity: 24 })));
    const submitted = upsertProduct.mock.calls.at(-1)?.[0];
    expect(submitted).not.toHaveProperty("targetLevel");
    expect(submitted).not.toHaveProperty("supplierLeadTimeDays");
    expect(submitted).not.toHaveProperty("defaultUnitCost");
  });

  it("keeps destructive and management actions hidden for read-only staff", async () => {
    const user = userEvent.setup();
    await renderWithApp(<OperationsCommandCenter />, { role: "receptionist" });
    await selectBranch(user);
    expect(await screen.findByText(/read-only access to operations/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add item" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Suppliers" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: /Equipment/ }));
    expect(await screen.findByText(/read-only access to operations/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Report issue" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open work order" })).not.toBeInTheDocument();
  });
});
