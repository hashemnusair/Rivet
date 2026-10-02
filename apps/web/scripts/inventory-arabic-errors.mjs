/** Read-only source audit; writes only the implementation coverage ledger. */
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import ts from "typescript";

const webRoot = fileURLToPath(new URL("../", import.meta.url));
const ledgerPath = resolve(webRoot, "../../docs/arabic/server-error-coverage.json");
const previous = JSON.parse(readFileSync(ledgerPath, "utf8"));
const ids = new Map(previous.entries.map(entry => [entry.text, entry.id]));
let nextId = Math.max(...previous.entries.map(entry => entry.id), 0);
const catalogueFile = resolve(webRoot, "src/lib/i18n/messages/en/apiErrors.ts");
const catalogue = ts.createSourceFile(catalogueFile, readFileSync(catalogueFile, "utf8"), ts.ScriptTarget.Latest, true);
const keys = new Map();
function catalogueVisitor(node) {
  if (ts.isPropertyAssignment(node) && ts.isStringLiteralLike(node.initializer)) keys.set(node.initializer.text, `apiErrors.${node.name.text}`);
  ts.forEachChild(node, catalogueVisitor);
}
catalogueVisitor(catalogue);
const entries = new Map();
const dynamic = [];
const files = execFileSync("rg", ["--files", "convex", "src/lib"], { cwd: webRoot, encoding: "utf8" }).trim().split("\n").filter(file => file.endsWith(".ts") && !/\.(test|spec)\./.test(file) && !/messages|pdfFonts|pdfArabicFonts/.test(file));
for (const file of files) {
  const source = ts.createSourceFile(file, readFileSync(resolve(webRoot, file), "utf8"), ts.ScriptTarget.Latest, true);
  function visit(node) {
    if (ts.isCallExpression(node)) {
      const name = node.expression.getText(source);
      const index = /^(domainError|ApiError\.of)$/.test(name) ? 1 : name === "requireField" ? 2 : undefined;
      if (index !== undefined && node.arguments[index]) {
        const extra = node.arguments[index + 1];
        const message = extra && ts.isObjectLiteralExpression(extra) ? extra.properties.find(property => ts.isPropertyAssignment(property) && property.name.getText(source) === "message") : undefined;
        const keyProperty = message && ts.isObjectLiteralExpression(message.initializer) ? message.initializer.properties.find(property => ts.isPropertyAssignment(property) && property.name.getText(source) === "key") : undefined;
        const key = keyProperty && ts.isStringLiteralLike(keyProperty.initializer) ? keyProperty.initializer.text : undefined;
        function record(argument) {
          const occurrence = { file, line: source.getLineAndCharacterOfPosition(argument.getStart(source)).line + 1, code: index === 2 ? "VALIDATION_ERROR" : node.arguments[0]?.getText(source) };
          if (ts.isConditionalExpression(argument)) { record(argument.whenTrue); record(argument.whenFalse); return; }
          if (ts.isStringLiteralLike(argument)) {
            if (!entries.has(argument.text)) entries.set(argument.text, []);
            entries.get(argument.text).push(occurrence);
          } else {
            const expression = argument.getText(source);
            dynamic.push({ ...occurrence, text: expression, key: key ?? null, status: key ? "mapped" : expression === "message" ? "forwarded-by-validation-helper" : "pending" });
          }
        }
        record(node.arguments[index]);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
}
const records = [...entries].map(([text, occurrences]) => ({ id: ids.get(text) ?? ++nextId, text, occurrences, key: keys.get(text) ?? null, status: keys.has(text) ? "mapped" : "pending" })).sort((a, b) => a.id - b.id);
writeFileSync(ledgerPath, JSON.stringify({ note: "Source-to-descriptor coverage, not rendered-workflow certification. Original English, stable codes and field names are preserved. Dynamic/forwarded messages and other exception boundaries need separate review.", entries: records, dynamic }, null, 2) + "\n");
console.log(JSON.stringify({ static: records.length, mapped: records.filter(entry => entry.key).length, dynamic: dynamic.length, dynamicMapped: dynamic.filter(entry => entry.key).length }));
for (const entry of records.filter(entry => !entry.key)) console.log(`${entry.id}\t${entry.text}`);
