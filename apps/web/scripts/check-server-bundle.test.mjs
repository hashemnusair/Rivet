import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkServerBundle, forbiddenExternals } from "./check-server-bundle.mjs";

test("finds a shared-runtime module left for Node to load", () => {
  // What the 23 November 2026 bundle contained, in 83 page files.
  const bundled = '8823:e=>{"use strict";e.exports=require("next/dist/shared/lib/hooks-client-context.shared-runtime")},';
  assert.deepEqual(forbiddenExternals(bundled), ["next/dist/shared/lib/hooks-client-context.shared-runtime"]);
});

test("allows the externals Next itself emits", () => {
  const bundled = [
    'e.exports=require("next/dist/compiled/next-server/app-page.runtime.prod.js")',
    'e.exports=require("next/dist/server/app-render/work-async-storage.external.js")',
    'e.exports=require("next/dist/shared/lib/no-fallback-error.external")',
    'e.exports=require("next/dist/shared/lib/router/utils/app-paths")',
    'e.exports=require("next/dist/server/runtime-reacts.external.js")',
  ].join(";");
  assert.deepEqual(forbiddenExternals(bundled), []);
});

test("checks every file of a built server bundle", () => {
  const dist = mkdtempSync(join(tmpdir(), "rivet-server-bundle-"));
  mkdirSync(join(dist, "server", "app", "login"), { recursive: true });
  writeFileSync(join(dist, "server", "app", "page.js"), 'e.exports=require("next/dist/compiled/next-server/app-page.runtime.prod.js")');
  assert.deepEqual(checkServerBundle(dist), { checked: 1, problems: [] });

  writeFileSync(join(dist, "server", "app", "login", "page.js"), 'e.exports=require("next/dist/shared/lib/hooks-client-context.shared-runtime")');
  const result = checkServerBundle(dist);
  assert.equal(result.checked, 2);
  assert.deepEqual(result.problems, [`${join("server", "app", "login", "page.js")} requires next/dist/shared/lib/hooks-client-context.shared-runtime`]);
});

test("reports a missing build instead of passing", () => {
  const result = checkServerBundle(join(tmpdir(), "rivet-no-such-build"));
  assert.equal(result.checked, 0);
  assert.equal(result.problems.length, 1);
});
