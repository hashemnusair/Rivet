import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => undefined, replace: () => undefined, back: () => undefined }),
  usePathname: () => "/operations",
  useSearchParams: () => new URLSearchParams(),
}));

import { OperationsCommandCenter } from "./operations-command-center";
import { renderWithApp, resetApiForTests } from "@/test/harness";

afterEach(() => resetApiForTests());

describe("OperationsCommandCenter", () => {
  it("loads the branch-aware operations tabs through the API boundary", async () => {
    await renderWithApp(<OperationsCommandCenter />);

    expect(await screen.findByTestId("operations-command-center")).toBeInTheDocument();
    expect(screen.getByText("Inventory & suppliers")).toBeInTheDocument();
    expect((await screen.findAllByText("Creatine monohydrate")).length).toBeGreaterThan(0);
    expect((await screen.findAllByText("Jordan Sports Supply")).length).toBeGreaterThan(0);
    expect(screen.getByText("Low-stock queue")).toBeInTheDocument();
  });

  it("lets a manager create and complete a zone-linked facility task", async () => {
    const user = userEvent.setup();
    const { api } = await renderWithApp(<OperationsCommandCenter />, { role: "manager" });

    await user.click(await screen.findByRole("tab", { name: /Facilities/ }));
    await user.click(await screen.findByRole("button", { name: /Request task/ }));
    await user.type(screen.getByPlaceholderText("Restock bathroom supplies"), "Restock towels");
    await user.click(screen.getByRole("button", { name: /Create task/ }));

    await waitFor(async () => {
      const tasks = await api.listFacilityTasks();
      expect(tasks.some((task) => task.title === "Restock towels")).toBe(true);
    });
    expect(await screen.findByText("Restock towels")).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: /Complete/ })[0]!);
    expect(await screen.findByText("completed")).toBeInTheDocument();
  });

  it("opens add and record workflows in centered accessible dialogs", async () => {
    const user = userEvent.setup();
    await renderWithApp(<OperationsCommandCenter />, { role: "manager" });

    await user.click(await screen.findByRole("button", { name: /Add supplier/ }));
    const supplierDialog = screen.getByRole("dialog", { name: "Add supplier" });
    expect(supplierDialog).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Add supplier" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /Supplier name/ })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog", { name: "Add supplier" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Record movement/ }));
    expect(screen.getByRole("dialog", { name: "Record stock movement" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog", { name: "Record stock movement" })).not.toBeInTheDocument();
  });

  it("keeps operational mutations hidden from an auditor while preserving read access", async () => {
    await renderWithApp(<OperationsCommandCenter />, { role: "auditor" });

    expect(await screen.findByText(/read-only access to operations/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Register asset/ })).not.toBeInTheDocument();
    await userEvent.setup().click(await screen.findByRole("tab", { name: /Equipment/ }));
    await screen.findByText("Machine register");
    expect(screen.queryByRole("button", { name: /Report issue/ })).not.toBeInTheDocument();
  });
});
