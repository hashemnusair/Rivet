import { describe, expect, it } from "vitest";
import { createTranslator } from "../i18n/core";
import { AuthFlowError, authErrorText, authMessage, renderAuthMessage } from "./messages";
const ar = createTranslator("ar");
const en = createTranslator("en");

describe("provider authentication message boundary", () => {
  it("uses stable codes and field metadata without exposing provider text", () => {
    expect(authErrorText({ code: "form_password_incorrect", longMessage: "diagnostic ticket=private" }, "authErrors.checkDetails", ar)).toBe("كلمة المرور غير صحيحة.");
    expect(authErrorText({ errors: [{ code: "form_param_format_invalid", meta: { param_name: "phone_number" }, message: "raw" }] }, "authErrors.checkDetails", ar)).toBe("أدخل رقم هاتف صحيحًا مع رمز الدولة.");
    expect(authErrorText({ code: "unknown", message: "ticket=private /internal/path" }, "authErrors.checkDetails", ar)).toBe("تحقّق من بياناتك وحاول مجددًا.");
    expect(authErrorText({ code: "unknown", message: "ticket=private /internal/path" }, "authErrors.checkDetails", en)).toBe("Check your details and try again.");
  });
  it("keeps retained errors reactive to locale and names required fields safely", () => {
    const stored = authMessage({ code: "form_code_incorrect" }, "authErrors.checkDetails");
    expect(renderAuthMessage(stored, en)).toBe("That code is not correct. Try again.");
    expect(renderAuthMessage(stored, ar)).toBe("الرمز غير صحيح. يرجى المحاولة مجددًا.");
    const required = { key: "authErrors.missingFields" as const, params: { fields: "phone_number,unknown_internal_field" } };
    expect(renderAuthMessage(required, ar)).toContain("رقم الهاتف المحمول · بيانات حساب إضافية");
    expect(renderAuthMessage(required, ar)).not.toContain("unknown_internal_field");
  });
  it("keeps known old messages and deliberate flow errors compatible", () => {
    expect(authErrorText({ errors: [{ longMessage: "Your password is incorrect." }] }, "authErrors.checkDetails", en)).toBe("Your password is incorrect.");
    expect(authErrorText(new AuthFlowError({ key: "auth.invitation.error.needsDetails" }), "authErrors.checkDetails", ar)).toBe(ar("auth.invitation.error.needsDetails"));
  });
});
