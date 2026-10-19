import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChangePasswordForm, PasswordChangeFields } from "./change-password-form";

const state = vi.hoisted(() => ({
  convexEnabled: true,
  loaded: true,
  user: null as null | { passwordEnabled: boolean; primaryEmailAddress: { emailAddress: string }; updatePassword: ReturnType<typeof vi.fn> },
  reverified: vi.fn(),
}));

vi.mock("@/lib/providers/convex-client-provider", () => ({
  get CONVEX_ENABLED() { return state.convexEnabled; },
}));
vi.mock("@clerk/nextjs", () => ({
  useUser: () => ({ isLoaded: state.loaded, user: state.user }),
  // Records that the change went through Clerk's identity check wrapper.
  useReverification: (fetcher: (...args: unknown[]) => Promise<unknown>) => (...args: unknown[]) => { state.reverified(...args); return fetcher(...args); },
}));

// The Radix checkbox measures itself; jsdom has no ResizeObserver.
vi.stubGlobal("ResizeObserver", class ResizeObserver { observe() {} unobserve() {} disconnect() {} });

class ReverificationCancelled extends Error {
  static kind = "ClerkRuntimeError";
  code = "reverification_cancelled";
}

async function fill(user: ReturnType<typeof userEvent.setup>, values: { current?: string; next?: string; confirm?: string }) {
  if (values.current !== undefined) await user.type(screen.getByLabelText("Current password"), values.current);
  if (values.next !== undefined) await user.type(screen.getByLabelText("New password"), values.next);
  if (values.confirm !== undefined) await user.type(screen.getByLabelText("Confirm new password"), values.confirm);
}

describe("PasswordChangeFields", () => {
  it("changes the password and signs out other devices unless told not to", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<PasswordChangeFields idPrefix="test" hasPassword username="lina@example.com" onSubmit={onSubmit} />);

    expect(screen.getByLabelText("Current password")).toHaveAttribute("autocomplete", "current-password");
    expect(screen.getByLabelText("New password")).toHaveAttribute("autocomplete", "new-password");
    expect(screen.getByRole("checkbox", { name: "Sign out on my other devices" })).toBeChecked();

    await fill(user, { current: "old-secret", next: "new-secret-1", confirm: "new-secret-1" });
    await user.click(screen.getByRole("button", { name: "Change password" }));

    expect(onSubmit).toHaveBeenCalledWith({ currentPassword: "old-secret", newPassword: "new-secret-1", signOutOfOtherSessions: true });
    expect(await screen.findByRole("status")).toHaveTextContent("Your password is changed. Your other devices are signed out.");
    expect(screen.getByLabelText("Current password")).toHaveValue("");
    expect(screen.getByLabelText("New password")).toHaveValue("");
  });

  it("checks the fields first and moves focus to the first problem", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<PasswordChangeFields idPrefix="test" hasPassword onSubmit={onSubmit} />);

    await user.click(screen.getByRole("button", { name: "Change password" }));
    expect(screen.getByText("Enter your current password.")).toBeInTheDocument();
    expect(screen.getByText("Use at least 8 characters")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText("Current password")).toHaveFocus());
    expect(screen.getByLabelText("Current password")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Current password")).toHaveAttribute("aria-describedby", "test-current-error");

    await fill(user, { current: "old-secret", next: "new-secret-1", confirm: "new-secret-2" });
    await user.click(screen.getByRole("button", { name: "Change password" }));
    expect(screen.getByText("Passwords do not match")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("shows Clerk's refusal next to the field it is about", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockRejectedValue({ errors: [{ code: "form_password_incorrect", message: "Password is incorrect.", meta: { paramName: "current_password" } }] });
    render(<PasswordChangeFields idPrefix="test" hasPassword onSubmit={onSubmit} />);

    await fill(user, { current: "wrong-secret", next: "new-secret-1", confirm: "new-secret-1" });
    await user.click(screen.getByRole("button", { name: "Change password" }));

    expect(await screen.findByText("Your current password is not correct.")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText("Current password")).toHaveFocus());
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    // What was typed stays, so the person only fixes the wrong field.
    expect(screen.getByLabelText("New password")).toHaveValue("new-secret-1");
  });

  it("says nothing changed when the person cancels Clerk's identity check", async () => {
    const user = userEvent.setup();
    render(<PasswordChangeFields idPrefix="test" hasPassword onSubmit={vi.fn().mockRejectedValue(new ReverificationCancelled())} />);

    await fill(user, { current: "old-secret", next: "new-secret-1", confirm: "new-secret-1" });
    await user.click(screen.getByRole("button", { name: "Change password" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Your password was not changed. Confirm it is you to change it.");
  });

  it("sets a first password without asking for a current one", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<PasswordChangeFields idPrefix="test" hasPassword={false} onSubmit={onSubmit} />);

    expect(screen.queryByLabelText("Current password")).not.toBeInTheDocument();
    expect(screen.getByText(/Your account has no password yet/)).toBeInTheDocument();
    await fill(user, { next: "first-secret", confirm: "first-secret" });
    await user.click(screen.getByRole("checkbox", { name: "Sign out on my other devices" }));
    await user.click(screen.getByRole("button", { name: "Save password" }));

    expect(onSubmit).toHaveBeenCalledWith({ newPassword: "first-secret", signOutOfOtherSessions: false });
    expect(await screen.findByRole("status")).toHaveTextContent(/^Your password is changed\.$/);
  });
});

describe("ChangePasswordForm", () => {
  beforeEach(() => {
    state.convexEnabled = true;
    state.loaded = true;
    state.reverified.mockReset();
    state.user = { passwordEnabled: true, primaryEmailAddress: { emailAddress: "lina@example.com" }, updatePassword: vi.fn().mockResolvedValue({}) };
  });

  it("changes the signed-in account's password through Clerk's identity check", async () => {
    const user = userEvent.setup();
    render(<ChangePasswordForm />);

    await fill(user, { current: "old-secret", next: "new-secret-1", confirm: "new-secret-1" });
    await user.click(screen.getByRole("button", { name: "Change password" }));

    const request = { currentPassword: "old-secret", newPassword: "new-secret-1", signOutOfOtherSessions: true };
    await waitFor(() => expect(state.user?.updatePassword).toHaveBeenCalledWith(request));
    expect(state.reverified).toHaveBeenCalledWith(request);
  });

  it("offers to set a password when the account has none", () => {
    state.user = { passwordEnabled: false, primaryEmailAddress: { emailAddress: "lina@example.com" }, updatePassword: vi.fn() };
    render(<ChangePasswordForm />);
    expect(screen.getByRole("button", { name: "Save password" })).toBeInTheDocument();
  });

  it("waits for Clerk and asks a signed-out visitor to sign in again", () => {
    state.loaded = false;
    const { rerender } = render(<ChangePasswordForm />);
    expect(screen.getByRole("status", { name: "Loading your account" })).toBeInTheDocument();

    state.loaded = true;
    state.user = null;
    rerender(<ChangePasswordForm />);
    expect(screen.getByText("Sign in again to change your password.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Change password" })).not.toBeInTheDocument();
  });

  it("collects no password in a build without a real account", () => {
    state.convexEnabled = false;
    render(<ChangePasswordForm />);
    expect(screen.getByText("You cannot change a password in this demo.")).toBeInTheDocument();
    expect(screen.queryByLabelText("New password")).not.toBeInTheDocument();
  });
});
