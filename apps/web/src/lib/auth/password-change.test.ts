import { describe, expect, it } from "vitest";
import { passwordChangeFailure, passwordChangeRequest, validatePasswordChange } from "./password-change";

/** Clerk's own guard identifies a runtime error by its class's `kind`. */
class ReverificationCancelled extends Error {
  static kind = "ClerkRuntimeError";
  code = "reverification_cancelled";
}

const clerkError = (code: string, paramName?: string) => ({ errors: [{ code, message: "", meta: paramName ? { paramName } : {} }] });

describe("validatePasswordChange", () => {
  it("asks for every field before anything is sent", () => {
    expect(validatePasswordChange({ current: "", next: "", confirm: "" }, { hasPassword: true })).toEqual({
      current: "auth.changePassword.errors.currentRequired",
      next: "authErrors.passwordMin",
    });
  });

  it("applies Clerk's length limits and refuses reusing the current password", () => {
    expect(validatePasswordChange({ current: "old-secret", next: "short", confirm: "short" }, { hasPassword: true }).next).toBe("authErrors.passwordMin");
    const long = "x".repeat(129);
    expect(validatePasswordChange({ current: "old-secret", next: long, confirm: long }, { hasPassword: true }).next).toBe("auth.validation.passwordMax");
    expect(validatePasswordChange({ current: "same-secret", next: "same-secret", confirm: "same-secret" }, { hasPassword: true }).next).toBe("auth.changePassword.errors.sameAsCurrent");
  });

  it("requires the confirmation to match exactly, spaces included", () => {
    expect(validatePasswordChange({ current: "old-secret", next: "new secret ", confirm: "new secret" }, { hasPassword: true })).toEqual({ confirm: "authErrors.passwordMismatch" });
    expect(validatePasswordChange({ current: "old-secret", next: "new secret ", confirm: "new secret " }, { hasPassword: true })).toEqual({});
  });

  it("needs no current password when the account has none yet", () => {
    expect(validatePasswordChange({ current: "", next: "first-secret", confirm: "first-secret" }, { hasPassword: false })).toEqual({});
  });
});

describe("passwordChangeRequest", () => {
  it("sends the current password only when the account has one", () => {
    const values = { current: "old-secret", next: "new-secret", confirm: "new-secret" };
    expect(passwordChangeRequest(values, { hasPassword: true, signOutOfOtherSessions: true })).toEqual({ currentPassword: "old-secret", newPassword: "new-secret", signOutOfOtherSessions: true });
    expect(passwordChangeRequest(values, { hasPassword: false, signOutOfOtherSessions: false })).toEqual({ newPassword: "new-secret", signOutOfOtherSessions: false });
  });
});

describe("passwordChangeFailure", () => {
  it("puts a wrong current password on the current-password field", () => {
    expect(passwordChangeFailure(clerkError("form_password_incorrect", "current_password"))).toEqual({ kind: "field", field: "current", message: { key: "auth.changePassword.errors.currentIncorrect" } });
    expect(passwordChangeFailure(clerkError("form_password_validation_failed"))).toEqual({ kind: "field", field: "current", message: { key: "auth.changePassword.errors.currentIncorrect" } });
    expect(passwordChangeFailure(clerkError("form_param_missing", "currentPassword"))).toMatchObject({ kind: "field", field: "current" });
  });

  it("puts a refused new password on the new-password field with the rule it broke", () => {
    expect(passwordChangeFailure(clerkError("form_password_length_too_short", "new_password"))).toEqual({ kind: "field", field: "next", message: { key: "authErrors.passwordShort" } });
    expect(passwordChangeFailure(clerkError("form_password_not_strong_enough", "new_password"))).toEqual({ kind: "field", field: "next", message: { key: "authErrors.passwordWeak" } });
    expect(passwordChangeFailure(clerkError("form_password_matches_identifier"))).toEqual({ kind: "field", field: "next", message: { key: "authErrors.passwordMatchesIdentifier" } });
    expect(passwordChangeFailure(clerkError("form_password_pwned", "new_password"))).toEqual({ kind: "field", field: "next", message: { key: "auth.changePassword.errors.unsafe" } });
  });

  it("reports a cancelled identity check and anything else for the whole form", () => {
    expect(passwordChangeFailure(new ReverificationCancelled())).toEqual({ kind: "cancelled" });
    expect(passwordChangeFailure(clerkError("too_many_requests"))).toEqual({ kind: "form", message: { key: "apiErrors.rateLimited" } });
    expect(passwordChangeFailure(new Error("network down"))).toEqual({ kind: "form", message: { key: "auth.changePassword.errors.failed" } });
  });
});
