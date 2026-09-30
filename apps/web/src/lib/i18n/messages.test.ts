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
    const ALLOWED_LATIN = /\b(RIVET|CliQ|QR|JOD|CSV|PDF|SMS|VIP|Esc|English|Visa|Google|WhatsApp|Instagram|Enter|PT|ID)\b|™/g;
    const raw = [...arLeaves.entries()].flatMap(([key, leaf]) =>
      strings(leaf)
        .map((text) => text.replace(/\{\w+\}/g, "").replace(ALLOWED_LATIN, ""))
        .filter((text) => /[A-Za-z]{2,}/.test(text))
        .map((text) => `${key}: ${text}`),
    );
    expect(raw).toEqual([]);
  });

  it("keep Arabic letters out of English except the language's own name", () => {
    const leaks = [...enLeaves.entries()].filter(([key, leaf]) => key !== "common.language.arabic" && strings(leaf).some((text) => /[؀-ۿ]/.test(text))).map(([key]) => key);
    expect(leaks).toEqual([]);
  });
});

describe("docs/arabic/GLOSSARY.md", () => {
  const glossary = readFileSync(join(process.cwd(), "../../docs/arabic/GLOSSARY.md"), "utf8");
  const arabicCorpus = [...arLeaves.values()].flatMap(strings).join("\n");

  // Rows whose last column is an em dash are reserved for a later area.
  const rows = glossary
    .split("\n")
    .filter((line) => line.startsWith("|") && !line.startsWith("| ---") && !line.startsWith("| English concept"))
    .map((line) => line.split("|").slice(1, -1).map((cell) => cell.trim()))
    .filter((cells) => cells.length >= 5);

  it("has a row for every recurring concept", () => {
    expect(rows.length).toBeGreaterThan(60);
  });

  it("uses each in-use term in the Arabic catalogue (glossary and messages have not drifted)", () => {
    const missing = rows
      .filter(([, term, , , where]) => where !== "—" && /[؀-ۿ]/.test(term as string))
      .filter(([, term]) => !arabicCorpus.includes(term as string))
      .map(([concept, term]) => `${concept} -> ${term}`);
    expect(missing).toEqual([]);
  });
});
