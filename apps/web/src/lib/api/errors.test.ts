import { describe, expect, it } from "vitest";
import { ApiError, ERR, isApiError, localizeApiError } from "./errors";
import { parseErrorDescriptor } from "../i18n/error-messages";

describe("localized API error boundary", () => {
  it("reads legacy envelopes while preserving code, request ID, details and field association", () => {
    const error = new ApiError({ code: ERR.VALIDATION, message: "Enter a valid phone number.", fieldErrors: { phone: ["Enter a valid phone number."] }, requestId: "request-42", details: { memberId: "MEM-42" } });
    const arabic = localizeApiError(error, "ar") as ApiError;
    expect(isApiError(arabic)).toBe(true);
    expect(arabic).toMatchObject({ code: ERR.VALIDATION, message: "أدخل رقم هاتف صحيحًا.", requestId: "request-42", details: error.details, fieldErrors: { phone: ["أدخل رقم هاتف صحيحًا."] } });
    expect(localizeApiError(arabic, "en")).toMatchObject({ message: error.message, fieldErrors: error.fieldErrors });
    expect(error.message).toBe("Enter a valid phone number.");
    expect(error.fieldErrors?.phone).toEqual(["Enter a valid phone number."]);
  });

  it("uses an explicit stable key even when the server changes its English wording", () => {
    const error = new ApiError({ code: ERR.FORBIDDEN, message: "Owner authorization required by policy revision 2", requestId: "request-43", messageKey: "apiErrors.forbidden" });
    expect(localizeApiError(error, "ar").message).toBe("ليس لديك صلاحية لتنفيذ هذا الإجراء. تواصل مع مالك النادي.");
    expect(localizeApiError(error, "en").message).toBe(error.message);
  });

  it("does not expose unknown exception or diagnostic text", () => {
    const exception = new Error("Internal stack detail with a private storage path");
    expect(localizeApiError(exception, "ar").message).toBe("حدث خطأ. يرجى المحاولة مجددًا.");
    expect(localizeApiError(exception, "en").message).toBe("Something went wrong. Please try again.");
    const unknown = new ApiError({ code: "FUTURE_ERROR", message: "future implementation detail", requestId: "request-44" });
    expect(localizeApiError(unknown, "ar").message).toBe("حدث خطأ. يرجى المحاولة مجددًا.");
    expect(localizeApiError(unknown, "en").message).toBe("Something went wrong. Please try again.");
  });

  it("rejects unknown keys and malformed params instead of throwing during render", () => {
    expect(parseErrorDescriptor({ key: "common.action.save" })).toBeUndefined();
    expect(parseErrorDescriptor({ key: "apiErrors.__proto__" })).toBeUndefined();
    expect(parseErrorDescriptor({ key: "apiErrors.forbidden", params: { count: NaN } })).toBeUndefined();
    expect(parseErrorDescriptor({ key: "apiErrors.forbidden", params: { count: {} } })).toBeUndefined();
    const error = new ApiError({ code: ERR.FORBIDDEN, message: "future wording", requestId: "request-45", messageKey: "apiErrors.missing" });
    expect(localizeApiError(error, "ar").message).toBe("ليس لديك صلاحية لتنفيذ هذا الإجراء. تواصل مع مالك النادي.");
  });

  it("keeps a confirmed write's refresh failure distinct from a failed write", () => {
    const error = ApiError.of("INTERNAL_ERROR", "Saved, but this screen could not refresh. Reload to see the latest data.");
    expect(localizeApiError(error, "ar").message).toContain("تم الحفظ، لكن تعذّر تحديث هذه الشاشة");
  });
});

it("localizes dynamic field errors without changing canonical amounts or field names", () => {
  const message = "amount must be a positive whole amount in JOD minor units.";
  const source = ApiError.of(ERR.VALIDATION, message, { message: { key: "apiErrors.positiveMinorAmount", params: { field: "amount", currency: "JOD" } }, fieldErrors: { amountMinor: [message] }, details: { amountMinor: -7125, currency: "JOD" } });
  const presented = localizeApiError(source, "ar") as ApiError;
  expect(presented.message).toContain("المبلغ");
  expect(presented.message).toContain("د.أ");
  expect(presented.fieldErrors?.amountMinor).toEqual([presented.message]);
  expect(presented.details).toEqual({ amountMinor: -7125, currency: "JOD" });
  expect(localizeApiError(presented, "en").message).toBe(message);
});

it("keeps mixed names and Latin references intact and formats dynamic dates and clocks", () => {
  const message = "This time overlaps a class.";
  const source = ApiError.of(ERR.VALIDATION, message, { message: { key: "apiErrors.classOverlap", params: { className: "لياقة RIVET 2", time: "13:05" } } });
  const presented = localizeApiError(source, "ar");
  expect(presented.message).toContain("لياقة RIVET 2");
  expect(presented.message).toContain("1:05 م");
  expect(presented.message).not.toContain("13:05");
  expect(source.messageDescriptor?.params).toEqual({ className: "لياقة RIVET 2", time: "13:05" });
  expect(parseErrorDescriptor({ key: "apiErrors.classOverlap", params: { className: "missing time" } })).toBeUndefined();
});
