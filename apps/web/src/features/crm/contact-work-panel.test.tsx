import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { LogContactDialog } from "./contact-work-panel";

vi.mock("@/lib/hooks/use-api", () => ({
  useApiMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useInvalidate: () => vi.fn(),
}));

vi.mock("@/lib/providers/app-providers", () => ({
  useApp: () => ({ session: { organization: { timezone: "Asia/Amman" } } }),
}));

describe("LogContactDialog", () => {
  it("opens the contact form in a centered accessible dialog", async () => {
    const user = userEvent.setup();
    render(<LogContactDialog subject="lead" leadId="lead-1" currentStage="contacted" />);

    await user.click(screen.getByRole("button", { name: "Log contact" }));

    expect(screen.getByRole("dialog", { name: "Log contact" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Call outcome" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Notes" })).toBeInTheDocument();
  });
});
