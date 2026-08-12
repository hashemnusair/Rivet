#!/usr/bin/env node

import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const workspaceRoot = path.resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const roots = [".github", "apps/web/convex", "apps/web/scripts", "apps/web/src"];
const ignoredFiles = new Set([
  "apps/web/scripts/audit-secret-output.mjs",
  "apps/web/scripts/safe-convex-cli.test.mjs",
]);
const supportedExtensions = new Set([".js", ".mjs", ".cjs", ".ts", ".tsx", ".sh", ".yml", ".yaml"]);

const unsafePatterns = [
  { label: "serializing process.env", pattern: /JSON\.stringify\s*\(\s*process\.env/ },
  { label: "iterating over process.env for output", pattern: /Object\.(?:entries|values)\s*\(\s*process\.env/ },
  { label: "logging a process.env value", pattern: /console\.(?:log|info|debug|warn|error)\s*\([^\n;]*process\.env/ },
  { label: "logging a raw error or transport object", pattern: /console\.(?:log|info|debug|warn|error)\s*\(\s*(?:error|err|response|request)\s*\)/ },
  { label: "dumping a Playwright page body", pattern: /locator\(["']body["']\)\.innerText\s*\(/ },
  { label: "shell environment dump", pattern: /(?:^|[;&|]\s*)(?:printenv|env)(?:\s*(?:[;&|]|$))/m },
  { label: "unsafe Convex verbose deploy", pattern: /convex\s+deploy[^\n]*(?:--verbose|(?:^|\s)-v(?:\s|$))/m },
  { label: "Convex push request containing an admin key", pattern: /--write-push-request(?:=|\s)/ },
];

async function filesUnder(relativeDirectory) {
  const absoluteDirectory = path.join(workspaceRoot, relativeDirectory);
  const entries = await readdir(absoluteDirectory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relativePath = path.join(relativeDirectory, entry.name);
    if (entry.isDirectory()) files.push(...await filesUnder(relativePath));
    else if (supportedExtensions.has(path.extname(entry.name))) files.push(relativePath);
  }
  return files;
}

const findings = [];
for (const root of roots) {
  for (const relativePath of await filesUnder(root)) {
    if (ignoredFiles.has(relativePath)) continue;
    const contents = await readFile(path.join(workspaceRoot, relativePath), "utf8");
    for (const check of unsafePatterns) {
      if (check.pattern.test(contents)) findings.push(`${relativePath}: ${check.label}`);
    }
  }
}

const patchedConvexCli = await readFile(
  path.join(workspaceRoot, "apps/web/node_modules/convex/dist/cjs/cli/lib/components.js"),
  "utf8",
);
if (patchedConvexCli.includes('JSON.stringify(startPushResponse, null, 2)')) {
  findings.push("installed Convex CLI: verbose deploy still serializes the unredacted response");
}
if (!patchedConvexCli.includes("Object.keys(startPushResponse.environmentVariables)") || !patchedConvexCli.includes('"[REDACTED]"')) {
  findings.push("installed Convex CLI: environment-variable redaction patch is missing");
}
const patchedConvexEnvCli = await readFile(
  path.join(workspaceRoot, "apps/web/node_modules/convex/dist/cjs/cli/lib/env.js"),
  "utf8",
);
if (patchedConvexEnvCli.includes("envVar.value") || patchedConvexEnvCli.includes("name}=${formatted}")) {
  findings.push("installed Convex CLI: environment inspection can still print values");
}
if (!patchedConvexEnvCli.includes('logOutput)("[REDACTED]")') || !patchedConvexEnvCli.includes("name}=[REDACTED]")) {
  findings.push("installed Convex CLI: environment get/list redaction patch is missing");
}

if (findings.length > 0) {
  console.error("Unsafe secret-output paths detected:");
  for (const finding of findings) console.error(`- ${finding}`);
  process.exitCode = 1;
} else {
  console.log("Secret-output audit passed.");
}
