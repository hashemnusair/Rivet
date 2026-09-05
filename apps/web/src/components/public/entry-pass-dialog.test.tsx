import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EntryPassDialog } from "./entry-pass-dialog";

const state = vi.hoisted(() => ({ getEntryPass: vi.fn() }));

vi.mock("@/lib/api/client", () => ({ getApi: () => ({ getEntryPass: state.getEntryPass }) }));

describe("EntryPassDialog", () => {
  beforeEach(() => {
    state.getEntryPass.mockReset();
  });

  it("requests a short-lived pass only while open and states when it expires", async () => {
    state.getEntryPass.mockResolvedValue({ token: "rivet://entry/forge/ABD-2214", expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(), membershipId: "m1" });
    render(<EntryPassDialog open onOpenChange={() => undefined} membershipId="m1" memberNumber="ABD-2214" gymName="Forge Fitness Club" />);

    expect(screen.getByRole("dialog", { name: "Entry QR" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Preparing a short-lived entry pass");
    expect(await screen.findByLabelText("Membership entry QR code")).toBeInTheDocument();
    expect(screen.getByText("ABD-2214")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/Expires at/);
    expect(screen.getByRole("button", { name: "Get a fresh pass" })).toBeInTheDocument();
    expect(state.getEntryPass).toHaveBeenCalledTimes(1);
  });

  it("marks a lapsed pass as expired and refreshes it on request", async () => {
    const user = userEvent.setup();
    state.getEntryPass.mockResolvedValueOnce({ token: "old", expiresAt: new Date(Date.now() - 1_000).toISOString(), membershipId: "m1" });
    state.getEntryPass.mockResolvedValueOnce({ token: "new", expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(), membershipId: "m1" });
    render(<EntryPassDialog open onOpenChange={() => undefined} membershipId="m1" memberNumber="ABD-2214" gymName="Forge Fitness Club" />);

    expect(await screen.findByText(/This pass has expired/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Refresh pass" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/Expires at/));
    expect(state.getEntryPass).toHaveBeenCalledTimes(2);
  });

  it("explains a failed request and offers a retry instead of a blank code", async () => {
    const user = userEvent.setup();
    state.getEntryPass.mockRejectedValueOnce(new Error("The desk scanner is offline."));
    state.getEntryPass.mockResolvedValueOnce({ token: "ok", expiresAt: new Date(Date.now() + 60_000).toISOString(), membershipId: "m1" });
    render(<EntryPassDialog open onOpenChange={() => undefined} membershipId="m1" memberNumber="ABD-2214" gymName="Forge Fitness Club" />);

    expect(await screen.findByRole("alert")).toHaveTextContent("The desk scanner is offline.");
    expect(screen.queryByLabelText("Membership entry QR code")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByLabelText("Membership entry QR code")).toBeInTheDocument();
  });
});
