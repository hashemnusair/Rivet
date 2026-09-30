import ts from "typescript";
import fs from "node:fs";
import path from "node:path";
const root = process.cwd();
const entries = [];
const files = [];
function walk(dir) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, item.name);
    if (item.isDirectory()) {
      if (!["_generated", "arabic-review"].includes(item.name)) walk(file);
      continue;
    }
    if (
      !/\.tsx?$/.test(file) ||
      /(?:\.test\.|seed\.|arabicReview|mock|Mock)/.test(file)
    )
      continue;
    const source = fs.readFileSync(file, "utf8");
    const ast = ts.createSourceFile(
      file,
      source,
      ts.ScriptTarget.Latest,
      true,
      file.endsWith("tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    const relative = path.relative(root, file);
    files.push(relative);
    function visit(node) {
      if (
        ts.isJsxText(node) ||
        ts.isStringLiteral(node) ||
        ts.isNoSubstitutionTemplateLiteral(node) ||
        ts.isTemplateExpression(node)
      ) {
        const text = (
          ts.isTemplateExpression(node)
            ? node.getText(ast).slice(1, -1)
            : node.text
        )
          .replace(/\s+/g, " ")
          .trim();
        const parent = node.parent;
        const attribute = ts.isJsxAttribute(parent)
          ? parent.name.getText(ast)
          : "";
        const excluded =
          ts.isImportDeclaration(parent) ||
          ts.isExportDeclaration(parent) ||
          [
            "className",
            "href",
            "src",
            "key",
            "id",
            "type",
            "name",
            "data-testid",
            "style",
          ].includes(attribute);
        if (
          !excluded &&
          /[A-Za-z]{3}/.test(text) &&
          text.length <= 1200 &&
          !/^(?:[./]|https?:|#[a-f0-9]+$)/i.test(text) &&
          (ts.isJsxText(node) || /\s/.test(text) || /^[A-Z][a-z]+$/.test(text))
        ) {
          entries.push({
            file: relative,
            line:
              ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1,
            text,
          });
        }
        if (ts.isTemplateExpression(node)) return;
      }
      ts.forEachChild(node, visit);
    }
    visit(ast);
  }
}
walk(path.join(root, "src"));
walk(path.join(root, "convex"));
const result = {
  note: "Static candidate inventory, not a claim that every string is user-facing. Includes complete source coverage of scanned TS/TSX files; review dynamic content, provider UI, images and PDFs separately. Paths relative to apps/web. Regenerate from apps/web: node scripts/inventory-arabic-copy.mjs.",
  files,
  entries,
};
fs.writeFileSync(
  path.join(root, "../../docs/arabic/source-inventory.json"),
  JSON.stringify(result, null, 2) + "\n",
);
console.log(
  JSON.stringify({ files: files.length, candidates: entries.length }),
);
