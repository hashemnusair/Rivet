import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const srcRoot = resolve(process.cwd(), "src");

function productFiles(directory = srcRoot): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) {
      if (path.endsWith("/components/marketing")) return [];
      return productFiles(path);
    }
    if (!entry.name.endsWith(".tsx")) return [];
    if (path === `${srcRoot}/app/page.tsx`) return [];
    return [path];
  });
}

const sources = productFiles().map((path) => ({ path, source: readFileSync(path, "utf8") }));

function offenders(pattern: RegExp) {
  return sources.filter(({ source }) => pattern.test(source)).map(({ path }) => path.replace(`${srcRoot}/`, ""));
}

describe("product UI repository rules", () => {
  it("does not use transition-all in product code", () => {
    expect(offenders(/\btransition-all\b/)).toEqual([]);
  });

  it("does not reintroduce the generic eyebrow pattern", () => {
    expect(offenders(/\beyebrow(?:-night)?\b/)).toEqual([]);
  });

  it("does not use a red inset rail as selection state", () => {
    expect(offenders(/shadow-\[inset_[^\]]*(?:#d9232b|signal)/)).toEqual([]);
  });
});
