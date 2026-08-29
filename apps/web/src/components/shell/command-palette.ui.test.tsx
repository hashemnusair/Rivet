import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithApp, resetApiForTests } from "@/test/harness";
import { CommandPalette } from "./command-palette";

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal("ResizeObserver", ResizeObserverMock);
HTMLElement.prototype.scrollIntoView = () => undefined;

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

afterEach(() => {
  resetApiForTests();
});

describe("CommandPalette remote search", () => {
  it("reports a failed lookup honestly and retries the same query", async () => {
    const user = userEvent.setup();
    const { api } = await renderWithApp(<CommandPalette open onOpenChange={() => undefined} />);
    vi.spyOn(api, "searchWorkspace").mockRejectedValueOnce(new Error("offline"));

    await user.type(screen.getByRole("combobox", { name: "Global search" }), "Li");

    const failure = await screen.findByRole("alert");
    expect(failure).toHaveTextContent(/workspace search is unavailable/i);
    expect(screen.queryByText(/No records, receipts, pages, or actions match/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Retry search" }));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect((await screen.findAllByText(/Lina/i)).length).toBeGreaterThan(0);
  });
});
