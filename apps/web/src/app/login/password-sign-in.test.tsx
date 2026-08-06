import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PasswordSignIn } from "./password-sign-in.client";

const clerk = vi.hoisted(() => ({
  hook: {
    signIn: null as unknown,
    errors: { fields: { identifier: null, password: null, code: null } },
    fetchStatus: "idle" as const,
  },
}));

vi.mock("@clerk/nextjs", () => ({
  useSignIn: () => clerk.hook,
}));

describe("PasswordSignIn", () => {
  beforeEach(() => {
    clerk.hook = {
      signIn: null,
      errors: { fields: { identifier: null, password: null, code: null } },
      fetchStatus: "idle",
    };
  });

  it("renders email, password and the submit control before Clerk is ready", () => {
    render(<PasswordSignIn />);

    expect(screen.getByLabelText(/Email address/)).toBeVisible();
    expect(screen.getByLabelText(/Password/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeVisible();
  });

  it("submits email and password together and finalizes a complete session", async () => {
    const password = vi.fn().mockResolvedValue({ error: null });
    const finalize = vi.fn().mockResolvedValue({ error: null });
    clerk.hook = {
      signIn: {
        status: "complete",
        password,
        finalize,
        supportedSecondFactors: [],
        mfa: {},
      },
      errors: { fields: { identifier: null, password: null, code: null } },
      fetchStatus: "idle",
    };

    render(<PasswordSignIn />);
    fireEvent.change(screen.getByLabelText(/Email address/), { target: { value: "admin@rivetjo.com" } });
    fireEvent.change(screen.getByLabelText(/Password/), { target: { value: "secret-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => {
      expect(password).toHaveBeenCalledWith({ emailAddress: "admin@rivetjo.com", password: "secret-password" });
      expect(finalize).toHaveBeenCalledOnce();
    });
  });

  it("handles Clerk Client Trust without replacing the whole form", async () => {
    const sendEmailCode = vi.fn().mockResolvedValue({ error: null });
    const finalize = vi.fn().mockResolvedValue({ error: null });
    const signIn = {
      status: "needs_client_trust",
      password: vi.fn().mockResolvedValue({ error: null }),
      finalize,
      supportedSecondFactors: [{ strategy: "email_code" }],
      mfa: {
        sendEmailCode,
        verifyEmailCode: vi.fn().mockImplementation(async () => {
          signIn.status = "complete";
          return { error: null };
        }),
      },
    };
    clerk.hook = {
      signIn,
      errors: { fields: { identifier: null, password: null, code: null } },
      fetchStatus: "idle",
    };

    render(<PasswordSignIn />);
    fireEvent.change(screen.getByLabelText(/Email address/), { target: { value: "admin@rivetjo.com" } });
    fireEvent.change(screen.getByLabelText(/Password/), { target: { value: "secret-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(sendEmailCode).toHaveBeenCalledOnce());
    expect(screen.getByRole("heading", { name: "Check your email" })).toBeVisible();
    fireEvent.change(screen.getByLabelText("Digit 1"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: /Verify and continue/i }));

    await waitFor(() => expect(finalize).toHaveBeenCalledOnce());
  });
});
