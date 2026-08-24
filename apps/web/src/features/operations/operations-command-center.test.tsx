import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
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

describe("OperationsCommandCenter", () => {
  it("starts on a simple inventory tab and hides the old tutorial and extra workflows", async () => {
    await renderWithApp(<OperationsCommandCenter />);

    expect(await screen.findByTestId("operations-command-center")).toBeInTheDocument();
    expect(screen.getAllByRole("tab")).toHaveLength(2);
    expect(screen.getByRole("tab", { name: /Inventory/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: /Checkout/ })).toHaveAttribute("aria-selected", "false");
    expect(await screen.findByRole("heading", { name: "Inventory" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Low-stock alerts" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Available" })).toBeInTheDocument();
    expect(screen.queryByText(/How Operations works/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /Facilities/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /Equipment/ })).not.toBeInTheDocument();
  });

  it("flips to checkout in place and returns to inventory without route navigation", async () => {
    const user = userEvent.setup();
    await renderWithApp(<OperationsCommandCenter />);

    await user.click(await screen.findByRole("tab", { name: /Checkout/ }));
    expect(await screen.findByTestId("retail-checkout")).toBeInTheDocument();
    expect(router.push).not.toHaveBeenCalled();
    expect(screen.getByRole("tab", { name: /Checkout/ })).toHaveAttribute("aria-selected", "true");

    await user.click(screen.getByRole("tab", { name: /Inventory/ }));
    expect(await screen.findByTestId("operations-inventory")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Inventory/ })).toHaveAttribute("aria-selected", "true");
  });

  it("opens item, supplier, and purchase-order workflows in centered dialogs", async () => {
    const user = userEvent.setup();
    await renderWithApp(<OperationsCommandCenter />, { role: "manager" });

    await user.click(await screen.findByRole("button", { name: /^Suppliers$/ }));
    expect(screen.getByRole("dialog", { name: "Suppliers" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^Add supplier$/ }));
    expect(screen.getByRole("dialog", { name: "Add supplier" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Suppliers" })).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /Supplier name/ })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    await user.click(screen.getByRole("button", { name: /^Add item$/ }));
    expect(screen.getByRole("dialog", { name: "Add stock item" })).toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: /Selling price/ })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    await user.click(screen.getByRole("button", { name: /Purchase orders/ }));
    expect(screen.getByRole("dialog", { name: "Purchase orders" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /New purchase order/ }));
    expect(screen.getByRole("dialog", { name: "Create purchase order" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Purchase orders" })).not.toBeInTheDocument();
  });

  it("requires the item name before permanently deleting a product", async () => {
    const user = userEvent.setup();
    const { api } = await renderWithApp(<OperationsCommandCenter />, { role: "manager" });
    const deleteProduct = vi.spyOn(api, "deleteProduct");

    await user.click(await screen.findByRole("button", { name: "Edit Creatine monohydrate" }));
    await user.click(screen.getByRole("button", { name: /Delete item permanently/ }));
    const dialog = screen.getByRole("dialog", { name: "Delete Creatine monohydrate permanently?" });
    expect(dialog).toHaveTextContent("frees its SKU for reuse");
    expect(dialog).toHaveTextContent("read-only records");
    const deleteButton = screen.getByRole("button", { name: "Delete permanently" });
    expect(deleteButton).toBeDisabled();
    await user.type(screen.getByRole("textbox", { name: /Type Creatine monohydrate to confirm/ }), "Creatine monohydrate");
    expect(deleteButton).toBeDisabled();
    await user.type(screen.getByRole("textbox", { name: "Reason" }), "No longer sold");
    expect(deleteButton).toBeEnabled();

    await user.click(deleteButton);
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Delete Creatine monohydrate permanently?" })).not.toBeInTheDocument());
    await waitFor(() => expect(screen.queryByRole("button", { name: "Edit Creatine monohydrate" })).not.toBeInTheDocument());
    expect(deleteProduct).toHaveBeenCalledWith(expect.objectContaining({ productId: expect.any(String), confirmation: "Creatine monohydrate", reason: "No longer sold" }));
    expect((await api.listProducts()).some((product) => product.name === "Creatine monohydrate")).toBe(false);
    expect(router.push).not.toHaveBeenCalled();
  });

  it("keeps inventory readable while hiding management actions for reception", async () => {
    await renderWithApp(<OperationsCommandCenter />, { role: "receptionist" });

    expect(await screen.findByText(/read-only access to inventory/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Add item$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Add supplier$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Purchase order/ })).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Checkout/ })).toBeInTheDocument();
  });

  it("retains the purchase order list and its status context", async () => {
    await renderWithApp(<OperationsCommandCenter />, { role: "manager" });

    await userEvent.setup().click(await screen.findByRole("button", { name: /Purchase orders/ }));
    expect(await screen.findByRole("heading", { name: "Purchase orders" })).toBeInTheDocument();
    expect(screen.getByText(/Approve an order to reserve stock/)).toBeInTheDocument();
  });
});
