import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithApp, resetApiForTests } from "@/test/harness";
import ChecklistsPage from "./page";
import { afterEach } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/checklists",
  useSearchParams: () => new URLSearchParams(),
}));

afterEach(() => resetApiForTests());

describe("daily checklist staff flow", () => {
  it("shows today's runs and records a one-tap completion with actor and time", async () => {
    const user = userEvent.setup();
    await renderWithApp(<ChecklistsPage />);

    const opening = await screen.findByRole("region", { name: "Opening walkthrough checklist" });
    expect(within(opening).getByText("0/4")).toBeInTheDocument();

    await user.click(within(opening).getByRole("button", { name: 'Mark "Unlock doors and turn on lights" done' }));
    await waitFor(() => expect(within(opening).getByText(/Done by .* at /)).toBeInTheDocument());
    expect(within(opening).getByText("1/4")).toBeInTheDocument();
  });

  it("requires a reason to fail a required item and offers escalation only after failure", async () => {
    const user = userEvent.setup();
    await renderWithApp(<ChecklistsPage />);
    const opening = await screen.findByRole("region", { name: "Opening walkthrough checklist" });

    const row = within(opening).getByRole("button", { name: 'Mark "Check changing rooms are clean" done' }).closest("li")!;
    await user.click(within(row).getByRole("button", { name: "Problem?" }));

    const dialog = await screen.findByRole("dialog", { name: "Report a problem" });
    const save = within(dialog).getByRole("button", { name: "Save" });
    expect(save).toBeDisabled();
    await user.type(within(dialog).getByLabelText(/Why\?/), "Shower drain is blocked.");
    await user.click(save);

    await waitFor(() => expect(within(opening).getByText(/Failed by .* — Shower drain is blocked\./)).toBeInTheDocument());
    expect(within(opening).getByRole("button", { name: /Create maintenance task/ })).toBeInTheDocument();
  });
});
