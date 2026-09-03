import { describe, expect, it } from "vitest";
import { renderAgreementCopyEmail, type AgreementCopy } from "./legalAgreementEmail";
import { SUBSCRIPTION_AGREEMENT_SECTIONS } from "./legalAgreementText";

const copy: AgreementCopy = {
  reference: "RVT-20261001-ABCDE",
  version: "1.1 · 3 September 2026",
  organizationName: "Iron <House> Fitness",
  customer: { legalName: "Iron <House> Fitness Co.", address: "Mecca Street, Amman", city: "Amman" },
  signatory: { name: "Omar Haddad", idType: "national", idNumberMasked: "••••••4567", email: "omar@ironhouse.example" },
  subscription: { plan: "Growth", startDate: "2026-10-01" },
  signature: { method: "drawn" },
  signedAtLocal: "1 October 2026, 10:15",
  timezone: "Asia/Amman",
  documentSha256: "abc123",
  hashMatch: true,
};

describe("agreement copy email", () => {
  it("renders RIVET's copy with the masked ID, the record link and the agreement text", () => {
    const rendered = renderAgreementCopyEmail(copy, "rivet", { sections: SUBSCRIPTION_AGREEMENT_SECTIONS, siteUrl: "https://app.rivet.jo/" });
    expect(rendered.subject).toBe("Iron <House> Fitness signed the RIVET subscription agreement (RVT-20261001-ABCDE)");
    expect(rendered.html).toContain("Iron &lt;House&gt; Fitness Co.");
    expect(rendered.html).not.toContain("<House>");
    expect(rendered.html).toContain("••••••4567");
    expect(rendered.html).toContain("https://app.rivet.jo/platform/agreements");
    expect(rendered.html).toContain("Drawn signature, on file in RIVET");
    expect(rendered.html).toContain("10. Electronic signature");
    expect(rendered.text).toContain("Jordanian national ID: ••••••4567");
    expect(rendered.text).toContain("Full record: https://app.rivet.jo/platform/agreements");
    expect(rendered.text).toContain("03. Term and ending");
  });

  it("renders the signer's copy, flags a fingerprint mismatch and describes a countersignature", () => {
    const signer = renderAgreementCopyEmail({ ...copy, hashMatch: false, signature: { method: "typed", typedName: "Omar Haddad" } }, "signer");
    expect(signer.subject).toBe("Your signed RIVET subscription agreement RVT-20261001-ABCDE");
    expect(signer.text).toContain("Typed and adopted: Omar Haddad");
    expect(signer.text).toContain("Fingerprint check: The signer's browser produced a different fingerprint");
    expect(signer.text).toContain("Full record: Settings → Agreement in RIVET");
    expect(signer.text).not.toContain("01. What this agreement covers");

    const countersigned = renderAgreementCopyEmail({ ...copy, countersign: { byName: "Elias Hreish", title: "Co-founder", atLocal: "2 October 2026, 09:00" } }, "signer");
    expect(countersigned.subject).toBe("RIVET countersigned your subscription agreement RVT-20261001-ABCDE");
    expect(countersigned.text).toContain("Countersigned for RIVET: Elias Hreish, Co-founder, 2 October 2026, 09:00");
  });
});
