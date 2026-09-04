import { describe, expect, it } from "vitest";
import { renderAgreementCopyEmail, type AgreementCopy } from "./legalAgreementEmail";
import { footerLines } from "./emailTemplate";

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
  it("renders RIVET's copy on the branded template, with the masked ID and the attachment chip", () => {
    const rendered = renderAgreementCopyEmail(copy, "rivet", { siteUrl: "https://app.rivet.jo/", attachment: { filename: "RIVET-agreement-RVT-20261001-ABCDE.pdf", sizeLabel: "26 KB" } });
    expect(rendered.subject).toBe("Iron <House> Fitness signed the RIVET subscription agreement (RVT-20261001-ABCDE)");
    expect(rendered.html).toContain("Iron &lt;House&gt; Fitness Co.");
    expect(rendered.html).not.toContain("<House>");
    expect(rendered.html).toContain("••••••4567");
    expect(rendered.html).toContain("https://app.rivet.jo/brand/rivet-lockup.png");
    expect(rendered.html).toContain("https://app.rivet.jo/platform/agreements");
    expect(rendered.html).toContain("RIVET-agreement-RVT-20261001-ABCDE.pdf");
    expect(rendered.html).toContain("26 KB");
    // The agreement itself travels as the PDF, not as text in the body.
    expect(rendered.html).not.toContain("Electronic Transactions Law No. 15 of 2015.</h3>");
    expect(rendered.text).toContain("Reference: RVT-20261001-ABCDE");
    expect(rendered.text).toContain("Attached: RIVET-agreement-RVT-20261001-ABCDE.pdf (26 KB)");
  });

  it("renders the signer's copy, flags a fingerprint mismatch as the one chip, and describes a countersignature", () => {
    const signer = renderAgreementCopyEmail({ ...copy, hashMatch: false, signature: { method: "typed", typedName: "Omar Haddad" } }, "signer");
    expect(signer.subject).toBe("Your signed RIVET subscription agreement RVT-20261001-ABCDE");
    expect(signer.html).toContain("Fingerprint mismatch");
    expect(signer.text).toContain("Fingerprint check: The signer's browser produced a different fingerprint");

    const countersigned = renderAgreementCopyEmail({ ...copy, countersign: { byName: "Elias Hreish", title: "Co-founder", atLocal: "2 October 2026, 09:00" } }, "signer");
    expect(countersigned.subject).toBe("RIVET countersigned your subscription agreement RVT-20261001-ABCDE");
    expect(countersigned.text).toContain("Countersigned by: Elias Hreish, Co-founder, 2 October 2026, 09:00");
  });

  it("speaks Arabic to a gym that chose it, and English to RIVET regardless", () => {
    const arabic = renderAgreementCopyEmail({ ...copy, countersign: { byName: "Elias Hreish", title: "Co-founder", atLocal: "2 October 2026, 09:00" } }, "signer", { language: "ar" });
    expect(arabic.subject).toBe("وقّعت RIVET اتفاقية اشتراككم RVT-20261001-ABCDE");
    expect(arabic.html).toContain('dir="rtl"');
    expect(arabic.html).toContain("عرض الاتفاقية");
    expect(arabic.text).toContain("المرجع: RVT-20261001-ABCDE");
    expect(arabic.text).toContain("الرقم الوطني الأردني: ••••••4567");
    expect(arabic.text).toContain("© 2026 RIVET. جميع الحقوق محفوظة.");
    const rivet = renderAgreementCopyEmail(copy, "rivet", { language: "ar" });
    expect(rivet.html).toContain('dir="ltr"');
    expect(rivet.subject).toContain("signed the RIVET subscription agreement");
  });

  it("carries the complete footer, with no unsubscribe on a service message", () => {
    const rendered = renderAgreementCopyEmail(copy, "signer", { siteUrl: "https://www.rivetjo.com" });
    const lines = footerLines({ language: "en", audience: "gym", headline: "", paragraphs: [] });
    expect(lines[0]).toBe("RIVET · Amman, Jordan");
    expect(lines[1]).toBe("077 837 8608 · wa.me/962778378608 · @rivet.jo · www.rivetjo.com");
    expect(lines[2]).toBe("Support 09:00–21:00 Amman time, Saturday to Thursday");
    expect(lines[3]).toBe("Privacy policy · Terms of service · Email preferences");
    expect(lines[4]).toBe("This is a service message about your RIVET account.");
    expect(lines[5]).toBe("© 2026 RIVET. All rights reserved.");
    expect(lines[6]).toBe("[Legal entity name · Commercial registration no.]");
    for (const line of lines) expect(rendered.text).toContain(line);
    expect(rendered.html).toContain("https://www.rivetjo.com/privacy");
    expect(rendered.html).not.toContain("Unsubscribe");
  });
});
