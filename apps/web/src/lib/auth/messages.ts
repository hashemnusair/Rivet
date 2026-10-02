import type { MessageDescriptor, TFunction, TKey } from "../i18n/core";
import { auth } from "../i18n/messages/en/auth";
import { authErrors } from "../i18n/messages/en/authErrors";

/** Only known provider codes/copy cross the presentation boundary. Unknown
 * diagnostics (including invitation tickets) are never printed in the UI. */
const CODE_KEYS: Readonly<Record<string, TKey>> = {
  form_password_incorrect: "authErrors.passwordIncorrect",
  form_password_validation_failed: "authErrors.passwordIncorrect",
  form_password_or_identifier_incorrect: "auth.signIn.errors.incorrect",
  form_identifier_not_found: "auth.signIn.errors.incorrect",
  form_identifier_exists: "authErrors.identifierExists",
  identifier_already_exists: "authErrors.identifierExists",
  email_address_exists: "authErrors.existingEmail",
  form_password_length_too_short: "authErrors.passwordShort",
  form_password_not_strong_enough: "authErrors.passwordWeak",
  form_password_pwned: "authErrors.passwordCompromised",
  form_password_compromised: "authErrors.passwordCompromised",
  form_password_untrusted: "authErrors.passwordCompromised",
  form_password_matches_identifier: "authErrors.passwordMatchesIdentifier",
  form_code_incorrect: "authErrors.codeIncorrect",
  form_verification_expired: "authErrors.codeExpired",
  verification_expired: "authErrors.codeExpired",
  verification_failed: "authErrors.codeIncorrect",
  verification_failed_max_attempts: "authErrors.verificationAttempts",
  too_many_requests: "apiErrors.rateLimited",
  rate_limit_exceeded: "apiErrors.rateLimited",
  session_expired: "authErrors.sessionExpired",
  session_exists: "auth.identity.signedIn",
  not_allowed_access: "authErrors.notAllowed",
  form_param_format_invalid__email_address: "authErrors.email",
  form_param_format_invalid__phone_number: "authErrors.phoneInvalid",
  form_param_format_invalid__password: "authErrors.passwordWeak",
  captcha_invalid: "authErrors.securityFailed",
  captcha_missing: "authErrors.securityFailed",
  captcha_verification_failed: "authErrors.securityFailed",
  network_error: "authErrors.networkError",
};
const LEGACY = new Map<string, TKey>();
function index(tree: Record<string, unknown>, prefix: string) {
  for (const [key, value] of Object.entries(tree)) {
    if (typeof value === "string" && !value.includes("{")) LEGACY.set(value, `${prefix}.${key}` as TKey);
    else if (value && typeof value === "object") index(value as Record<string, unknown>, `${prefix}.${key}`);
  }
}
index(auth, "auth"); index(authErrors, "authErrors");

export class AuthFlowError extends Error {
  constructor(readonly descriptor: MessageDescriptor) { super(descriptor.key); this.name = "AuthFlowError"; }
}
function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}
export function authMessage(error: unknown, fallback: TKey): MessageDescriptor {
  if (error instanceof AuthFlowError) return error.descriptor;
  const outer = record(error);
  const first = Array.isArray(outer.errors) && outer.errors.length ? record(outer.errors[0]) : outer;
  const code = typeof first.code === "string" ? first.code.toLowerCase() : "";
  const meta = record(first.meta);
  const param = typeof first.paramName === "string" ? first.paramName : typeof meta.paramName === "string" ? meta.paramName : typeof meta.param_name === "string" ? meta.param_name : "";
  const canonicalParam = param.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
  const key = CODE_KEYS[`${code}__${canonicalParam}`] ?? CODE_KEYS[code];
  if (key) return { key };
  // Compatibility with SDK/tests predating structured field errors.
  for (const source of [first.longMessage, first.long_message, first.message]) {
    const legacy = typeof source === "string" ? LEGACY.get(source) : undefined;
    if (legacy) return { key: legacy };
  }
  return { key: fallback };
}

const FIELD_KEYS: Readonly<Record<string, TKey>> = {
  first_name: "authErrors.firstName", firstName: "authErrors.firstName",
  last_name: "authErrors.lastName", lastName: "authErrors.lastName",
  email_address: "authErrors.emailAddress", emailAddress: "authErrors.emailAddress",
  phone_number: "authErrors.phoneNumber", phoneNumber: "authErrors.phoneNumber",
  username: "authErrors.username", password: "authErrors.password",
};
export function renderAuthMessage(message: MessageDescriptor, t: TFunction): string {
  if (message.key !== "authErrors.missingFields") return t(message.key, message.params);
  const fields = String(message.params?.fields ?? "").split(",").map(field => t(FIELD_KEYS[field] ?? "authErrors.additionalField")).join(" · ");
  return t(message.key, { fields });
}
export function authErrorText(error: unknown, fallback: TKey, t: TFunction): string {
  return renderAuthMessage(authMessage(error, fallback), t);
}
