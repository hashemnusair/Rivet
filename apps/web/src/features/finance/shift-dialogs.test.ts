import { describe, expect, it } from "vitest";
import { openShiftSchema } from "./shift-dialogs";

describe("openShiftSchema", () => {
  it("requires the operator to enter the counted float", () => {
    expect(openShiftSchema.safeParse({ float: "" }).success).toBe(false);
    expect(openShiftSchema.safeParse({ float: "   " }).success).toBe(false);
  });

  it("accepts zero and valid JOD amounts", () => {
    expect(openShiftSchema.safeParse({ float: "0" }).success).toBe(true);
    expect(openShiftSchema.safeParse({ float: "50.000" }).success).toBe(true);
  });

  it("rejects invalid and negative amounts", () => {
    expect(openShiftSchema.safeParse({ float: "not money" }).success).toBe(false);
    expect(openShiftSchema.safeParse({ float: "-1.000" }).success).toBe(false);
  });
});
