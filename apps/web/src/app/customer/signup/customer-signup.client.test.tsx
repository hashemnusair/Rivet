import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CustomerSignupClient, resolveCustomerSignupContext } from "./customer-signup.client";

const state = vi.hoisted(() => ({
  signUp: null as null | {
    status: "missing_requirements" | "complete";
    missingFields: string[];
    unverifiedFields: string[];
    phoneNumber: string | null;
    isTransferable: boolean;
    password: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    finalize: ReturnType<typeof vi.fn>;
    reset: ReturnType<typeof vi.fn>;
    verifications: {
      sendEmailCode: ReturnType<typeof vi.fn>;
      verifyEmailCode: ReturnType<typeof vi.fn>;
      sendPhoneCode: ReturnType<typeof vi.fn>;
      verifyPhoneCode: ReturnType<typeof vi.fn>;
    };
  },
  errors: { fields: {} as Record<string, unknown> },
  router: { replace: vi.fn() },
  decorateReturnTo: ((url: string) => url) as (url: string) => string,
  registerCustomer: vi.fn(),
  auth: { isLoaded: true, isSignedIn: false },
}));

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => state.auth,
  useSignUp: () => ({ signUp: state.signUp, errors: state.errors, fetchStatus: "idle" }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => state.router,
}));

vi.mock("@/lib/api/client", () => ({
  getApi: () => ({ registerCustomer: state.registerCustomer }),
}));

vi.mock("@/app/login/portals", () => ({
  PORTALS: {
    member: {
      id: "member",
      href: "/login",
      title: "Gym member",
      blurb: "Your memberships, visits, receipts and entry QR.",
      signUpTitle: "Create a member account",
      icon: () => null,
    },
  },
}));

vi.mock("@/app/login/login-chrome", () => ({
  LoginLayout: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
  PortalHeading: ({ portal }: { portal: { signUpTitle?: string; title: string } }) => <h1>{portal.signUpTitle ?? portal.title}</h1>,
}));

function makeSignUp() {
  const signUp = {
    status: "missing_requirements" as "missing_requirements" | "complete",
    missingFields: [] as string[],
    unverifiedFields: ["email_address"],
    phoneNumber: null as string | null,
    isTransferable: false,
    password: vi.fn().mockResolvedValue({ error: null }),
    update: vi.fn().mockImplementation(async ({ phoneNumber }: { phoneNumber: string }) => {
      signUp.phoneNumber = phoneNumber;
      signUp.missingFields = signUp.missingFields.filter((field) => field !== "phone_number");
      return { error: null };
    }),
    finalize: vi.fn().mockImplementation(async (params?: { navigate?: (input: { decorateUrl: (url: string) => string }) => Promise<void> }) => {
      if (params?.navigate) await params.navigate({ decorateUrl: state.decorateReturnTo });
      return { error: null };
    }),
    reset: vi.fn().mockResolvedValue({ error: null }),
    verifications: {
      sendEmailCode: vi.fn().mockResolvedValue({ error: null }),
      verifyEmailCode: vi.fn().mockImplementation(async () => {
        signUp.status = "complete";
        return { error: null };
      }),
      sendPhoneCode: vi.fn().mockResolvedValue({ error: null }),
      verifyPhoneCode: vi.fn().mockImplementation(async () => {
        signUp.status = "complete";
        return { error: null };
      }),
    },
  };
  return signUp;
}

