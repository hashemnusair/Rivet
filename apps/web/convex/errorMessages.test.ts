import { describe, expect, it } from "vitest";
import { domainError } from "./security";

describe("backwards-compatible localized domain envelopes", () => {
  it("adds optional descriptors without replacing the English message or request identity", () => {
    expect(() => domainError("VALIDATION_ERROR", "Enter a valid phone number.", { correlationId: "request-46", fieldErrors: { phone: ["Enter a valid phone number."] } })).toThrowError(expect.objectContaining({ data: expect.objectContaining({
      code: "VALIDATION_ERROR", message: "Enter a valid phone number.", requestId: "request-46", messageKey: "apiErrors.invalidPhone", fieldErrors: { phone: ["Enter a valid phone number."] }, fieldMessages: { phone: [{ key: "apiErrors.invalidPhone" }] },
    }) }));
  });

  it("accepts an explicit descriptor independently of the legacy English wording", () => {
    expect(() => domainError("FORBIDDEN", "New English wording", { message: { key: "apiErrors.forbidden" } })).toThrowError(expect.objectContaining({ data: expect.objectContaining({ message: "New English wording", messageKey: "apiErrors.forbidden" }) }));
  });
});
