/**
 * Server-side diagnostics must never serialize request payloads, identities,
 * email addresses, phone numbers, or provider responses. Keep the log useful
 * for correlation while making accidental secret/PII disclosure difficult.
 */
export function logRedactedServerError(input: {
  operation: string;
  correlationId?: string;
  error: unknown;
}): void {
  const errorName = input.error instanceof Error ? input.error.name : typeof input.error;
  const errorCode = typeof input.error === "object" && input.error !== null && "data" in input.error
    ? typeof (input.error as { data?: unknown }).data === "object" && (input.error as { data?: unknown }).data !== null && "code" in ((input.error as { data?: unknown }).data as object)
      ? String(((input.error as { data?: { code?: unknown } }).data)?.code ?? "UNKNOWN")
      : "UNKNOWN"
    : "UNKNOWN";
  console.error("[rivet.server.error]", JSON.stringify({
    operation: input.operation,
    correlationId: input.correlationId ?? "unassigned",
    errorName,
    errorCode,
  }));
}
