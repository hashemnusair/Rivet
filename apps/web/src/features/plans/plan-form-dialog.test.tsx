import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PlanFormDialog } from "./plan-form-dialog";

const { mutate } = vi.hoisted(() => ({ mutate: vi.fn() }));

vi.mock("@/lib/providers/app-providers", () => ({ useApp: () => ({ session: { organization: { currency: "JOD" } } }) }));
vi.mock("@/lib/hooks/use-api", () => ({
  useInvalidate: () => vi.fn(async () => undefined),
  useApiQuery: () => ({
    data: [
      { id: "branch-main", name: "Main", status: "active" },
      { id: "branch-new", name: "New Branch", status: "active" },
    ],
    isLoading: false,
  }),
  useApiMutation: () => ({ mutate, isPending: false }),
}));

beforeAll(() => {
  vi.stubGlobal("ResizeObserver", class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
});

describe("PlanFormDialog branch access", () => {
  it("loads selected-branch choices from the live branch query", async () => {
    const user = userEvent.setup();
    render(<PlanFormDialog open onOpenChange={vi.fn()} />);

    await user.click(screen.getByText("Selected branches"));

    expect(screen.getByRole("checkbox", { name: "Main" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "New Branch" })).toBeInTheDocument();
  });
});

describe("PlanFormDialog typed values", () => {
  beforeEach(() => mutate.mockClear());

  async function fillBasics(user: ReturnType<typeof userEvent.setup>, name = "Monthly") {
    await user.type(screen.getByLabelText(/Plan name/), name);
    await user.type(screen.getByLabelText(/Code/), "M1");
    await user.type(screen.getByLabelText(/Price/), "40");
  }

  it("refuses exponent and hex text for a day count instead of coercing it", async () => {
    const user = userEvent.setup();
    render(<PlanFormDialog open onOpenChange={vi.fn()} />);
    await fillBasics(user);
    const days = screen.getByLabelText(/Length \(days\)/);
    for (const raw of ["1e3", "0x10", "1.5"]) {
      await user.clear(days);
      await user.type(days, raw);
      await user.click(screen.getByRole("button", { name: "Add plan" }));
      expect(await screen.findByText("Use a whole number")).toBeInTheDocument();
    }
    expect(mutate).not.toHaveBeenCalled();
  });

  it("treats a cleared optional validity as not set rather than zero", async () => {
    const user = userEvent.setup();
    render(<PlanFormDialog open onOpenChange={vi.fn()} />);
    await fillBasics(user);
    await user.click(screen.getByText("By visits"));
    await user.type(screen.getByLabelText(/Number of visits/), "10");
    const validity = screen.getByLabelText(/Use within/);
    await user.type(validity, "90");
    await user.clear(validity);
    await user.click(screen.getByRole("button", { name: "Add plan" }));
    await waitFor(() => expect(mutate).toHaveBeenCalledWith(expect.objectContaining({ kind: "visits", visitAllowance: 10, visitValidityDays: undefined })));
  });

  it("does not accept a plan name of spaces", async () => {
    const user = userEvent.setup();
    render(<PlanFormDialog open onOpenChange={vi.fn()} />);
    await fillBasics(user, "   ");
    await user.click(screen.getByRole("button", { name: "Add plan" }));
    expect(await screen.findByText("Enter a plan name")).toBeInTheDocument();
    expect(mutate).not.toHaveBeenCalled();
  });
});
