import type { MessageVars } from "../i18n/dictionary";
import { defaultErrorDescriptor, fieldErrorDescriptors, legacyErrorDescriptor, parseErrorDescriptor, type ErrorMessageDescriptor } from "../i18n/error-messages";
import { createTranslator } from "../i18n/core";
import type { Locale } from "../i18n/locale";
import { localizeErrorParameters } from "../i18n/error-parameters";

/**
 * Single API error envelope (docs/06). Frontend code keys off stable `code`
 * values, never off message text.
 */
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    messageKey?: string;
    messageParams?: MessageVars;
    fieldMessages?: Record<string, ErrorMessageDescriptor[]>;
    details?: Record<string, unknown>;
    requestId: string;
    fieldErrors?: Record<string, string[]>;
  };
}

export class ApiError extends Error {
  readonly code: string;
  readonly requestId: string;
  readonly details?: Record<string, unknown>;
  readonly fieldErrors?: Record<string, string[]>;

  readonly messageDescriptor?: ErrorMessageDescriptor;
  readonly fieldMessages?: Record<string, ErrorMessageDescriptor[]>;
  readonly sourceMessage: string;
  readonly sourceFieldErrors?: Record<string, string[]>;

  constructor(body: ApiErrorBody["error"], source?: ApiError) {
    super(body.message);
    this.name = "ApiError";
    this.code = body.code;
    this.requestId = body.requestId;
    this.details = body.details;
    this.fieldErrors = body.fieldErrors;
    this.sourceMessage = source?.sourceMessage ?? body.message;
    this.sourceFieldErrors = source?.sourceFieldErrors ?? body.fieldErrors;
    this.messageDescriptor = parseErrorDescriptor({ key: body.messageKey, params: body.messageParams }) ?? source?.messageDescriptor ?? legacyErrorDescriptor(this.sourceMessage);
    this.fieldMessages = body.fieldMessages ?? source?.fieldMessages ?? fieldErrorDescriptors(body.fieldErrors, this.messageDescriptor ? { message: this.sourceMessage, descriptor: this.messageDescriptor } : undefined);
  }

  static of(code: string, message: string, extra?: { fieldErrors?: Record<string, string[]>; details?: Record<string, unknown>; message?: ErrorMessageDescriptor }): ApiError {
    return new ApiError({
      code,
      message,
      requestId: `mock-${Math.random().toString(36).slice(2, 10)}`,
      fieldErrors: extra?.fieldErrors,
      messageKey: extra?.message?.key,
      messageParams: extra?.message?.params,
      details: extra?.details,
    });
  }
}

export const ERR = {
  VALIDATION: "VALIDATION_ERROR",
  NOT_FOUND: "NOT_FOUND",
  FORBIDDEN: "FORBIDDEN",
  CONFLICT: "CONFLICT",
  UNAUTHENTICATED: "UNAUTHENTICATED",
  ORGANIZATION_SELECTION_REQUIRED: "ORGANIZATION_SELECTION_REQUIRED",
  INVITATION_NOT_ACCEPTED: "INVITATION_NOT_ACCEPTED",
  INVITATION_REVOKED: "INVITATION_REVOKED",
  IDENTITY_EMAIL_CONFLICT: "IDENTITY_EMAIL_CONFLICT",
  DUPLICATE_MEMBER: "DUPLICATE_MEMBER",
  MEMBERSHIP_NOT_ACTIVE: "MEMBERSHIP_NOT_ACTIVE",
  NO_OUTSTANDING_BALANCE: "NO_OUTSTANDING_BALANCE",
  PAYMENT_ALREADY_REFUNDED: "PAYMENT_ALREADY_REFUNDED",
  PAYMENT_ALREADY_VOIDED: "PAYMENT_ALREADY_VOIDED",
  VOID_WINDOW_EXPIRED: "VOID_WINDOW_EXPIRED",
  REFUND_EXCEEDS_AMOUNT: "REFUND_EXCEEDS_AMOUNT",
  SHIFT_ALREADY_OPEN: "SHIFT_ALREADY_OPEN",
  NO_OPEN_SHIFT: "NO_OPEN_SHIFT",
  FREEZE_ALLOWANCE_EXCEEDED: "FREEZE_ALLOWANCE_EXCEEDED",
  APPROVAL_REQUIRED: "APPROVAL_REQUIRED",
  FORCED_FAILURE: "FORCED_FAILURE",
  RATE_LIMITED: "RATE_LIMITED",
  CONFIGURATION: "CONFIGURATION_ERROR",
  FEATURE_NOT_AVAILABLE: "FEATURE_NOT_AVAILABLE",
  PLAN_LIMIT_REACHED: "PLAN_LIMIT_REACHED",
  EXTERNAL_SERVICE: "EXTERNAL_SERVICE_ERROR",
} as const;

export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError;
}


/** Present only known domain copy. Unknown exception details never become UI text. */
export function localizeApiError(error: unknown, locale: Locale): Error {
  const t = createTranslator(locale);
  if (!isApiError(error)) return new Error(t("apiErrors.unexpected"));
  const render = (descriptor: ErrorMessageDescriptor) => {
    const valid = parseErrorDescriptor(descriptor) ?? defaultErrorDescriptor("INTERNAL_ERROR");
    const params = localizeErrorParameters(valid.params, locale);
    return t(valid.key, params);
  };
  const descriptor = error.messageDescriptor ?? defaultErrorDescriptor(error.code);
  const known = error.messageDescriptor?.key !== "apiErrors.unexpected" && (error.messageDescriptor || defaultErrorDescriptor(error.code).key !== "apiErrors.unexpected");
  const message = locale === "en" && known ? error.sourceMessage : render(descriptor);
  const fields = locale === "en" ? error.sourceFieldErrors : error.fieldMessages && Object.fromEntries(Object.entries(error.fieldMessages).map(([field, messages]) => [field, messages.map(render)]));
  return new ApiError({ code: error.code, message, requestId: error.requestId, details: error.details, fieldErrors: fields, fieldMessages: error.fieldMessages, messageKey: error.messageDescriptor?.key, messageParams: error.messageDescriptor?.params }, error);
}
