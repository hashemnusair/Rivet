import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PasswordInput } from "@/components/auth/password-input";
import { LocaleProvider, useT } from "@/lib/i18n/provider";
import { PortalHeading } from "./login-chrome";
import { PasswordSignIn } from "./password-sign-in.client";
import { PORTALS } from "./portals";
import { createProfileCompletionSchema } from "./profile-completion.client";
import { createInvitationAccountSchema, invitationErrorMessage } from "./accept-invitation/accept-invitation.client";

vi.mock("@clerk/nextjs", () => ({
  useSignIn: () => ({
    signIn: null,
    errors: { fields: { identifier: null, password: null, code: null } },
    fetchStatus: "idle",
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
}));

function Translator({ onReady }: { onReady: (t: ReturnType<typeof useT>) => void }) {
  onReady(useT());
  return null;
}

function arabicT() {
  let translate!: ReturnType<typeof useT>;
  render(
    <LocaleProvider initialLocale="ar">
      <Translator onReady={(t) => { translate = t; }} />
    </LocaleProvider>,
  );
  return translate;
}

describe("sign-in pages in Arabic", () => {
  it("renders the email and password form in Arabic with left-to-right fields", () => {
    render(
      <LocaleProvider initialLocale="ar">
        <PasswordSignIn />
      </LocaleProvider>,
    );

    expect(screen.getByLabelText(/البريد الإلكتروني/)).toHaveAttribute("dir", "ltr");
    expect(screen.getByLabelText(/البريد الإلكتروني/)).toHaveAttribute("placeholder", "أدخلوا البريد الإلكتروني");
    expect(screen.getByPlaceholderText("أدخلوا كلمة المرور")).toBeVisible();
    expect(screen.getByRole("button", { name: "تسجيل الدخول" })).toBeVisible();
    expect(screen.getByRole("link", { name: "إنشاء حساب مجاني" })).toBeVisible();
    expect(screen.getByRole("button", { name: "إظهار كلمة المرور" })).toBeVisible();
  });

  it("names each door from the catalogue", () => {
    render(
      <LocaleProvider initialLocale="ar">
        <PortalHeading portal={PORTALS.staff} />
      </LocaleProvider>,
    );
    expect(screen.getByRole("heading", { name: "فريق النادي" })).toBeVisible();
    expect(screen.getByText("لملاك النوادي وموظفيها.")).toBeVisible();
  });

  it("keeps the password reveal button on a fixed side so it never overlaps the field", () => {
    const { container } = render(
      <LocaleProvider initialLocale="ar">
        <PasswordInput id="p" />
      </LocaleProvider>,
    );
    expect(container.firstElementChild).toHaveAttribute("dir", "ltr");
  });

  it("translates field and invitation messages, and stays English without a provider", () => {
    const t = arabicT();
    const profile = createProfileCompletionSchema(t).safeParse({ firstName: "", lastName: "X" });
    expect(profile.success).toBe(false);
    expect(profile.error?.issues[0]?.message).toBe("يرجى إدخال اسمكم الأول");

    const invitation = createInvitationAccountSchema(t).safeParse({ firstName: "A", lastName: "B", password: "password-1", confirmPassword: "nope" });
    expect(invitation.error?.issues[0]?.message).toBe("كلمتا المرور غير متطابقتين");

    expect(invitationErrorMessage({ code: "invitation_expired" }, t)).toContain("انتهت صلاحية");
    expect(invitationErrorMessage({ code: "invitation_expired" })).toMatch(/has expired/);
  });
});
