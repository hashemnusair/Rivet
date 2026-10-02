import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen, within, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LocaleProvider } from "@/lib/i18n/provider";
import { createTranslator } from "@/lib/i18n/core";
import { PRIVACY_POLICY_VERSION, TERMS_OF_SERVICE_VERSION } from "@/lib/legal/legal-versions";
import { PrivacyPolicy } from "./privacy-policy";
import { TermsOfService } from "./terms-of-service";
import { documentBlocksFromElement } from "./document-pdf";
import { renderDocumentPdf } from "../../../convex/documentPdf";

// Optional reproducible, real renderer evidence; no fixture text replaces the page.
const evidence = process.env.RIVET_ARABIC_DOCUMENT_EVIDENCE;
afterEach(cleanup);
describe("Arabic public documents", () => {
  it.each([
    { kind: "terms", Component: TermsOfService, target: "terms-of-service", title: "شروط الخدمة", sections: 19, version: TERMS_OF_SERVICE_VERSION },
    { kind: "privacy", Component: PrivacyPolicy, target: "privacy-policy", title: "سياسة الخصوصية", sections: 15, version: PRIVACY_POLICY_VERSION },
  ])("preserves $kind anchors, published version and complete PDF content", ({ kind, Component, target, title, sections, version }) => {
    const t = createTranslator("ar");
    const { container } = render(<LocaleProvider initialLocale="ar"><Component /></LocaleProvider>);
    expect(screen.getByRole("heading", { level: 1, name: title })).toBeInTheDocument();
    expect(screen.getByRole("article")).toHaveAttribute("lang", "ar");
    expect(screen.getByRole("article")).toHaveAttribute("dir", "rtl");
    const links = within(screen.getByRole("navigation", { name: "المحتويات" })).getAllByRole("link");
    expect(links).toHaveLength(sections);
    for (const link of links) expect(container.querySelector(link.getAttribute("href")!)).toBeTruthy();
    expect(version).toBe("1.1 · 14 September 2026");
    expect(container.textContent).toContain("1.1 · 14 أيلول 2026");
    const blocks = documentBlocksFromElement(container.querySelector<HTMLElement>(`[data-document-body="${target}"]`)!);
    expect(blocks.filter(block => block.type === "heading")).toHaveLength(sections);
    expect(blocks.some(block => block.type === "table")).toBe(true);
    expect(JSON.stringify(blocks)).not.toMatch(/Download PDF|Contents|التحميل بصيغة PDF/);
    const text = JSON.stringify(blocks);
    if (kind === "terms") {
      expect(text).toContain("15 لسنة 2015");
      expect(text).toContain("14 يومًا");
      expect(text).toContain("60 يومًا");
      expect(text).toContain("7 أيام");
      expect(text).toContain("الإنجليزية");
    } else {
      expect(text).toContain("24 لسنة 2023");
      expect(text).toContain("STOP");
      expect(text).toContain("30 يومًا");
      expect(text).toContain("90 يومًا");
    }
    const bytes = renderDocumentPdf({ locale: "ar", title, label: title, meta: t("publicDocuments.legalMeta", { version: "1.1 · 14 أيلول 2026" }), reference: t("publicDocuments.version", { version: "1.1" }) }, blocks);
    const pdf = new TextDecoder("latin1").decode(bytes);
    expect(pdf).toContain("/ToUnicode");
    expect(pdf).toContain("/ActualText");
    expect(pdf).toContain("/Subtype /Type0");
    if (evidence) {
      mkdirSync(evidence, { recursive: true });
      writeFileSync(join(evidence, `arabic-${kind}.pdf`), bytes);
      writeFileSync(join(evidence, `arabic-${kind}-blocks.json`), JSON.stringify(blocks, null, 2));
    }
  });
});
