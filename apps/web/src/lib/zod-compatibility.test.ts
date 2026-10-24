import { expect, it, vi } from "vitest";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

it("rejects oversized constrained collections before validating their elements", () => {
  // Small inputs expose the advisory's traversal defect without a memory stress test.
  const visit = vi.fn();
  const element = z.string().superRefine(() => { visit(); });
  for (const [schema, input] of [
    [z.array(element).max(2), ["a", "b", "c"]],
    [z.set(element).max(2), new Set(["a", "b", "c"])],
    [z.map(z.string(), element).max(2), new Map([["a", "a"], ["b", "b"], ["c", "c"]])],
  ] as const) {
    const result = schema.safeParse(input);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues).toMatchObject([{ code: "too_big" }]);
    expect(visit).not.toHaveBeenCalled();
  }
});
it("keeps resolver field errors, localized messages and numeric output for financial forms", async () => {
  const schema = z.object({ days: z.coerce.number().int().min(1, "أدخل يومًا واحدًا على الأقل"), reason: z.string().min(3, "Reason required") });
  const resolver = zodResolver(schema);
  const options = { fields: {}, shouldUseNativeValidation: false };
  const invalid = await resolver({ days: "0", reason: "" }, undefined, options);
  expect(invalid.errors).toMatchObject({ days: { message: "أدخل يومًا واحدًا على الأقل" }, reason: { message: "Reason required" } });
  expect(invalid.values).toEqual({});
  expect(await resolver({ days: "14", reason: "Approved extension" }, undefined, options)).toEqual({ errors: {}, values: { days: 14, reason: "Approved extension" } });
});
