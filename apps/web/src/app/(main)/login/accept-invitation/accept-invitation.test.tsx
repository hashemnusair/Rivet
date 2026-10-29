import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AcceptInvitation, invitationAccountSchema, invitationErrorMessage } from "./accept-invitation.client";

const state = vi.hoisted(() => ({
  convexEnabled: true,
  search: new URLSearchParams("__clerk_ticket=ticket-1&__clerk_status=sign_up"),
  replace: vi.fn(),
  signOut: vi.fn(),
  claimInvitation: vi.fn().mockResolvedValue({ claimed: true }),
  auth: { isLoaded: true, isSignedIn: false },
  signIn: null as null | { create: ReturnType<typeof vi.fn>; finalize: ReturnType<typeof vi.fn>; status: "complete" | "needs_first_factor" },
  signUp: null as null | { create: ReturnType<typeof vi.fn>; finalize: ReturnType<typeof vi.fn>; status: "complete" | "needs_identifier" },
}));

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => state.auth,
  useClerk: () => ({ signOut: state.signOut }),
  useSignIn: () => ({ fetchStatus: "idle", signIn: state.signIn }),
  useSignUp: () => ({ fetchStatus: "idle", signUp: state.signUp }),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => state.search,
  useRouter: () => ({ replace: state.replace }),
}));

vi.mock("convex/react", () => ({
  useAction: () => state.claimInvitation,
}));

// The sign-in and sign-up flows exist only with a connected Convex deployment.
vi.mock("@/lib/providers/convex-client-provider", () => ({
  get CONVEX_ENABLED() { return state.convexEnabled; },
}));

