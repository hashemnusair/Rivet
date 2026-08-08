import { describe, expect, it } from "vitest";
import schema from "./schema";
import { requireReason } from "./security";
import { formatPaymentAuditEntityLabel } from "./invariants";

describe("audit mutation contract", () => {
  it("keeps immutable before/after and correlation fields in the audit schema", () => {
    const tables = (schema as unknown as { tables: Record<string, { validator?: { fields?: Record<string, unknown> } }> }).tables;
    const fields = tables.auditEvents?.validator?.fields ?? {};
    expect(fields).toEqual(expect.objectContaining({ before: expect.anything(), after: expect.anything(), correlationId: expect.anything() }));
  });

  it("rejects a sensitive action without a reason at the server helper", () => {
    expect(() => requireReason("", "cor-audit-test")).toThrow();
    expect(() => requireReason("Approved by manager", "cor-audit-test")).not.toThrow();
  });

  it("keeps payment audit labels searchable by the member identity", () => {
    expect(formatPaymentAuditEntityLabel({ receiptNumber: "RV-001234", memberName: "Lina Haddad", memberNumber: "ABD-2214", memberId: "member-1" })).toBe("RV-001234 · Lina Haddad · ABD-2214");
    expect(formatPaymentAuditEntityLabel({ receiptNumber: "RV-001235", memberId: "member-2" })).toBe("RV-001235 · member-2");
  });
});
