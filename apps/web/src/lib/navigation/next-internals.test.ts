import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * No application code may load a Next.js internal file (`next/dist/...`) at
 * run time. Such an import can work in the browser, under `next dev` and
 * under `next start`, and still fail on Vercel: the server rewrites some
 * internal requests at run time (any `*.shared-runtime` goes to the Pages
 * Router bundle) to files that are not in the deployed function. That is how
 * every Production page came to answer HTTP 500 from 23 to 25 November 2026.
 * A type-only import is erased by the compiler and stays allowed.
 */

const SOURCE_ROOT = join(process.cwd(), "src");
const IMPORT = /^\s*(import|export)\s+(?!type\b)[^;]*?from\s+["']next\/dist\/[^"']+["']|\b(?:require|import)\(\s*["']next\/dist\/[^"']+["']\s*\)/gm;

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx|mjs|js)$/.test(entry.name) && !/\.test\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

function runtimeNextInternalImports(source: string): string[] {
  return [...source.matchAll(IMPORT)].map((match) => match[0].trim());
}

describe("Next.js internals", () => {
  it("recognises a run-time import and lets a type-only one through", () => {
    expect(runtimeNextInternalImports('import { PathnameContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";')).toHaveLength(1);
    expect(runtimeNextInternalImports('const m = require("next/dist/server/x");')).toHaveLength(1);
    expect(runtimeNextInternalImports('const m = await import("next/dist/server/x");')).toHaveLength(1);
    expect(runtimeNextInternalImports('export { x } from "next/dist/client/y";')).toHaveLength(1);
    expect(runtimeNextInternalImports('import type { PrefetchKind } from "next/dist/client/components/router-reducer/router-reducer-types";')).toHaveLength(0);
    expect(runtimeNextInternalImports('// see next/dist/client/components/app-router.js\nimport { usePathname } from "next/navigation";')).toHaveLength(0);
  });

  it("are never loaded at run time by application code", () => {
    const offenders = sourceFiles(SOURCE_ROOT).flatMap((file) =>
      runtimeNextInternalImports(readFileSync(file, "utf8")).map((line) => `${relative(process.cwd(), file)}: ${line}`),
    );
    expect(offenders).toEqual([]);
  });
});
