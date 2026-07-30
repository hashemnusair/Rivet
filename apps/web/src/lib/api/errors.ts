/**
 * Single API error envelope (docs/06). Frontend code keys off stable `code`
 * values, never off message text.
 */
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
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

  constructor(body: ApiErrorBody["error"]) {
    super(body.message);
    this.name = "ApiError";
    this.code = body.code;
    this.requestId = body.requestId;
    this.details = body.details;
    this.fieldErrors = body.fieldErrors;
  }

  static of(code: string, message: string, extra?: { fieldErrors?: Record<string, string[]>; details?: Record<string, unknown> }): ApiError {
    return new ApiError({
      code,
      message,
      requestId: `mock-${Math.random().toString(36).slice(2, 10)}`,
      fieldErrors: extra?.fieldErrors,
      details: extra?.details,
    });
  }
}

export const ERR = {
  VALIDATION: "VALIDATION_ERROR",
  NOT_FOUND: "NOT_FOUND",
  FORBIDDEN: "FORBIDDEN",
  UNAUTHENTICATED: "UNAUTHENTICATED",
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
} as const;

export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError;
}
