import { describe, expect, it } from "vitest";
import { createTranslator } from "./core";
import { makeFormatters } from "./formatters";
import { accountingAccountName, accountingDetailsLine, accountingSourceReason } from "./accounting";
import { ACCOUNTING_REASON_KEYS, describeAccountingReason } from "../domain/accounting-messages";
const ar = createTranslator("ar"); const en = createTranslator("en"); const f = makeFormatters("ar", "الآن", "Asia/Amman");
describe("accounting translations", () => {
  it("resolves every registered reason without changing its original or user-authored exclusions", () => {
    for (const reason of Object.keys(ACCOUNTING_REASON_KEYS)) {
      expect(describeAccountingReason(reason)).toHaveProperty("key");
      expect(accountingSourceReason(reason, en)).toBe(reason);
      expect(accountingSourceReason(reason, ar)).toMatch(/[\u0621-\u064a]/);
    }
    expect(accountingSourceReason("toString", ar)).toBe("toString");
    expect(accountingSourceReason("أصل الملاحظة / Original 007", ar)).toBe("أصل الملاحظة / Original 007");
    expect(accountingSourceReason("Equipment expected useful life must be between 1 and 600 months.", ar)).toContain("600");
    expect(accountingSourceReason("No positive earned amount exists for 2026-08.", ar, f)).toContain("آب 2026");
    expect(accountingSourceReason("Equipment cost currency does not match organization currency USD.", ar)).toBe("عملة تكلفة الجهاز لا تتطابق مع عملة المؤسسة USD.");
    expect(accountingSourceReason("Supplier payment currency USD does not match organization currency JOD.", ar)).toContain("USD");
  });
  it("keeps the approved debit and credit terms together", () => {
    expect(`${ar("ledgerWorkspace.debit")} / ${ar("ledgerWorkspace.credit")}`).toBe("مدين / دائن");
  });
  it("uses existing Arabic names and only translates unchanged standard chart names", () => {
    expect(accountingAccountName("1100", "Cash on hand", "ar", ar)).toBe("النقد في الصندوق");
    expect(accountingAccountName("1100", "My cash account", "ar", ar, "الحساب المخصص")).toBe("الحساب المخصص");
    expect(accountingAccountName("1100", "My cash account", "ar", ar)).toBe("My cash account");
    expect(accountingAccountName("CUSTOM", "Cash on hand", "ar", ar)).toBe("Cash on hand");
  });
  it("formats known diagnostic fields but preserves original IDs, references and money facts", () => {
    const details = { method: "cash", reference: "Ref-٠٠٧", serviceMonth: "2026-08", netAmountMinor: 12345, quantity: 3, productId: "Product-123", futureDiagnostic: "keep-value" };
    const before = structuredClone(details);
    const text = accountingDetailsLine(details, "JOD", "ar", ar, f);
    expect(text).toContain("طريقة الدفع"); expect(text).toContain("كاش"); expect(text).toContain("12.345 د.أ"); expect(text).toContain("آب 2026"); expect(text).toContain("Ref-٠٠٧"); expect(text).toContain("Product-123"); expect(text).toContain("keep-value");
    expect(details).toEqual(before);
  });
});