describe("CustomerSignupClient", () => {
  beforeEach(() => {
    state.signUp = makeSignUp();
    state.errors = { fields: {} };
    state.router.replace.mockReset();
    state.decorateReturnTo = (url) => url;
    state.registerCustomer.mockReset().mockResolvedValue({ id: "profile-created" });
    state.auth = { isLoaded: true, isSignedIn: false };
    window.history.replaceState({}, "", "/login/member/create?returnTo=%2Fcustomer%2Fgyms%2Fforge%3FbranchId%3Dabdoun%26plan%3DPro%26interval%3Dannual");
  });

  it("keeps only safe gym context and rejects caller-supplied member claims", () => {
    expect(resolveCustomerSignupContext("?returnTo=%2Fcustomer%2Fgyms%2Fforge%3FbranchId%3Dabdoun%26plan%3DPro%26interval%3Dannual%26customerId%3Dforeign")).toEqual({
      returnTo: "/customer/gyms/forge?branchId=abdoun&plan=Pro&interval=annual",
      gymId: "forge",
      branchId: "abdoun",
      plan: "Pro",
      interval: "annual",
    });
    expect(resolveCustomerSignupContext("?returnTo=https%3A%2F%2Fevil.example%2Ftakeover&customerId=foreign")).toEqual({ returnTo: "/customer/discover" });
  });

  it("creates through Clerk, verifies email, finalizes, then creates the authenticated profile and returns to the gym", async () => {
    const signUp = state.signUp!;
    render(<CustomerSignupClient />);

    fireEvent.change(screen.getByLabelText(/Full name/), { target: { value: " Lina Haddad " } });
    fireEvent.change(screen.getByLabelText(/Email address/), { target: { value: "lina@example.com" } });
    fireEvent.change(screen.getByLabelText(/Mobile number/), { target: { value: "+962790000000" } });
    fireEvent.change(screen.getByLabelText(/Gender/), { target: { value: "female" } });
    fireEvent.change(screen.getByLabelText(/^Password/), { target: { value: "secret-password" } });
    fireEvent.change(screen.getByLabelText(/Confirm password/), { target: { value: "secret-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() => {
      expect(signUp.password).toHaveBeenCalledWith({
        emailAddress: "lina@example.com",
        phoneNumber: "+962790000000",
        password: "secret-password",
        firstName: "Lina",
        lastName: "Haddad",
      });
      expect(signUp.verifications.sendEmailCode).toHaveBeenCalledOnce();
    });

    fireEvent.change(screen.getByLabelText(/verification code/i), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify and continue" }));

    await waitFor(() => {
      expect(signUp.verifications.verifyEmailCode).toHaveBeenCalledWith({ code: "123456" });
      expect(signUp.finalize).toHaveBeenCalledWith({ navigate: expect.any(Function) });
      expect(state.registerCustomer).toHaveBeenCalledWith({ fullName: "Lina Haddad", email: "lina@example.com", phone: "+962790000000", gender: "female" });
      expect(state.registerCustomer.mock.calls[0]?.[0]).not.toHaveProperty("customerId");
      expect(state.registerCustomer.mock.calls[0]?.[0]).not.toHaveProperty("password");
      expect(state.router.replace).toHaveBeenCalledWith("/customer/gyms/forge?branchId=abdoun&plan=Pro&interval=annual");
    });
  });

  it("uses Clerk's decorated return URL when finalizing the session", async () => {
    state.decorateReturnTo = (url) => `${url}&__clerk_touch=1`;
    render(<CustomerSignupClient />);

    for (const [label, value] of [[/Full name/, "Lina Haddad"], [/Email address/, "lina@example.com"], [/Mobile number/, "+962790000000"], [/^Password/, "secret-password"], [/Confirm password/, "secret-password"]] as const) {
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
    }
    fireEvent.change(screen.getByLabelText(/Gender/), { target: { value: "female" } });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    await waitFor(() => expect(screen.getByLabelText(/verification code/i)).toBeVisible());
    fireEvent.change(screen.getByLabelText(/verification code/i), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify and continue" }));

    await waitFor(() => expect(state.router.replace).toHaveBeenCalledWith("/customer/gyms/forge?branchId=abdoun&plan=Pro&interval=annual&__clerk_touch=1"));
  });

  it("shows an existing-account sign-in path and does not call the customer API when Clerk rejects the identifier", async () => {
    state.signUp!.password.mockResolvedValue({ error: { code: "form_identifier_exists", longMessage: "This email is already in use." } });
    render(<CustomerSignupClient />);

    fireEvent.change(screen.getByLabelText(/Full name/), { target: { value: "Lina Haddad" } });
    fireEvent.change(screen.getByLabelText(/Email address/), { target: { value: "lina@example.com" } });
    fireEvent.change(screen.getByLabelText(/Mobile number/), { target: { value: "+962790000000" } });
    fireEvent.change(screen.getByLabelText(/Gender/), { target: { value: "female" } });
    fireEvent.change(screen.getByLabelText(/^Password/), { target: { value: "secret-password" } });
    fireEvent.change(screen.getByLabelText(/Confirm password/), { target: { value: "secret-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() => {
      expect(screen.getAllByRole("alert").some((node) => node.textContent?.includes("already in use"))).toBe(true);
    });
    expect(screen.getAllByRole("link", { name: "Sign in" })[0]).toHaveAttribute("href", "/login?next=%2Fcustomer%2Fgyms%2Fforge%3FbranchId%3Dabdoun%26plan%3DPro%26interval%3Dannual");
    expect(state.registerCustomer).not.toHaveBeenCalled();
  });

  it("associates validation errors with their controls", async () => {
    render(<CustomerSignupClient />);

    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByText("Enter your full name")).toHaveAttribute("id", "customer-signup-name-error");
    expect(screen.getByLabelText(/Full name/)).toHaveAttribute("aria-describedby", "customer-signup-name-error");
    expect(screen.getByLabelText(/Mobile number/)).toHaveAttribute("aria-describedby", "customer-signup-phone-error");
  });

  it("submits and verifies a required phone number when Clerk asks for it", async () => {
    const signUp = state.signUp!;
    signUp.missingFields = ["phone_number"];
    signUp.unverifiedFields = ["phone_number"];
    signUp.verifications.verifyPhoneCode.mockImplementationOnce(async () => {
      signUp.status = "complete";
      return { error: null };
    });
    render(<CustomerSignupClient />);

    for (const [label, value] of [[/Full name/, "Lina Haddad"], [/Email address/, "lina@example.com"], [/Mobile number/, "+962790000000"], [/^Password/, "secret-password"], [/Confirm password/, "secret-password"]] as const) {
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
    }
    fireEvent.change(screen.getByLabelText(/Gender/), { target: { value: "female" } });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() => {
      expect(signUp.password).toHaveBeenCalledWith(expect.objectContaining({ phoneNumber: "+962790000000" }));
      expect(signUp.update).toHaveBeenCalledWith({ phoneNumber: "+962790000000" });
      expect(signUp.verifications.sendPhoneCode).toHaveBeenCalledOnce();
    });
    fireEvent.change(screen.getByLabelText(/Phone verification code/), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify and continue" }));

    await waitFor(() => {
      expect(signUp.verifications.verifyPhoneCode).toHaveBeenCalledWith({ code: "123456" });
      expect(state.registerCustomer).toHaveBeenCalledWith(expect.objectContaining({ phone: "+962790000000" }));
    });
  });

  it("keeps an authenticated profile retryable if Convex is temporarily unavailable after Clerk finalizes", async () => {
    const signUp = state.signUp!;
    state.registerCustomer.mockRejectedValueOnce(new Error("temporary"));
    render(<CustomerSignupClient />);

    for (const [label, value] of [[/Full name/, "Lina Haddad"], [/Email address/, "lina@example.com"], [/Mobile number/, "+962790000000"], [/^Password/, "secret-password"], [/Confirm password/, "secret-password"]] as const) {
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
    }
    fireEvent.change(screen.getByLabelText(/Gender/), { target: { value: "female" } });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    await waitFor(() => expect(screen.getByLabelText(/verification code/i)).toBeVisible());
    fireEvent.change(screen.getByLabelText(/verification code/i), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify and continue" }));

    await waitFor(() => expect(screen.getByRole("button", { name: /Finish member setup/ })).toBeVisible());
    expect(screen.getByRole("alert")).toHaveTextContent(/could not finish/i);
    fireEvent.click(screen.getByRole("button", { name: /Finish member setup/ }));
    await waitFor(() => expect(state.registerCustomer).toHaveBeenCalledTimes(2));
    expect(signUp.finalize).toHaveBeenCalledOnce();
    expect(state.router.replace).toHaveBeenCalledWith("/customer/gyms/forge?branchId=abdoun&plan=Pro&interval=annual");
  });
});
