import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemberProfileCompletion } from "./member-profile-completion";

const state = vi.hoisted(() => ({ registerCustomer: vi.fn() }));
vi.mock("@/lib/api/client", () => ({ getApi: () => ({ registerCustomer: state.registerCustomer }) }));
const identity = { status: "ready" as const, email: "member@example.com", fullName: "Member Example", platformAdmin: false, gymAccessUnavailable: false, memberships: [] };

describe("member profile completion", () => {
  beforeEach(() => state.registerCustomer.mockReset().mockResolvedValue({ id: "profile" }));
  it("validates required details and saves only the authenticated profile fields", async () => {
    const complete = vi.fn().mockResolvedValue(undefined);
    render(<MemberProfileCompletion identity={identity} onComplete={complete} />);
    fireEvent.click(screen.getByRole("button", { name: "Finish member setup" }));
    expect(state.registerCustomer).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(/Mobile number/), { target: { value: "+962790000000" } });
    fireEvent.change(screen.getByLabelText(/Gender/), { target: { value: "female" } });
    fireEvent.click(screen.getByRole("button", { name: "Finish member setup" }));
    await waitFor(() => expect(complete).toHaveBeenCalledOnce());
    expect(state.registerCustomer).toHaveBeenCalledWith({ fullName: "Member Example", email: "member@example.com", phone: "+962790000000", gender: "female" });
    expect(screen.queryByLabelText(/Password/)).not.toBeInTheDocument();
  });
  it("retains details and allows retry when saving fails", async () => {
    state.registerCustomer.mockRejectedValueOnce(new Error("Unavailable"));
    const complete = vi.fn().mockResolvedValue(undefined);
    render(<MemberProfileCompletion identity={identity} onComplete={complete} />);
    fireEvent.change(screen.getByLabelText(/Mobile number/), { target: { value: "+962790000000" } });
    fireEvent.change(screen.getByLabelText(/Gender/), { target: { value: "male" } });
    fireEvent.click(screen.getByRole("button", { name: "Finish member setup" }));
    await screen.findByRole("alert");
    expect(complete).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/Mobile number/)).toHaveValue("+962790000000");
    fireEvent.click(screen.getByRole("button", { name: "Finish member setup" }));
    await waitFor(() => expect(complete).toHaveBeenCalledOnce());
  });
});
