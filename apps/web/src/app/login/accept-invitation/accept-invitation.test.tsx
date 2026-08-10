import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AcceptInvitation, invitationAccountSchema, invitationErrorMessage } from "./accept-invitation.client";

const state = vi.hoisted(() => ({
  search: new URLSearchParams("__clerk_ticket=ticket-1&__clerk_status=sign_up"),
  replace: vi.fn(),
  signOut: vi.fn(),
  signIn: null as null | { create: ReturnType<typeof vi.fn>; finalize: ReturnType<typeof vi.fn>; status: "complete" | "needs_first_factor" },
  signUp: null as null | { create: ReturnType<typeof vi.fn>; finalize: ReturnType<typeof vi.fn>; status: "complete" | "needs_identifier" },
}));

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: false }),
  useClerk: () => ({ signOut: state.signOut }),
  useSignIn: () => ({ fetchStatus: "idle", signIn: state.signIn }),
  useSignUp: () => ({ fetchStatus: "idle", signUp: state.signUp }),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => state.search,
  useRouter: () => ({ replace: state.replace }),
}));

describe("accept gym invitation", () => {
  beforeEach(() => {
    state.search = new URLSearchParams("__clerk_ticket=ticket-1&__clerk_status=sign_up");
    state.replace.mockReset();
    state.signOut.mockReset();
    state.signIn = null;
    state.signUp = {
      create: vi.fn().mockResolvedValue({ error: null }),
      finalize: vi.fn().mockResolvedValue({ error: null }),
      status: "complete",
    };
  });

  it("requires matching owner credentials before submitting the ticket", () => {
    expect(invitationAccountSchema.safeParse({ firstName: "Elias", lastName: "", password: "short", confirmPassword: "no" }).success).toBe(false);
    expect(invitationAccountSchema.parse({ firstName: " Elias ", lastName: " Hreish ", password: "password-1", confirmPassword: "password-1" })).toMatchObject({ firstName: "Elias", lastName: "Hreish" });
  });

  it("creates and finalizes a ticket-based owner account", async () => {
    render(<AcceptInvitation />);
    fireEvent.change(screen.getByLabelText(/First name/), { target: { value: "Elias" } });
    fireEvent.change(screen.getByLabelText(/Last name/), { target: { value: "Hreish" } });
    fireEvent.change(screen.getByLabelText(/^Password/), { target: { value: "password-1" } });
    fireEvent.change(screen.getByLabelText(/Confirm password/), { target: { value: "password-1" } });
    fireEvent.click(screen.getByRole("button", { name: /Open gym workspace/i }));

    await waitFor(() => {
      expect(state.signUp?.create).toHaveBeenCalledWith({ strategy: "ticket", ticket: "ticket-1", firstName: "Elias", lastName: "Hreish", password: "password-1" });
      expect(state.signUp?.finalize).toHaveBeenCalled();
      expect(state.replace).toHaveBeenCalledWith("/login");
    });
  });

  it("finalizes an existing invited identity without dropping the ticket", async () => {
    state.search = new URLSearchParams("__clerk_ticket=ticket-2&__clerk_status=sign_in");
    state.signIn = {
      create: vi.fn().mockResolvedValue({ error: null }),
      finalize: vi.fn().mockResolvedValue({ error: null }),
      status: "complete",
    };

    render(<AcceptInvitation />);

    await waitFor(() => {
      expect(state.signIn?.create).toHaveBeenCalledWith({ strategy: "ticket", ticket: "ticket-2" });
      expect(state.signIn?.finalize).toHaveBeenCalled();
      expect(state.replace).toHaveBeenCalledWith("/login");
    });
  });

  it("keeps invitation failures actionable without exposing the ticket", () => {
    expect(invitationErrorMessage({ code: "invitation_expired" })).toMatch(/expired/i);
    expect(invitationErrorMessage({ code: "email_address_mismatch", message: "ticket=secret" })).toMatch(/different email/i);
    expect(invitationErrorMessage({ code: "unexpected", message: "ticket=secret" })).not.toContain("secret");
  });
});