describe("accept gym invitation", () => {
  beforeEach(() => {
    state.convexEnabled = true;
    state.search = new URLSearchParams("__clerk_ticket=ticket-1&__clerk_status=sign_up");
    state.replace.mockReset();
    state.signOut.mockReset();
    state.claimInvitation.mockReset();
    state.claimInvitation.mockResolvedValue({ claimed: true });
    state.auth = { isLoaded: true, isSignedIn: false };
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

  it("creates and finalizes a ticket-based account without assuming the invitee's role", async () => {
    render(<AcceptInvitation />);
    // Owners and staff share this door; the invitation already carries the role.
    expect(screen.getByRole("heading", { name: "Create your RIVET account" })).toBeInTheDocument();
    expect(screen.queryByText(/owner account/i)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/First name/), { target: { value: "Elias" } });
    fireEvent.change(screen.getByLabelText(/Last name/), { target: { value: "Hreish" } });
    fireEvent.change(screen.getByLabelText(/^Password/), { target: { value: "password-1" } });
    fireEvent.change(screen.getByLabelText(/Confirm password/), { target: { value: "password-1" } });
    fireEvent.click(screen.getByRole("button", { name: /Create account/i }));

    await waitFor(() => {
      expect(state.signUp?.create).toHaveBeenCalledWith({ strategy: "ticket", ticket: "ticket-1", firstName: "Elias", lastName: "Hreish", password: "password-1" });
      expect(state.signUp?.finalize).toHaveBeenCalled();
      expect(state.claimInvitation).toHaveBeenCalledWith({});
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
      expect(state.claimInvitation).toHaveBeenCalledWith({});
      expect(state.replace).toHaveBeenCalledWith("/login");
    });
  });

  it("waits for Clerk identity hydration before attempting a ticket and preserves a preexisting-session conflict", () => {
    state.search = new URLSearchParams("__clerk_ticket=ticket-2&__clerk_status=sign_in");
    state.auth = { isLoaded: false, isSignedIn: false };
    const create = vi.fn().mockResolvedValue({ error: null });
    state.signIn = {
      create,
      finalize: vi.fn().mockResolvedValue({ error: null }),
      status: "complete",
    };

    const view = render(<AcceptInvitation />);
    expect(screen.getByText("Checking your invitation")).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();

    state.auth = { isLoaded: true, isSignedIn: true };
    view.rerender(<AcceptInvitation />);
    expect(screen.getByText("You are already signed in")).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
  });

  it("shows the conflict immediately for a preexisting signed-in visitor", () => {
    state.search = new URLSearchParams("__clerk_ticket=ticket-2&__clerk_status=sign_in");
    state.auth = { isLoaded: true, isSignedIn: true };
    const create = vi.fn().mockResolvedValue({ error: null });
    state.signIn = {
      create,
      finalize: vi.fn().mockResolvedValue({ error: null }),
      status: "complete",
    };

    render(<AcceptInvitation />);
    expect(screen.getByText("You are already signed in")).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
  });

  it("keeps the invitation progress visible while Clerk publishes the new session", async () => {
    state.search = new URLSearchParams("__clerk_ticket=ticket-2&__clerk_status=sign_in");
    let resolveClaim: ((value: { claimed: boolean }) => void) | undefined;
    state.claimInvitation = vi.fn().mockImplementation(() => new Promise<{ claimed: boolean }>((resolve) => { resolveClaim = resolve; }));
    state.signIn = {
      create: vi.fn().mockResolvedValue({ error: null }),
      finalize: vi.fn().mockImplementation(async () => {
        state.auth.isSignedIn = true;
        return { error: null };
      }),
      status: "complete",
    };

    const view = render(<AcceptInvitation />);
    await waitFor(() => expect(state.claimInvitation).toHaveBeenCalledWith({}));

    view.rerender(<AcceptInvitation />);
    expect(screen.queryByText("You are already signed in")).not.toBeInTheDocument();
    expect(screen.getByText("Checking your invitation")).toBeInTheDocument();

    resolveClaim?.({ claimed: true });
    await waitFor(() => expect(state.replace).toHaveBeenCalledWith("/login"));
  });

  it("keeps signup progress visible while Clerk publishes the new session", async () => {
    let resolveClaim: ((value: { claimed: boolean }) => void) | undefined;
    state.claimInvitation = vi.fn().mockImplementation(() => new Promise<{ claimed: boolean }>((resolve) => { resolveClaim = resolve; }));
    state.signUp = {
      create: vi.fn().mockResolvedValue({ error: null }),
      finalize: vi.fn().mockImplementation(async () => {
        state.auth.isSignedIn = true;
        return { error: null };
      }),
      status: "complete",
    };

    const view = render(<AcceptInvitation />);
    fireEvent.change(screen.getByLabelText(/First name/), { target: { value: "Elias" } });
    fireEvent.change(screen.getByLabelText(/Last name/), { target: { value: "Hreish" } });
    fireEvent.change(screen.getByLabelText(/^Password/), { target: { value: "password-1" } });
    fireEvent.change(screen.getByLabelText(/Confirm password/), { target: { value: "password-1" } });
    fireEvent.click(screen.getByRole("button", { name: /Create account/i }));

    await waitFor(() => expect(state.claimInvitation).toHaveBeenCalledWith({}));
    view.rerender(<AcceptInvitation />);
    expect(screen.queryByText("You are already signed in")).not.toBeInTheDocument();
    expect(screen.getByText("Checking your invitation")).toBeInTheDocument();

    resolveClaim?.({ claimed: true });
    await waitFor(() => expect(state.replace).toHaveBeenCalledWith("/login"));
  });

  it("does not finish a new account when the backend cannot verify the invitation", async () => {
    state.claimInvitation.mockResolvedValue({ claimed: false });
    render(<AcceptInvitation />);
    fireEvent.change(screen.getByLabelText(/First name/), { target: { value: "Elias" } });
    fireEvent.change(screen.getByLabelText(/Last name/), { target: { value: "Hreish" } });
    fireEvent.change(screen.getByLabelText(/^Password/), { target: { value: "password-1" } });
    fireEvent.change(screen.getByLabelText(/Confirm password/), { target: { value: "password-1" } });
    fireEvent.click(screen.getByRole("button", { name: /Create account/i }));

    await waitFor(() => {
      expect(state.claimInvitation).toHaveBeenCalledWith({});
      expect(state.replace).not.toHaveBeenCalled();
      expect(screen.getByRole("alert")).toHaveTextContent(/confirm this invitation|send it again/i);
    });
  });

  it("does not finish an existing invited identity when the backend returns an unclaimed result", async () => {
    state.search = new URLSearchParams("__clerk_ticket=ticket-3&__clerk_status=sign_in");
    state.claimInvitation.mockResolvedValue({ claimed: false });
    state.signIn = {
      create: vi.fn().mockResolvedValue({ error: null }),
      finalize: vi.fn().mockResolvedValue({ error: null }),
      status: "complete",
    };

    render(<AcceptInvitation />);

    await waitFor(() => {
      expect(state.claimInvitation).toHaveBeenCalledWith({});
      expect(state.replace).not.toHaveBeenCalled();
      expect(screen.getByRole("alert")).toHaveTextContent(/confirm this invitation|send it again/i);
    });
  });

  it("tells a signed-out visitor that a completed invitation only needs sign-in", () => {
    state.search = new URLSearchParams("__clerk_ticket=ticket-1&__clerk_status=complete");
    render(<AcceptInvitation />);
    expect(screen.getByRole("status")).toHaveTextContent("This invitation was already accepted");
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
    expect(screen.queryByText(/Checking your invitation/)).not.toBeInTheDocument();
    expect(state.replace).not.toHaveBeenCalled();
  });

  it("says that a build without the RIVET backend cannot accept an invitation, instead of throwing", () => {
    state.convexEnabled = false;
    render(<AcceptInvitation />);
    expect(screen.getByRole("status")).toHaveTextContent("Invitations cannot be accepted here");
    expect(screen.queryByLabelText(/First name/)).not.toBeInTheDocument();
    expect(state.claimInvitation).not.toHaveBeenCalled();

    // The states that need no identity service still render without it.
    state.search = new URLSearchParams("__clerk_ticket=ticket-1&__clerk_status=expired");
    render(<AcceptInvitation />);
    expect(screen.getByRole("alert")).toHaveTextContent("Invitation expired");
  });

  it("keeps invitation failures actionable without exposing the ticket", () => {
    expect(invitationErrorMessage({ code: "invitation_expired" })).toMatch(/expired/i);
    expect(invitationErrorMessage({ code: "email_address_mismatch", message: "ticket=secret" })).toMatch(/different email/i);
    expect(invitationErrorMessage({ code: "unexpected", message: "ticket=secret" })).not.toContain("secret");
  });
});
