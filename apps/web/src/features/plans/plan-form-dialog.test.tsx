import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { PlanFormDialog } from "./plan-form-dialog";

vi.mock("@/lib/hooks/use-api", () => ({
  useInvalidate: () => vi.fn(async () => undefined),
  useApiQuery: () => ({
    data: [
      { id: "branch-main", name: "Main", status: "active" },
      { id: "branch-new", name: "New Branch", status: "active" },
    ],
    isLoading: false,
  }),
  useApiMutation: () => ({ mutate: vi.fn(), isPending: false }),
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
