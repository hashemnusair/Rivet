import { describe, expect, it } from "vitest";
import { preselectedMachine, suggestMachines, suggestedTitle } from "./fault-triage";

const machines = [
  { id: "tm3", code: "TM-03", name: "Treadmill 3" },
  { id: "tm4", code: "TM-04", name: "Treadmill 4" },
  { id: "bk1", code: "BK-01", name: "Spin bike 1" },
  { id: "cb", code: "CB-01", name: "Cable crossover" },
];

describe("machine-problem intake", () => {
  it("prefers a written code, then a name with its number", () => {
    expect(preselectedMachine("TM-04 display is blank", machines)?.id).toBe("tm4");
    expect(preselectedMachine("treadmill 3 belt is slipping", machines)).toMatchObject({ id: "tm3", reason: "name" });
  });

  it("reads Arabic machine words and Arabic digits", () => {
    expect(preselectedMachine("المشاية ٣ صوتها عالي", machines)?.id).toBe("tm3");
    expect(preselectedMachine("الكيبل مقطوع", machines)?.id).toBe("cb");
  });

  it("lists several machines and chooses none when the description cannot tell them apart", () => {
    expect(suggestMachines("the treadmill makes a noise", machines).map((match) => match.id).sort()).toEqual(["tm3", "tm4"]);
    expect(preselectedMachine("the treadmill makes a noise", machines)).toBeUndefined();
    expect(preselectedMachine("the air conditioning leaks", machines)).toBeUndefined();
  });

  it("titles the problem from the first sentence", () => {
    expect(suggestedTitle("Belt slipping at speed 8. Member nearly fell.")).toBe("Belt slipping at speed 8");
  });
});
