/** Presentation descriptors for generated recommendations. Original rationale text remains available. */
export type EquipmentRationaleMessage =
  | { key: "operationsWorkspace.rationaleNoRepair" | "operationsWorkspace.rationaleNoReplacement" | "operationsWorkspace.rationalePurchaseDate" | "operationsWorkspace.rationaleLife" | "operationsWorkspace.rationaleUnsafe" | "operationsWorkspace.rationaleLifespan" | "operationsWorkspace.rationaleKeep" }
  | { key: "operationsWorkspace.rationaleProblems"; params: { count: number; days: number } }
  | { key: "operationsWorkspace.rationaleAge"; params: { age: number; life: number } }
  | { key: "operationsWorkspace.rationalePercent"; params: { percent: number | "∞" } };

const staticReasons: Record<string, Exclude<EquipmentRationaleMessage["key"], "operationsWorkspace.rationaleProblems" | "operationsWorkspace.rationaleAge" | "operationsWorkspace.rationalePercent">> = {
  "Repair cost has not been recorded.": "operationsWorkspace.rationaleNoRepair",
  "Replacement cost has not been estimated.": "operationsWorkspace.rationaleNoReplacement",
  "Add the purchase date to check the machine’s age.": "operationsWorkspace.rationalePurchaseDate",
  "Add how many months the machine is expected to last.": "operationsWorkspace.rationaleLife",
  "An open problem means this machine cannot be used.": "operationsWorkspace.rationaleUnsafe",
  "The machine has reached its expected lifespan.": "operationsWorkspace.rationaleLifespan",
  "Repair costs are low enough to keep this machine. Few problems have been reported.": "operationsWorkspace.rationaleKeep",
};

export function describeEquipmentRationale(text: string): EquipmentRationaleMessage | null {
  const key = staticReasons[text];
  if (key) return { key };
  let match = /^(\d+) problems? reported\. Out of use for (\d+(?:\.\d+)?) days?\.$/.exec(text);
  if (match) return { key: "operationsWorkspace.rationaleProblems", params: { count: Number(match[1]), days: Number(match[2]) } };
  match = /^The machine is (\d+) months old\. Its expected lifespan is (\d+) months\.$/.exec(text);
  if (match) return { key: "operationsWorkspace.rationaleAge", params: { age: Number(match[1]), life: Number(match[2]) } };
  match = /^Repairs cost (\d+|Infinity)% of the estimated replacement cost\.$/.exec(text);
  if (match) return { key: "operationsWorkspace.rationalePercent", params: { percent: match[1] === "Infinity" ? "∞" : Number(match[1]) } };
  return null;
}
