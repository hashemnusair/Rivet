import { LocaleProvider, useLocale } from "@/lib/i18n/provider";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PasswordSignIn } from "./password-sign-in.client";

const clerk = vi.hoisted(() => ({
  hook: {
    signIn: null as unknown,
    errors: { fields: { identifier: null, password: null, code: null } },
    fetchStatus: "idle" as const,
  },
}));

const navigation = vi.hoisted(() => ({ router: { replace: vi.fn() } }));

vi.mock("@clerk/nextjs", () => ({
  useSignIn: () => clerk.hook,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => navigation.router,
}));

describe("PasswordSignIn", () => {
  beforeEach(() => {
    navigation.router.replace.mockReset();
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
    expect(screen.getByLabelText(/Email address/)).toHaveAttribute("placeholder", "Enter email");
    expect(screen.getByLabelText(/Password/)).toHaveAttribute("placeholder", "Enter password");
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

});


afterEach(() => {
  localStorage.clear();
  document.cookie = "rivet_locale=; path=/; max-age=0";
  document.cookie = "rivet_ui_locale_v1=; path=/; max-age=0";
  document.documentElement.lang = "en";
  document.documentElement.dir = "ltr";
  document.documentElement.classList.remove("rtl-font");
});
