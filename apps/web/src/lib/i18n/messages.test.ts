import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isPluralForms, placeholdersOf, type MessageLeaf, type MessageTree } from "./dictionary";
import { ar, en } from "./messages";

type Leaves = Map<string, MessageLeaf>;

function collect(tree: MessageTree, prefix = "", out: Leaves = new Map()): Leaves {
  for (const [key, node] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof node === "string" || isPluralForms(node)) out.set(path, node);
    else collect(node as MessageTree, path, out);
  }
  return out;
}

const enLeaves = collect(en as unknown as MessageTree);
const arLeaves = collect(ar as unknown as MessageTree);

function strings(leaf: MessageLeaf): string[] {
  return typeof leaf === "string" ? [leaf] : Object.values(leaf as unknown as Record<string, string>);
}

function placeholderSet(leaf: MessageLeaf): string[] {
  return [...new Set(strings(leaf).flatMap(placeholdersOf))].sort();
}

describe("message catalogues", () => {
  it("have the same keys in English and Arabic", () => {
    const missingInArabic = [...enLeaves.keys()].filter((key) => !arLeaves.has(key));
    const extraInArabic = [...arLeaves.keys()].filter((key) => !enLeaves.has(key));
    expect({ missingInArabic, extraInArabic }).toEqual({ missingInArabic: [], extraInArabic: [] });
  });

  it("use the same leaf kind (text or plural group) for every key", () => {
    const mismatched = [...enLeaves.entries()]
      .filter(([key, leaf]) => arLeaves.has(key) && isPluralForms(leaf) !== isPluralForms(arLeaves.get(key)))
      .map(([key]) => key);
    expect(mismatched).toEqual([]);
  });

  it("use the same {placeholders} in both languages", () => {
    const mismatched = [...enLeaves.entries()]
      .filter(([key, leaf]) => arLeaves.has(key) && placeholderSet(leaf).join() !== placeholderSet(arLeaves.get(key) as MessageLeaf).join())
      .map(([key, leaf]) => `${key}: en {${placeholderSet(leaf)}} ar {${placeholderSet(arLeaves.get(key) as MessageLeaf)}}`);
    expect(mismatched).toEqual([]);
  });

  it("keep every count in the Arabic forms that need one", () => {
    // zero/one/two forms may say "one member" in words; few/many/other must carry the number.
    const missingCount = [...arLeaves.entries()]
      .filter(([, leaf]) => isPluralForms(leaf))
      .flatMap(([key, leaf]) => {
        const forms = leaf as unknown as Record<string, string>;
        const needsCount = placeholderSet(enLeaves.get(key) as MessageLeaf).includes("count");
        return needsCount ? (["few", "many", "other"] as const).filter((form) => forms[form] !== undefined && !forms[form].includes("{count}")).map((form) => `${key}.${form}`) : [];
      });
    expect(missingCount).toEqual([]);
  });

  it("never leave an empty string", () => {
    const empty = [...arLeaves.entries(), ...enLeaves.entries()].filter(([, leaf]) => strings(leaf).some((text) => text.trim() === "")).map(([key]) => key);
    expect(empty).toEqual([]);
  });

  it("have no accidental raw English in Arabic (brands and technical tokens are allowlisted)", () => {
    const ALLOWED_LATIN = /\b(RIVET|CliQ|QR|JOD|CSV|PDF|SMS|VIP|Esc|English|Visa|Google|WhatsApp|Instagram|Enter|PT|ID|SHA|JPEG|PNG|WebP)\b|™/g;
    const raw = [...arLeaves.entries()].flatMap(([key, leaf]) =>
      strings(leaf)
        .filter(() => key !== "crm.newLead.emailPlaceholder") // Literal email example, not product prose.
        .map((text) => text.replace(/\{\w+\}/g, "").replace(ALLOWED_LATIN, ""))
        .filter((text) => /[A-Za-z]{2,}/.test(text))
        .map((text) => `${key}: ${text}`),
    );
    expect(raw).toEqual([]);
  });

  it("keep Arabic letters out of English except the language's own name", () => {
    const leaks = [...enLeaves.entries()].filter(([key, leaf]) => !new Set(["common.language.arabic", "members.header.arabic"]).has(key) && strings(leaf).some((text) => /[؀-ۿ]/.test(text))).map(([key]) => key);
    expect(leaks).toEqual([]);
  });
});

describe("approved Arabic decisions", () => {
  const decisions = JSON.parse(readFileSync(join(process.cwd(), "../../docs/arabic/approved-decisions.v1.json"), "utf8")) as { decisions: Array<{ id: string; agreedText: string }> };
  const coverage = JSON.parse(readFileSync(join(process.cwd(), "../../docs/arabic/decision-coverage.json"), "utf8")) as { decisions: Array<{ id: string; keys: string[] }> };
  it("keeps all mapped catalogue labels equal to the approved contextual wording", () => {
    for (const entry of coverage.decisions) for (const key of entry.keys) {
      expect(arLeaves.get(key), `${entry.id}: ${key}`).toBe(decisions.decisions.find(decision => decision.id === entry.id)?.agreedText);
    }
  });
  it("accounts for all decisions without certifying untranslated occurrences", () => {
    expect(coverage.decisions.map(entry => entry.id).sort()).toEqual(decisions.decisions.map(entry => entry.id).sort());
  });
});
