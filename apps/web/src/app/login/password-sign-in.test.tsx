import { LocaleProvider, useLocale } from "@/lib/i18n/provider";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PasswordSignIn } from "./password-sign-in.client";

const clerk = vi.hoisted(() => ({
  loaded: true,
  hook: {
    signIn: null as unknown,
    errors: { fields: { identifier: null, password: null, code: null } },
    fetchStatus: "idle" as const,
  },
}));

const navigation = vi.hoisted(() => ({ router: { replace: vi.fn() } }));

vi.mock("@clerk/nextjs", () => ({
  useSignIn: () => clerk.hook,
  useClerk: () => ({ loaded: clerk.loaded }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => navigation.router,
}));

const NO_FIELD_ERRORS = { fields: { identifier: null, password: null, code: null } };

/**
 * A Clerk sign-in that behaves like the real forgot-password flow: create, then
 * send, verify (status becomes needs_new_password) and submit (status becomes
 * `afterSubmit`). Each step can be made to fail or throw.
 */
function resetSignIn({
  afterSubmit = "complete",
  create = { error: null } as { error: unknown },
  sendCode = { error: null } as { error: unknown },
  verifyCode = { error: null } as { error: unknown },
  submitPassword = { error: null } as { error: unknown },
  supportedSecondFactors = [] as Array<{ strategy: string }>,
}: {
  afterSubmit?: string;
  create?: { error: unknown };
  sendCode?: { error: unknown };
  verifyCode?: { error: unknown };
  submitPassword?: { error: unknown };
  supportedSecondFactors?: Array<{ strategy: string }>;
} = {}) {
  const signIn = {
    status: "needs_identifier",
    supportedSecondFactors,
    password: vi.fn(),
    finalize: vi.fn().mockResolvedValue({ error: null }),
    reset: vi.fn().mockImplementation(async () => {
      signIn.status = "needs_identifier";
      return { error: null };
    }),
    create: vi.fn().mockImplementation(async () => {
      if (!create.error) signIn.status = "needs_first_factor";
      return create;
    }),
    resetPasswordEmailCode: {
      sendCode: vi.fn().mockResolvedValue(sendCode),
      verifyCode: vi.fn().mockImplementation(async () => {
        if (!verifyCode.error) signIn.status = "needs_new_password";
        return verifyCode;
      }),
      submitPassword: vi.fn().mockImplementation(async () => {
        if (!submitPassword.error) signIn.status = afterSubmit;
        return submitPassword;
      }),
    },
    mfa: { sendEmailCode: vi.fn().mockResolvedValue({ error: null }), verifyEmailCode: vi.fn() },
  };
  clerk.hook = { signIn, errors: NO_FIELD_ERRORS, fetchStatus: "idle" };
  return signIn;
}

/** Opens the reset from the sign-in form with an email typed first, then asks for the code. */
async function requestResetCode(email = "admin@rivetjo.com") {
  fireEvent.change(screen.getByLabelText(/Email address/), { target: { value: email } });
  fireEvent.click(screen.getByRole("button", { name: "Forgot password?" }));
  const send = await screen.findByRole("button", { name: /Send code/ });
  await act(async () => {
    fireEvent.click(send);
  });
}

describe("PasswordSignIn", () => {
  beforeEach(() => {
    navigation.router.replace.mockReset();
    clerk.loaded = true;
    clerk.hook = {
      signIn: null,
      errors: { fields: { identifier: null, password: null, code: null } },
      fetchStatus: "idle",
    };
  });

  it("renders email, password and the submit control before Clerk is ready", () => {
    clerk.loaded = false;
    render(<PasswordSignIn />);

    expect(screen.getByLabelText(/Email address/)).toBeVisible();
    expect(screen.getByLabelText(/Password/)).toBeVisible();
    expect(screen.getByLabelText(/Email address/)).toHaveAttribute("placeholder", "Enter email");
    expect(screen.getByLabelText(/Password/)).toHaveAttribute("placeholder", "Enter password");
    expect(screen.getByRole("button", { name: "Sign in" })).toBeVisible();
  });

  it("takes typing while Clerk loads, and holds the submit until it has", () => {
    const password = vi.fn().mockResolvedValue({ error: null });
    clerk.loaded = false;
    clerk.hook = {
      signIn: { status: "needs_identifier", password, finalize: vi.fn(), supportedSecondFactors: [], mfa: {} },
      errors: { fields: { identifier: null, password: null, code: null } },
      fetchStatus: "idle",
    };

    const { rerender } = render(<PasswordSignIn />);
    fireEvent.change(screen.getByLabelText(/Email address/), { target: { value: "admin@rivetjo.com" } });
    fireEvent.change(screen.getByLabelText(/Password/), { target: { value: "secret-password" } });
    const submit = screen.getByRole("button", { name: "Sign in" });
    expect(submit).toBeDisabled();
    fireEvent.submit(submit.closest("form")!);
    expect(password).not.toHaveBeenCalled();

    clerk.loaded = true;
    rerender(<PasswordSignIn />);
    expect(screen.getByLabelText(/Email address/)).toHaveValue("admin@rivetjo.com");
    expect(submit).toBeEnabled();
  });

  it("keeps what was typed into the server's form before the page came alive", async () => {
    clerk.hook = {
      signIn: { status: "needs_identifier", password: vi.fn(), finalize: vi.fn(), supportedSecondFactors: [], mfa: {} },
      errors: { fields: { identifier: null, password: null, code: null } },
      fetchStatus: "idle",
    };
    const host = document.createElement("div");
    host.innerHTML = renderToString(<PasswordSignIn />);
    document.body.appendChild(host);
    (host.querySelector("#login-email") as HTMLInputElement).value = "owner@example.com";
    (host.querySelector("#login-password") as HTMLInputElement).value = "secret-password";

    const root = await act(async () => hydrateRoot(host, <PasswordSignIn />));
    expect(host.querySelector("#login-email")).toHaveValue("owner@example.com");
    expect(host.querySelector("button[type='submit']")).toBeEnabled();
    act(() => root.unmount());
    host.remove();
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

  it("shows a Clerk rejection when password submission throws and re-enables sign in", async () => {
    const password = vi.fn().mockRejectedValue({ errors: [{ longMessage: "Your password is incorrect." }] });
    clerk.hook = {
      signIn: {
        status: "needs_first_factor",
        password,
        finalize: vi.fn(),
        supportedSecondFactors: [],
        mfa: {},
      },
      errors: { fields: { identifier: null, password: null, code: null } },
      fetchStatus: "idle",
    };

    render(<PasswordSignIn />);
    fireEvent.change(screen.getByLabelText(/Email address/), { target: { value: "admin@rivetjo.com" } });
    fireEvent.change(screen.getByLabelText(/Password/), { target: { value: "wrong-password" } });
    const submit = screen.getByRole("button", { name: "Sign in" });
    fireEvent.click(submit);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Your password is incorrect.");
      expect(submit).not.toBeDisabled();
    });
  });

  it("shows a Clerk rejection when finalizing throws and re-enables sign in", async () => {
    const password = vi.fn().mockResolvedValue({ error: null });
    const finalize = vi.fn().mockRejectedValue({ errors: [{ message: "The session could not be finalized." }] });
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
    const submit = screen.getByRole("button", { name: "Sign in" });
    fireEvent.click(submit);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("The session could not be finalized.");
      expect(submit).not.toBeDisabled();
    });
  });

  it("returns to a safe customer destination after sign-in and preserves it for signup", async () => {
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

    render(<PasswordSignIn redirectUrl="/customer/gyms/forge?branchId=abdoun" />);
    expect(screen.getByRole("link", { name: "Create a free account" })).toHaveAttribute(
      "href",
      "/login/member/create?returnTo=%2Fcustomer%2Fgyms%2Fforge%3FbranchId%3Dabdoun",
    );
    fireEvent.change(screen.getByLabelText(/Email address/), { target: { value: "member@example.com" } });
    fireEvent.change(screen.getByLabelText(/Password/), { target: { value: "secret-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(navigation.router.replace).toHaveBeenCalledWith("/login?next=%2Fcustomer%2Fgyms%2Fforge%3FbranchId%3Dabdoun"));
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

  it("accepts Arabic and Persian MFA digits in left-to-right boxes and sends Latin digits", async () => {
    const signIn = {
      status: "needs_client_trust", password: vi.fn().mockResolvedValue({ error: null }), finalize: vi.fn().mockResolvedValue({ error: null }),
      supportedSecondFactors: [{ strategy: "email_code" }],
      mfa: { sendEmailCode: vi.fn().mockResolvedValue({ error: null }), verifyEmailCode: vi.fn().mockImplementation(async () => { signIn.status = "complete"; return { error: null }; }) },
    };
    clerk.hook = { signIn, errors: { fields: { identifier: null, password: null, code: null } }, fetchStatus: "idle" };
    const { container } = render(<LocaleProvider initialLocale="ar"><PasswordSignIn /></LocaleProvider>);
    fireEvent.change(container.querySelector("#login-email")!, { target: { value: "member@example.com" } });
    fireEvent.change(container.querySelector("#login-password")!, { target: { value: "secret-password" } });
    fireEvent.click(screen.getByRole("button", { name: "تسجيل الدخول" }));
    await waitFor(() => expect(signIn.mfa.sendEmailCode).toHaveBeenCalledOnce());
    const first = container.querySelector("#login-code-0")!;
    expect(first.parentElement).toHaveAttribute("dir", "ltr");
    fireEvent.change(first, { target: { value: "١٢٣۴۵۶" } });
    expect(container.querySelector("#login-code-5")).toHaveValue("6");
    fireEvent.submit(first.closest("form")!);
    await waitFor(() => expect(signIn.mfa.verifyEmailCode).toHaveBeenCalledWith({ code: "123456" }));
    expect(signIn.finalize).toHaveBeenCalledOnce();
  });

  it("translates a retained provider rejection on switch without repeating the request", async () => {
    const password = vi.fn().mockResolvedValue({ error: { code: "form_password_incorrect", longMessage: "__clerk_ticket=private" } });
    clerk.hook = { signIn: { status: "needs_first_factor", password, supportedSecondFactors: [], mfa: {}, finalize: vi.fn() }, errors: { fields: { identifier: null, password: null, code: null } }, fetchStatus: "idle" };
    function Switch() { const { setLocale } = useLocale(); return <button onClick={() => setLocale("en")}>English</button>; }
    const { container } = render(<LocaleProvider initialLocale="ar"><Switch /><PasswordSignIn /></LocaleProvider>);
    fireEvent.change(container.querySelector("#login-email")!, { target: { value: "member@example.com" } });
    fireEvent.change(container.querySelector("#login-password")!, { target: { value: "wrong-password" } });
    fireEvent.click(screen.getByRole("button", { name: "تسجيل الدخول" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("كلمة المرور غير صحيحة.");
    fireEvent.click(screen.getByRole("button", { name: "English" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Your password is incorrect.");
    expect(container.querySelector("#login-email")).toHaveValue("member@example.com");
    expect(container.querySelector("#login-password")).toHaveValue("wrong-password");
    expect(password).toHaveBeenCalledOnce();
    expect(container).not.toHaveTextContent("private");
  });

  describe("forgot password", () => {
    it("offers a Forgot password link beside the password field and opens a reset that keeps the typed email", () => {
      const signIn = resetSignIn();
      render(<PasswordSignIn />);
      expect(screen.getByRole("button", { name: "Forgot password?" })).toHaveAttribute("type", "button");

      fireEvent.change(screen.getByLabelText(/Email address/), { target: { value: "admin@rivetjo.com" } });
      fireEvent.click(screen.getByRole("button", { name: "Forgot password?" }));

      expect(screen.getByRole("heading", { name: "Reset your password" })).toBeVisible();
      expect(screen.getByLabelText(/Email address/)).toHaveValue("admin@rivetjo.com");
      expect(screen.queryByLabelText(/^Password/)).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Back to sign in" }));
      expect(signIn.reset).toHaveBeenCalledOnce();
      expect(screen.getByRole("button", { name: "Sign in" })).toBeVisible();
      expect(screen.getByLabelText(/Email address/)).toHaveValue("admin@rivetjo.com");
    });

    it("holds the send button until Clerk has loaded and an email is typed", () => {
      const signIn = resetSignIn();
      clerk.loaded = false;
      const { rerender } = render(<PasswordSignIn />);
      fireEvent.change(screen.getByLabelText(/Email address/), { target: { value: "admin@rivetjo.com" } });
      fireEvent.click(screen.getByRole("button", { name: "Forgot password?" }));

      const send = screen.getByRole("button", { name: /Send code/ });
      expect(send).toBeDisabled();
      fireEvent.submit(send.closest("form")!);
      expect(signIn.create).not.toHaveBeenCalled();

      clerk.loaded = true;
      rerender(<PasswordSignIn />);
      expect(send).toBeEnabled();
      fireEvent.change(screen.getByLabelText(/Email address/), { target: { value: "  " } });
      expect(send).toBeDisabled();
    });

    it("sends the code to the typed email and asks for the code and a new password", async () => {
      const signIn = resetSignIn();
      render(<PasswordSignIn />);
      await requestResetCode(" admin@rivetjo.com ");

      await waitFor(() => expect(screen.getByRole("heading", { name: "Check your email" })).toBeVisible());
      expect(signIn.create).toHaveBeenCalledWith({ identifier: "admin@rivetjo.com" });
      expect(signIn.resetPasswordEmailCode.sendCode).toHaveBeenCalledOnce();
      expect(signIn.resetPasswordEmailCode.verifyCode).not.toHaveBeenCalled();
      expect(screen.getByLabelText("Digit 1")).toBeVisible();
      expect(screen.getByLabelText(/New password/)).toHaveAttribute("autocomplete", "new-password");
      expect(screen.getByRole("button", { name: /Save password and sign in/ })).toBeDisabled();
    });

    it("says so when no account uses the email, without sending a code", async () => {
      const signIn = resetSignIn({ create: { error: { code: "form_identifier_not_found", longMessage: "Couldn't find your account." } } });
      render(<PasswordSignIn />);
      await requestResetCode("nobody@example.com");

      expect(await screen.findByRole("alert")).toHaveTextContent("We could not find an account with this email.");
      expect(signIn.resetPasswordEmailCode.sendCode).not.toHaveBeenCalled();
      expect(screen.getByRole("heading", { name: "Reset your password" })).toBeVisible();
      expect(screen.getByRole("button", { name: /Send code/ })).toBeEnabled();
    });

    it("shows a send failure, a rate limit and a thrown rejection in plain words and stays on the email step", async () => {
      resetSignIn({ sendCode: { error: { code: "strategy_for_user_invalid", longMessage: "Provider detail" } } });
      const { unmount } = render(<PasswordSignIn />);
      await requestResetCode();
      expect(await screen.findByRole("alert")).toHaveTextContent("We could not send your code. Try again.");
      expect(screen.getByRole("heading", { name: "Reset your password" })).toBeVisible();
      expect(screen.queryByText("Provider detail")).not.toBeInTheDocument();
      unmount();

      resetSignIn({ sendCode: { error: { code: "too_many_requests" } } });
      const second = render(<PasswordSignIn />);
      await requestResetCode();
      expect(await screen.findByRole("alert")).toHaveTextContent("Too many attempts. Try again later.");
      second.unmount();

      const signIn = resetSignIn();
      signIn.create.mockRejectedValue(new Error("network down"));
      render(<PasswordSignIn />);
      await requestResetCode();
      expect(await screen.findByRole("alert")).toHaveTextContent("We could not send your code. Try again.");
      expect(screen.getByRole("button", { name: /Send code/ })).toBeEnabled();
    });

    it("keeps a wrong code on the page, never reaches the new password, and lets the person try again", async () => {
      const signIn = resetSignIn({ verifyCode: { error: { code: "form_code_incorrect", longMessage: "Incorrect code" } } });
      render(<PasswordSignIn />);
      await requestResetCode();
      await screen.findByLabelText("Digit 1");

      fireEvent.change(screen.getByLabelText("Digit 1"), { target: { value: "000000" } });
      fireEvent.change(screen.getByLabelText(/New password/), { target: { value: "a-new-secret-1" } });
      const submit = screen.getByRole("button", { name: /Save password and sign in/ });
      fireEvent.click(submit);

      expect(await screen.findByRole("alert")).toHaveTextContent("That code is not correct. Try again.");
      expect(signIn.resetPasswordEmailCode.verifyCode).toHaveBeenCalledWith({ code: "000000" });
      expect(signIn.resetPasswordEmailCode.submitPassword).not.toHaveBeenCalled();
      expect(signIn.finalize).not.toHaveBeenCalled();
      expect(submit).toBeEnabled();
      expect(screen.getByLabelText("Digit 6")).toHaveValue("0");
      expect(screen.getByLabelText(/New password/)).toHaveValue("a-new-secret-1");
    });

    it("sends a new code, and goes back to choose another email", async () => {
      const signIn = resetSignIn();
      render(<PasswordSignIn />);
      await requestResetCode();
      await screen.findByLabelText("Digit 1");
      fireEvent.change(screen.getByLabelText("Digit 1"), { target: { value: "123456" } });

      fireEvent.click(screen.getByRole("button", { name: "Send a new code" }));
      await waitFor(() => expect(signIn.resetPasswordEmailCode.sendCode).toHaveBeenCalledTimes(2));
      expect(screen.getByLabelText("Digit 1")).toHaveValue("");

      fireEvent.click(screen.getByRole("button", { name: "Use another email" }));
      expect(await screen.findByRole("heading", { name: "Reset your password" })).toBeVisible();
      expect(signIn.reset).toHaveBeenCalledOnce();
      expect(screen.getByLabelText(/Email address/)).toHaveValue("admin@rivetjo.com");
    });

    it("verifies the code, saves the new password, signs out other sessions and finalizes the session", async () => {
      const signIn = resetSignIn();
      render(<PasswordSignIn redirectUrl="/customer/gyms/forge?branchId=abdoun" />);
      await requestResetCode();
      await screen.findByLabelText("Digit 1");

      fireEvent.change(screen.getByLabelText("Digit 1"), { target: { value: "123456" } });
      fireEvent.change(screen.getByLabelText(/New password/), { target: { value: "a-new-secret-1" } });
      fireEvent.click(screen.getByRole("button", { name: /Save password and sign in/ }));

      await waitFor(() => expect(signIn.finalize).toHaveBeenCalledOnce());
      expect(signIn.resetPasswordEmailCode.verifyCode).toHaveBeenCalledWith({ code: "123456" });
      expect(signIn.resetPasswordEmailCode.submitPassword).toHaveBeenCalledWith({ password: "a-new-secret-1", signOutOfOtherSessions: true });
      expect(signIn.mfa.sendEmailCode).not.toHaveBeenCalled();
      await waitFor(() => expect(navigation.router.replace).toHaveBeenCalledWith("/login?next=%2Fcustomer%2Fgyms%2Fforge%3FbranchId%3Dabdoun"));
    });

    it("does not repeat the accepted code when the new password is refused", async () => {
      const signIn = resetSignIn({ submitPassword: { error: { code: "form_password_pwned" } } });
      render(<PasswordSignIn />);
      await requestResetCode();
      await screen.findByLabelText("Digit 1");

      fireEvent.change(screen.getByLabelText("Digit 1"), { target: { value: "123456" } });
      fireEvent.change(screen.getByLabelText(/New password/), { target: { value: "password123" } });
      fireEvent.click(screen.getByRole("button", { name: /Save password and sign in/ }));

      expect(await screen.findByRole("alert")).toHaveTextContent("This password is not safe to use.");
      expect(signIn.finalize).not.toHaveBeenCalled();
      // The code is spent: only the password is asked for now.
      expect(screen.getByRole("heading", { name: "Choose a new password" })).toBeVisible();
      expect(screen.queryByLabelText("Digit 1")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Send a new code" })).not.toBeInTheDocument();

      signIn.resetPasswordEmailCode.submitPassword.mockImplementation(async () => {
        signIn.status = "complete";
        return { error: null };
      });
      fireEvent.change(screen.getByLabelText(/New password/), { target: { value: "a-new-secret-1" } });
      fireEvent.click(screen.getByRole("button", { name: /Save password and sign in/ }));

      await waitFor(() => expect(signIn.finalize).toHaveBeenCalledOnce());
      expect(signIn.resetPasswordEmailCode.verifyCode).toHaveBeenCalledOnce();
      expect(signIn.resetPasswordEmailCode.submitPassword).toHaveBeenCalledTimes(2);
    });

    it("shows a finalize failure and retries only the finalize", async () => {
      const signIn = resetSignIn();
      signIn.finalize.mockRejectedValueOnce({ errors: [{ message: "The session could not be finalized." }] });
      render(<PasswordSignIn />);
      await requestResetCode();
      await screen.findByLabelText("Digit 1");

      fireEvent.change(screen.getByLabelText("Digit 1"), { target: { value: "123456" } });
      fireEvent.change(screen.getByLabelText(/New password/), { target: { value: "a-new-secret-1" } });
      fireEvent.click(screen.getByRole("button", { name: /Save password and sign in/ }));
      expect(await screen.findByRole("alert")).toHaveTextContent("The session could not be finalized.");

      fireEvent.click(screen.getByRole("button", { name: /Save password and sign in/ }));
      await waitFor(() => expect(signIn.finalize).toHaveBeenCalledTimes(2));
      expect(signIn.resetPasswordEmailCode.verifyCode).toHaveBeenCalledOnce();
      expect(signIn.resetPasswordEmailCode.submitPassword).toHaveBeenCalledOnce();
    });

    it("hands a second factor to the normal second step, with no reset code or password carried over", async () => {
      const signIn = resetSignIn({ afterSubmit: "needs_second_factor", supportedSecondFactors: [{ strategy: "email_code" }] });
      signIn.mfa.verifyEmailCode.mockImplementation(async () => {
        signIn.status = "complete";
        return { error: null };
      });
      render(<PasswordSignIn />);
      await requestResetCode();
      await screen.findByLabelText("Digit 1");

      fireEvent.change(screen.getByLabelText("Digit 1"), { target: { value: "123456" } });
      fireEvent.change(screen.getByLabelText(/New password/), { target: { value: "a-new-secret-1" } });
      fireEvent.click(screen.getByRole("button", { name: /Save password and sign in/ }));

      await waitFor(() => expect(signIn.mfa.sendEmailCode).toHaveBeenCalledOnce());
      expect(await screen.findByText("We sent a 6-digit code to your email. Enter it to finish signing in.")).toBeVisible();
      expect(signIn.finalize).not.toHaveBeenCalled();
      expect(screen.getByLabelText("Digit 1")).toHaveValue("");

      fireEvent.change(screen.getByLabelText("Digit 1"), { target: { value: "654321" } });
      fireEvent.click(screen.getByRole("button", { name: /Verify and continue/i }));
      await waitFor(() => expect(signIn.mfa.verifyEmailCode).toHaveBeenCalledWith({ code: "654321" }));
      await waitFor(() => expect(signIn.finalize).toHaveBeenCalledOnce());
      // The second step's own way back starts the whole sign-in over.
    });

    it("returns to the sign-in form from the second step after a reset", async () => {
      const signIn = resetSignIn({ afterSubmit: "needs_client_trust", supportedSecondFactors: [{ strategy: "email_code" }] });
      render(<PasswordSignIn />);
      await requestResetCode();
      await screen.findByLabelText("Digit 1");
      fireEvent.change(screen.getByLabelText("Digit 1"), { target: { value: "123456" } });
      fireEvent.change(screen.getByLabelText(/New password/), { target: { value: "a-new-secret-1" } });
      fireEvent.click(screen.getByRole("button", { name: /Save password and sign in/ }));
      fireEvent.click(await screen.findByRole("button", { name: "Use another account" }));

      expect(await screen.findByRole("button", { name: "Sign in" })).toBeVisible();
      expect(signIn.reset).toHaveBeenCalledOnce();
      expect(screen.getByRole("button", { name: "Forgot password?" })).toBeVisible();
    });

    it("says another step is needed when Clerk reports a status the form cannot show", async () => {
      resetSignIn({ afterSubmit: "needs_protect_check" });
      render(<PasswordSignIn />);
      await requestResetCode();
      await screen.findByLabelText("Digit 1");
      fireEvent.change(screen.getByLabelText("Digit 1"), { target: { value: "123456" } });
      fireEvent.change(screen.getByLabelText(/New password/), { target: { value: "a-new-secret-1" } });
      fireEvent.click(screen.getByRole("button", { name: /Save password and sign in/ }));

      expect(await screen.findByRole("alert")).toHaveTextContent("Sign-in needs another step. Try again or contact RIVET support.");
    });

    it("renders the whole reset in Arabic, right to left, with the email, code and passwords left to right", async () => {
      const signIn = resetSignIn();
      const { container } = render(<LocaleProvider initialLocale="ar"><PasswordSignIn /></LocaleProvider>);

      fireEvent.change(container.querySelector("#login-email")!, { target: { value: "member@example.com" } });
      fireEvent.click(screen.getByRole("button", { name: "نسيت كلمة المرور؟" }));
      expect(screen.getByRole("heading", { name: "إعادة تعيين كلمة المرور" })).toBeVisible();
      expect(screen.getByText("يرجى إدخال بريدك الإلكتروني. سنرسل إليك رمزًا.")).toBeVisible();
      expect(container.querySelector("#reset-email")).toHaveAttribute("dir", "ltr");
      expect(container.querySelector("#reset-email")).toHaveValue("member@example.com");
      expect(screen.getByRole("button", { name: "الرجوع إلى تسجيل الدخول" })).toBeVisible();
      expect(container.querySelector('[class*="rtl:rotate-180"]')).not.toBeNull();
      expect(container.innerHTML).not.toMatch(/\b(?:ml|mr|pl|pr)-\d|text-(?:left|right)/);

      fireEvent.click(screen.getByRole("button", { name: /إرسال الرمز/ }));
      expect(await screen.findByRole("heading", { name: "تحقّق من بريدك الإلكتروني" })).toBeVisible();
      expect(signIn.create).toHaveBeenCalledWith({ identifier: "member@example.com" });
      expect(screen.getByText("أدخل الرمز المرسل إلى بريدك الإلكتروني. بعد ذلك، يرجى اختيار كلمة مرور جديدة.")).toBeVisible();
      expect(screen.getByText("رمز إعادة التعيين")).toBeVisible();
      expect(container.querySelector("#login-code-0")!.parentElement).toHaveAttribute("dir", "ltr");
      expect(container.querySelector("#reset-new-password")!.parentElement).toHaveAttribute("dir", "ltr");
      expect(screen.getByLabelText(/كلمة المرور الجديدة/)).toHaveAttribute("placeholder", "أدخل كلمة المرور الجديدة");
      expect(screen.getByRole("button", { name: "إعادة إرسال الرمز" })).toBeVisible();
      expect(screen.getByRole("button", { name: "استخدام بريد إلكتروني آخر" })).toBeVisible();
      expect(container.innerHTML).not.toMatch(/\b(?:ml|mr|pl|pr)-\d|text-(?:left|right)/);

      // Arabic and Persian digits are accepted into the code boxes and sent as Latin digits.
      fireEvent.change(container.querySelector("#login-code-0")!, { target: { value: "١٢٣۴۵۶" } });
      fireEvent.change(container.querySelector("#reset-new-password")!, { target: { value: "a-new-secret-1" } });
      fireEvent.click(screen.getByRole("button", { name: /حفظ كلمة المرور وتسجيل الدخول/ }));
      await waitFor(() => expect(signIn.resetPasswordEmailCode.verifyCode).toHaveBeenCalledWith({ code: "123456" }));
      await waitFor(() => expect(signIn.finalize).toHaveBeenCalledOnce());
    });

    it("translates a retained reset error when the language is switched, without repeating the request", async () => {
      const signIn = resetSignIn({ verifyCode: { error: { code: "form_code_incorrect", longMessage: "__clerk_ticket=private" } } });
      function Switch() { const { setLocale } = useLocale(); return <button onClick={() => setLocale("en")}>English</button>; }
      const { container } = render(<LocaleProvider initialLocale="ar"><Switch /><PasswordSignIn /></LocaleProvider>);
      fireEvent.change(container.querySelector("#login-email")!, { target: { value: "member@example.com" } });
      fireEvent.click(screen.getByRole("button", { name: "نسيت كلمة المرور؟" }));
      fireEvent.click(screen.getByRole("button", { name: /إرسال الرمز/ }));
      await screen.findByLabelText("الرقم 1");
      fireEvent.change(screen.getByLabelText("الرقم 1"), { target: { value: "000000" } });
      fireEvent.change(container.querySelector("#reset-new-password")!, { target: { value: "a-new-secret-1" } });
      fireEvent.click(screen.getByRole("button", { name: /حفظ كلمة المرور وتسجيل الدخول/ }));
      expect(await screen.findByRole("alert")).toHaveTextContent("الرمز غير صحيح.");

      fireEvent.click(screen.getByRole("button", { name: "English" }));
      expect(screen.getByRole("alert")).toHaveTextContent("That code is not correct. Try again.");
      expect(container.querySelector("#reset-new-password")).toHaveValue("a-new-secret-1");
      expect(signIn.resetPasswordEmailCode.verifyCode).toHaveBeenCalledOnce();
      expect(container).not.toHaveTextContent("private");
    });
  });

});


afterEach(() => {
  localStorage.clear();
  document.cookie = "rivet_locale=; path=/; max-age=0";
  document.cookie = "rivet_ui_locale_v1=; path=/; max-age=0";
  document.documentElement.lang = "en";
  document.documentElement.dir = "ltr";
  document.documentElement.classList.remove("rtl-font");
});
