import { describe, expect, it } from "vitest";
import { listRowFact } from "./member-brief";
import type { AiBriefLine } from "./contracts";

const line = (key: string, tone?: AiBriefLine["tone"]): AiBriefLine => ({ key, basis: "observed", message: { key }, sources: [], ...(tone ? { tone } : {}) });

describe("list row fact", () => {
  it("skips what the row already shows and prefers something that needs attention", () => {
    expect(listRowFact({ lines: [line("aiWork.brief.endsIn"), line("aiWork.brief.visitedRecently"), line("aiWork.brief.absentFor", "attention")] })).toEqual({ key: "aiWork.brief.absentFor" });
    expect(listRowFact({ lines: [line("aiWork.brief.endsIn"), line("aiWork.brief.openTasks")] })).toEqual({ key: "aiWork.brief.openTasks" });
    expect(listRowFact({ lines: [line("aiWork.brief.endsIn"), line("aiWork.brief.lastContact")] })).toBeUndefined();
  });
});
