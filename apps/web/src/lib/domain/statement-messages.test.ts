import { describe, expect, it } from "vitest";
import { createTranslator } from "../i18n/core";
import { describeStatementText, statementWarningMessages, STATEMENT_TEXT_KEYS } from "./statement-messages";

describe("immutable statement warning projections", () => {
  it("localizes every known warning and preserves unsupported original text", () => {
    const ar = createTranslator("ar");
    for (const original of Object.keys(STATEMENT_TEXT_KEYS)) {
      const message = describeStatementText(original)!;
      expect(ar(message.key, message.params)).toMatch(/[\u0600-\u06ff]/);
      expect(statementWarningMessages([original])).toEqual([{ original, ...message }]);
    }
    expect(describeStatementText("toString")).toBeUndefined();
    expect(statementWarningMessages(["A future provider's original diagnostic"])).toEqual([]);
  });
  it.each([0, 1, 2, 3, 11, 100])("keeps the %i posted-drift and mixed-cash count and policy version exact", count => {
    const ar = createTranslator("ar");
    const en = createTranslator("en");
    const originals = [
      `${count} posted accounting ${count === 1 ? "source posting no longer matches" : "source postings no longer match"} the current operational record (amount, currency, or branch changed after posting). Review the source queue and use an owner reversal plus a corrected posting where needed.`,
      `${count} journal ${count === 1 ? "entry pairs" : "entries pair"} one cash movement with counterparts from more than one activity; the whole movement is classified by priority (investing, then financing, then operating) under cashflow-classification.v2. Post separate journals to split such movements precisely.`,
    ];
    for (const original of originals) {
      const message = describeStatementText(original)!;
      expect(message.params?.count).toBe(count);
      expect(en(message.key, message.params)).toBe(original);
      expect(ar(message.key, message.params)).toContain(String(count));
      expect(ar(message.key, message.params)).not.toMatch(/[\u0660-\u0669\u06f0-\u06f9]/);
    }
    expect(ar("statements.mixedCash", { count, policy: "cashflow-classification.v2" })).toContain("cashflow-classification.v2");
  });
});
