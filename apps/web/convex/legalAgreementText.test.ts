// @vitest-environment node
import { describe, expect, it } from "vitest";
import { agreementLanguageForVersion, agreementSectionsForVersion, agreementVersionForLanguage, canonicalAgreementText, sha256Hex } from "./legalAgreementText";

describe("agreement website domain correction", () => {
  it.each([
    ["1.1 · 3 September 2026", "a7739cafef818f349f22f586504de9314abf946141f610367be5bd6b64ccadd0"],
    ["1.2 · 4 September 2026", "af0a917ebc219e4cda2901b489a6708a1f9e6d23e8ddf6adbbe76294b86a8c9b"],
    ["1.2-ar · 2 October 2026", "65dfe50b35e8d4316c38d9f14fa12d6390c985505e34c23b70b0ef1d48994721"],
  ])("preserves the published fingerprint for %s", async (version, hash) => {
    expect(await sha256Hex(canonicalAgreementText(version))).toBe(hash);
  });

  it.each([
    ["en", "1.2 · 4 September 2026", "1.3 · 9 November 2026"],
    ["ar", "1.2-ar · 2 October 2026", "1.3-ar · 9 November 2026"],
  ] as const)("uses rivetjo.com for new %s agreements without changing any other wording", (language, previous, current) => {
    expect(agreementVersionForLanguage(language)).toBe(current);
    expect(agreementLanguageForVersion(previous)).toBe(language);
    expect(agreementLanguageForVersion(current)).toBe(language);
    const clauses = JSON.stringify(agreementSectionsForVersion(current));
    expect(clauses).toBe(JSON.stringify(agreementSectionsForVersion(previous)).replaceAll("rivet.jo/", "rivetjo.com/"));
    expect(clauses).toContain("rivetjo.com/terms");
    expect(clauses).toContain("rivetjo.com/privacy");
    expect(clauses).not.toContain("rivet.jo/");
  });
});
