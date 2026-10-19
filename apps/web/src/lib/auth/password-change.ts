import { isReverificationCancelledError } from "@clerk/nextjs/errors";
import type { MessageDescriptor, TKey } from "../i18n/core";
import { authMessage } from "./messages";

/** Clerk's own limits for a password, the same ones the sign-up forms check. */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

export type PasswordChangeField = "current" | "next" | "confirm";
export type PasswordChangeValues = Record<PasswordChangeField, string>;
export type PasswordChangeErrors = Partial<Record<PasswordChangeField, TKey>>;

/** The arguments of Clerk's `user.updatePassword`. */
export interface PasswordChangeRequest {
  newPassword: string;
  currentPassword?: string;
  signOutOfOtherSessions: boolean;
}

export type PasswordChangeFailure =
  | { kind: "cancelled" }
  | { kind: "field"; field: "current" | "next"; message: MessageDescriptor }
  | { kind: "form"; message: MessageDescriptor };

/**
 * Checks what can be checked before asking Clerk. Passwords are compared and
 * sent exactly as typed: trimming would change the secret. An account without
 * a password (`hasPassword` false) sets its first one, so there is no current
 * password to enter.
 */
export function validatePasswordChange(values: PasswordChangeValues, { hasPassword }: { hasPassword: boolean }): PasswordChangeErrors {
  const errors: PasswordChangeErrors = {};
  if (hasPassword && !values.current) errors.current = "auth.changePassword.errors.currentRequired";
  if (values.next.length < PASSWORD_MIN_LENGTH) errors.next = "authErrors.passwordMin";
  else if (values.next.length > PASSWORD_MAX_LENGTH) errors.next = "auth.validation.passwordMax";
  else if (hasPassword && values.next === values.current) errors.next = "auth.changePassword.errors.sameAsCurrent";
  if (values.confirm !== values.next) errors.confirm = "authErrors.passwordMismatch";
  return errors;
}

export function passwordChangeRequest(values: PasswordChangeValues, { hasPassword, signOutOfOtherSessions }: { hasPassword: boolean; signOutOfOtherSessions: boolean }): PasswordChangeRequest {
  return hasPassword
    ? { currentPassword: values.current, newPassword: values.next, signOutOfOtherSessions }
    : { newPassword: values.next, signOutOfOtherSessions };
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

/** Codes Clerk returns when the current password does not match. */
const CURRENT_PASSWORD_CODES = new Set(["form_password_incorrect", "form_password_validation_failed"]);
/** A breached password: the sign-in copy suggests a reset, which is the step
 * the person is already taking here. */
const UNSAFE_PASSWORD_CODES = new Set(["form_password_pwned", "form_password_compromised", "form_password_untrusted"]);

/**
 * Places a refused change next to the field that caused it. Clerk names the
 * field (`current_password` or `new_password`) on form errors; without one, a
 * wrong-password code belongs to the current password and any other password
 * rule (too short, found in a breach, same as the email) to the new one.
 * Everything else, including rate limits and network failures, is shown once
 * for the whole form through the shared auth error copy.
 */
export function passwordChangeFailure(error: unknown): PasswordChangeFailure {
  if (isReverificationCancelledError(error)) return { kind: "cancelled" };
  const outer = record(error);
  const first = Array.isArray(outer.errors) && outer.errors.length ? record(outer.errors[0]) : outer;
  const code = typeof first.code === "string" ? first.code.toLowerCase() : "";
  const meta = record(first.meta);
  const rawParam = [first.paramName, meta.paramName, meta.param_name].find((value): value is string => typeof value === "string") ?? "";
  const param = rawParam.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);

  if (param === "current_password" || (!param && CURRENT_PASSWORD_CODES.has(code))) {
    return {
      kind: "field",
      field: "current",
      message: CURRENT_PASSWORD_CODES.has(code) ? { key: "auth.changePassword.errors.currentIncorrect" } : authMessage(error, "auth.changePassword.errors.currentIncorrect"),
    };
  }
  if (param === "new_password" || param === "password" || (!param && code.startsWith("form_password"))) {
    return {
      kind: "field",
      field: "next",
      message: UNSAFE_PASSWORD_CODES.has(code) ? { key: "auth.changePassword.errors.unsafe" } : authMessage(error, "authErrors.passwordWeak"),
    };
  }
  return { kind: "form", message: authMessage(error, "auth.changePassword.errors.failed") };
}
