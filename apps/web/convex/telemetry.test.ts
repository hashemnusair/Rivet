import { afterEach, describe, expect, it, vi } from "vitest";
import { logRedactedServerError } from "./telemetry";

afterEach(() => vi.restoreAllMocks());

describe("redacted server diagnostics", () => {
  it("logs correlation metadata without request payloads or provider secrets", () => {
    const error = Object.assign(new Error("Bearer super-secret-provider-token for elias@example.com"), { data: { code: "FORBIDDEN" } });
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    logRedactedServerError({ operation: "payments.refund", correlationId: "cor-safe-1", error });
    expect(log).toHaveBeenCalledWith("[rivet.server.error]", expect.not.stringContaining("super-secret-provider-token"));
    expect(log).toHaveBeenCalledWith("[rivet.server.error]", expect.not.stringContaining("elias@example.com"));
    expect(log).toHaveBeenCalledWith("[rivet.server.error]", expect.stringContaining('"correlationId":"cor-safe-1"'));
    expect(log).toHaveBeenCalledWith("[rivet.server.error]", expect.stringContaining('"errorCode":"FORBIDDEN"'));
  });
});
