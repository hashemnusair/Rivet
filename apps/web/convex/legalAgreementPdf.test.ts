import { describe, expect, it } from "vitest";
import { agreementPdfBlocks, agreementPdfFilename, renderAgreementPdf, type AgreementPdfInput } from "./legalAgreementPdf";
import { SUBSCRIPTION_AGREEMENT_SECTIONS } from "./legalAgreementText";

const signed: AgreementPdfInput = {
  reference: "RVT-20261001-ABCDE",
  version: "1.1 · 3 September 2026",
  status: "signed",
  organizationName: "Iron House Fitness",
  customer: { legalName: "Iron House Fitness Co.", address: "Mecca Street", city: "Amman" },
  signatory: { name: "Omar Haddad", idType: "national", idNumberMasked: "••••••4567", email: "omar@ironhouse.example" },
  subscription: { plan: "Growth", startDate: "2026-10-01" },
  signature: { method: "typed", typedName: "Omar Haddad" },
  signedAtLocal: "1 October 2026, 10:15",
  timezone: "Asia/Amman",
  placeOfSigning: "Amman",
  documentSha256: "abc123",
  hashMatch: true,
};

const flatten = (input: AgreementPdfInput, sections = SUBSCRIPTION_AGREEMENT_SECTIONS) =>
  JSON.stringify(agreementPdfBlocks(input, sections));

describe("agreement PDF", () => {
  it("names the file after the reference and strips anything else", () => {
    expect(agreementPdfFilename("RVT-20261001-ABCDE")).toBe("RIVET-agreement-RVT-20261001-ABCDE.pdf");
    expect(agreementPdfFilename("../../etc/passwd")).toBe("RIVET-agreement-etcpasswd.pdf");
  });

  it("prints the signed record, the full agreement, and the masked ID only", () => {
    const blocks = flatten(signed);
    expect(blocks).toContain("Iron House Fitness Co.");
    expect(blocks).toContain("Mecca Street, Amman");
    expect(blocks).toContain("••••••4567 (masked)");
    expect(blocks).not.toContain("9871234567");
    expect(blocks).toContain("1 October 2026, 10:15 (Asia/Amman, RIVET server time)");
    expect(blocks).toContain("Signed, awaiting RIVET's countersignature");
    expect(blocks).toContain("01. What this agreement covers");
    expect(blocks).toContain("10. Electronic signature");
    expect(blocks).toContain("Typed and adopted");
  });

  it("names the version instead of printing text it cannot vouch for", () => {
    const blocks = JSON.stringify(agreementPdfBlocks({ ...signed, version: "0.9 · old" }, undefined));
    expect(blocks).toContain("The full text of agreement version 0.9 · old is held by RIVET");
    expect(blocks).not.toContain("01. What this agreement covers");
  });

  it("shows the countersignature and flags a fingerprint mismatch", () => {
    const blocks = flatten({ ...signed, status: "countersigned", hashMatch: false, countersign: { byName: "Elias Hreish", title: "Co-founder", atLocal: "2 October 2026, 09:00" } });
    expect(blocks).toContain("Signed and countersigned");
    expect(blocks).toContain("For RIVET: Elias Hreish");
    expect(blocks).toContain("Co-founder, 2 October 2026, 09:00");
    expect(blocks).toContain("flagged for review");
  });

  it("draws RIVET's own signature next to the customer's", () => {
    const jpeg = "data:image/jpeg;base64,/9j/" + "A".repeat(200);
    const blocks = flatten({
      ...signed,
      status: "countersigned",
      signature: { method: "drawn", printImageDataUrl: jpeg },
      countersign: { byName: "Elias Hreish", title: "Co-founder", atLocal: "2 October 2026, 09:00", signature: { method: "drawn", printImageDataUrl: jpeg } },
    });
    expect(blocks).toContain("For the Customer: Omar Haddad");
    expect(blocks).toContain("For RIVET: Elias Hreish");
    expect(JSON.parse(blocks).flatMap((block: { type: string; blocks?: Array<{ type: string }> }) => block.blocks ?? []).filter((block: { type: string }) => block.type === "image")).toHaveLength(2);
    expect(blocks).toContain("Co-founder, 2 October 2026, 09:00");
  });

  it("falls back to RIVET's typed name when the countersignature was typed", () => {
    const blocks = flatten({ ...signed, status: "countersigned", countersign: { byName: "Elias Hreish", title: "Co-founder", atLocal: "2 October 2026, 09:00", signature: { method: "typed", typedName: "Elias Hreish" } } });
    expect(blocks).toContain("Typed and adopted as RIVET's signature.");
  });

  it("says the drawn signature is on file when there is no printable image", () => {
    const blocks = flatten({ ...signed, signature: { method: "drawn" } });
    expect(blocks).toContain("Signature drawn in RIVET and held with the signed record.");
  });

  it("renders a multi-page file that a reader can open", () => {
    const pdf = renderAgreementPdf(signed, SUBSCRIPTION_AGREEMENT_SECTIONS);
    const body = Array.from(pdf, (byte) => String.fromCharCode(byte)).join("");
    expect(body.startsWith("%PDF-1.4")).toBe(true);
    expect(body).toContain("(RIVET subscription agreement) Tj");
    // WinAnsi puts the middle dot at 0xB7, which reads back as the same character.
    expect(body).toContain("(RVT-20261001-ABCDE \u00b7 RIVET, Amman, Jordan) Tj");
    expect([...body.matchAll(/\/Type \/Page[^s]/g)].length).toBeGreaterThan(1);
    expect(body).not.toContain("9871234567");
  });
});
