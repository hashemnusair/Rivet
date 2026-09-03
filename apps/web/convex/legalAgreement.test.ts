import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import { api } from "./_generated/api";
import schema from "./schema";
import { SUBSCRIPTION_AGREEMENT_VERSION, canonicalAgreementText, sha256Hex } from "./legalAgreementText";
import { decodeBase64 } from "./pdfDocument";

declare global { interface ImportMeta { glob(pattern: string): Record<string, () => Promise<unknown>>; } }
const modules = import.meta.glob("./**/*.ts");
const operation = (name: string, input: Record<string, unknown> = {}) => ({ operation: name, input, correlationId: `cor-legal-${name}` });
const expectCode = async (request: Promise<unknown>, code: string) => { await expect(request).rejects.toMatchObject({ data: expect.objectContaining({ code }) }); };

const PNG = `data:image/png;base64,${"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ".repeat(8)}`;

async function seeded() {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    const now = Date.now();
    const organization = await ctx.db.insert("organizations", { publicId: "legal-org-a", name: "Iron House Fitness", slug: "iron-house", status: "trial", subscriptionPlan: "Growth", subscriptionStartedAt: Date.UTC(2026, 9, 1, 9), timezone: "Asia/Amman", currency: "JOD", createdAt: now, updatedAt: now });
    const branch = await ctx.db.insert("branches", { organizationId: organization, publicId: "legal-branch-a", name: "Main", code: "MAIN", address: "Mecca Street, Amman", active: true, status: "active", createdAt: now, updatedAt: now });
    const owner = await ctx.db.insert("users", { publicId: "legal-owner", authSubject: "clerk-legal-owner", email: "omar@ironhouse.example", fullName: "Omar Haddad", phone: "+962790000001", platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
    const manager = await ctx.db.insert("users", { publicId: "legal-manager", authSubject: "clerk-legal-manager", email: "manager@ironhouse.example", fullName: "Layla Manager", platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
    await ctx.db.insert("users", { publicId: "legal-admin", authSubject: "clerk-legal-admin", email: "elias@rivet.example", fullName: "Elias Hreish", platformAdmin: true, status: "active", createdAt: now, updatedAt: now });
    await ctx.db.insert("organizationMemberships", { organizationId: organization, userId: owner, role: "owner", branchIds: [branch], branchScope: "all", active: true, createdAt: now, updatedAt: now });
    await ctx.db.insert("organizationMemberships", { organizationId: organization, userId: manager, role: "manager", branchIds: [branch], branchScope: "all", active: true, createdAt: now, updatedAt: now });
    const otherOrganization = await ctx.db.insert("organizations", { publicId: "legal-org-b", name: "Other Gym", slug: "other-gym", status: "active", timezone: "Asia/Amman", currency: "JOD", createdAt: now, updatedAt: now });
    const otherBranch = await ctx.db.insert("branches", { organizationId: otherOrganization, publicId: "legal-branch-b", name: "Other", code: "OTHER", active: true, status: "active", createdAt: now, updatedAt: now });
    const otherOwner = await ctx.db.insert("users", { publicId: "legal-other-owner", authSubject: "clerk-legal-other-owner", email: "other@example.com", fullName: "Other Owner", platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
    await ctx.db.insert("organizationMemberships", { organizationId: otherOrganization, userId: otherOwner, role: "owner", branchIds: [otherBranch], branchScope: "all", active: true, createdAt: now, updatedAt: now });
  });
  return {
    t,
    owner: t.withIdentity({ subject: "clerk-legal-owner" }),
    manager: t.withIdentity({ subject: "clerk-legal-manager" }),
    admin: t.withIdentity({ subject: "clerk-legal-admin" }),
    otherOwner: t.withIdentity({ subject: "clerk-legal-other-owner" }),
  };
}

async function signingInput(overrides: Record<string, unknown> = {}) {
  return {
    customer: { legalName: "Iron House Fitness Co.", address: "Mecca Street, Umm Uthaina, Amman" },
    signatory: { name: "Omar Haddad", idType: "national", idNumber: "9871234567", email: "omar@ironhouse.example" },
    subscription: { plan: "Growth", startDate: "2026-10-01" },
    consents: { agreement: true, authority: true, electronic: true, accurate: true },
    signature: { method: "drawn", imageDataUrl: PNG },
    client: { userAgent: "Mozilla/5.0 (test)", language: "en-JO", viewport: "1440x900" },
    clientDocumentSha256: await sha256Hex(canonicalAgreementText()),
    idempotencyKey: "sign-1",
    ...overrides,
  };
}

type Context = { version: string; text: string; sha256: string; status: string; canSign: boolean; prefill: Record<string, unknown>; sections: Array<{ number: string; heading: string }>; agreement?: { reference: string } };
type Agreement = { id: string; reference: string; status: string; hashMatch: boolean; signatory: { idNumberMasked: string; idNumber?: string; name: string }; signature: { method: string; imageDataUrl?: string }; signedAt: string; countersign?: { byName: string; title: string } };

describe("subscription agreement e-signature", () => {
  it("publishes a versioned, hashable agreement with owner prefill and gates the owner until signed", async () => {
    const { owner, manager } = await seeded();
    const context = await owner.query(api.domain.query, operation("legal.agreement.current")) as Context;
    expect(context.version).toBe(SUBSCRIPTION_AGREEMENT_VERSION);
    expect(context.sections.map((section) => section.number)).toEqual(["01", "02", "03", "04", "05", "06", "07", "08", "09", "10"]);
    expect(context.sha256).toBe(await sha256Hex(context.text));
    expect(context.text).toBe(canonicalAgreementText());
    expect(context).toMatchObject({ status: "required", canSign: true, prefill: { legalName: "Iron House Fitness", address: "Mecca Street, Amman", signatoryName: "Omar Haddad", email: "omar@ironhouse.example", plan: "Growth", startDate: "2026-10-01" } });
    // The trimmed form never asks for these, so the server does not prefill them.
    expect(Object.keys(context.prefill).sort()).toEqual(["address", "email", "legalName", "plan", "signatoryName", "startDate"]);
    const session = await owner.query(api.domain.query, operation("session")) as { legal: { agreementStatus: string } };
    expect(session.legal).toEqual({ agreementStatus: "required" });
    const managerSession = await manager.query(api.domain.query, operation("session")) as { legal: { agreementStatus: string } };
    expect(managerSession.legal).toEqual({ agreementStatus: "not_applicable" });
    expect((await manager.query(api.domain.query, operation("legal.agreement.current")) as Context).canSign).toBe(false);
  });

  it("records a drawn signature with server time, a verified document fingerprint, a masked ID, audit, and copies to the signer and both founders", async () => {
    const { owner, admin, t } = await seeded();
    const signed = await owner.mutation(api.domain.mutate, operation("legal.agreement.sign", await signingInput())) as Agreement;
    expect(signed.reference).toMatch(/^RVT-\d{8}-[A-Z2-9]{5}$/);
    expect(signed).toMatchObject({ status: "signed", hashMatch: true, signature: { method: "drawn", imageDataUrl: PNG }, signatory: { idNumberMasked: "••••••4567", name: "Omar Haddad" } });
    expect(signed.signatory.idNumber).toBeUndefined();
    expect(Date.parse(signed.signedAt)).toBeGreaterThan(Date.now() - 60_000);

    const replay = await owner.mutation(api.domain.mutate, operation("legal.agreement.sign", await signingInput())) as Agreement;
    expect(replay.id).toBe(signed.id);
    await expectCode(owner.mutation(api.domain.mutate, operation("legal.agreement.sign", await signingInput({ idempotencyKey: "sign-2" }))), "CONFLICT");

    const session = await owner.query(api.domain.query, operation("session")) as { legal: { agreementStatus: string; agreementReference: string } };
    expect(session.legal).toEqual({ agreementStatus: "signed", agreementReference: signed.reference });
    const context = await owner.query(api.domain.query, operation("legal.agreement.current")) as Context;
    expect(context).toMatchObject({ status: "signed", canSign: false, agreement: { reference: signed.reference } });

    const stored = await t.run(async (ctx) => (await ctx.db.query("subscriptionAgreements").collect())[0]);
    expect(stored).toMatchObject({ signatory: expect.objectContaining({ idNumber: "9871234567" }), documentSha256: await sha256Hex(canonicalAgreementText()), idRevealCount: 0, emailDeliveryPublicId: expect.stringMatching(/^EMAIL-/) });
    const audits = await t.run(async (ctx) => (await ctx.db.query("auditEvents").collect()).filter((event) => event.action === "legal.agreement.sign"));
    expect(audits).toHaveLength(1);
    expect(JSON.stringify(audits[0]?.after)).not.toContain("9871234567");
    const emails = await t.run(async (ctx) => await ctx.db.query("operationalEmailDeliveries").collect());
    const signerCopy = emails.find((row) => row.kind === "subscription_agreement_signed");
    expect(signerCopy).toMatchObject({ recipientEmail: "omar@ironhouse.example", subject: `Your signed RIVET subscription agreement ${signed.reference}` });
    expect(signerCopy?.html).toContain("••••••4567");
    // The agreement travels as the attached PDF; the email stays a summary.
    expect(signerCopy?.text).toContain("Reference: " + signed.reference);
    expect(signerCopy?.text).toContain("Attached: RIVET-agreement-" + signed.reference + ".pdf");
    expect(signerCopy?.html).toContain("/brand/rivet-lockup.png");
    const founderCopies = emails.filter((row) => row.kind === "subscription_agreement_copy");
    expect(founderCopies.map((row) => row.recipientEmail).sort()).toEqual(["elias@rivetjo.com", "hashem@rivetjo.com"]);
    for (const row of founderCopies) {
      expect(row.subject).toBe(`Iron House Fitness signed the RIVET subscription agreement (${signed.reference})`);
      expect(row.html).toContain("••••••4567");
      expect(`${row.html}${row.text}${row.subject}`).not.toContain("9871234567");
      expect(row.relatedEntityPublicId).toBe(signed.id);
    }
    // A replayed signing must not queue a second set of copies.
    expect(emails.filter((row) => row.relatedEntityPublicId === signed.id)).toHaveLength(3);

    // Every copy carries the signed agreement as a PDF a reader can open,
    // and the PDF never carries the unmasked ID number.
    for (const row of emails.filter((item) => item.relatedEntityPublicId === signed.id)) {
      expect(row.attachments).toHaveLength(1);
      const attachment = row.attachments![0]!;
      expect(attachment).toMatchObject({ filename: `RIVET-agreement-${signed.reference}.pdf`, contentType: "application/pdf" });
      const pdf = Array.from(decodeBase64(attachment.contentBase64), (byte) => String.fromCharCode(byte)).join("");
      expect(pdf.startsWith("%PDF-1.4")).toBe(true);
      expect(pdf.trimEnd().endsWith("%%EOF")).toBe(true);
      expect(pdf).toContain("(Subscription agreement) Tj");
      expect(pdf).toContain("4567 \\(masked\\)");
      expect(pdf).not.toContain("9871234567");
    }
    const notices = await t.run(async (ctx) => await ctx.db.query("operationalNotifications").collect());
    expect(notices.find((row) => row.kind === "subscription_agreement_signed")).toBeDefined();

    const detail = await admin.query(api.domain.query, operation("platform.gym.detail", { gymId: "missing" })).catch(() => undefined);
    expect(detail).toBeUndefined();
  });

  it("flags a fingerprint mismatch for review instead of rejecting the signing", async () => {
    const { owner } = await seeded();
    const signed = await owner.mutation(api.domain.mutate, operation("legal.agreement.sign", await signingInput({ clientDocumentSha256: "deadbeef" }))) as Agreement;
    expect(signed.hashMatch).toBe(false);
    expect(signed.status).toBe("signed");
  });

  it("validates identity, consents, and signature before writing anything", async () => {
    const { owner, manager, otherOwner, t } = await seeded();
    const base = await signingInput();
    await expectCode(manager.mutation(api.domain.mutate, operation("legal.agreement.sign", base)), "FORBIDDEN");
    await expectCode(owner.mutation(api.domain.mutate, operation("legal.agreement.sign", { ...base, signatory: { ...base.signatory, idNumber: "12345" } })), "VALIDATION_ERROR");
    await expectCode(owner.mutation(api.domain.mutate, operation("legal.agreement.sign", { ...base, consents: { ...base.consents, authority: false } })), "VALIDATION_ERROR");
    await expectCode(owner.mutation(api.domain.mutate, operation("legal.agreement.sign", { ...base, signature: { method: "drawn" } })), "VALIDATION_ERROR");
    await expectCode(owner.mutation(api.domain.mutate, operation("legal.agreement.sign", { ...base, signature: { method: "typed", typedName: "Someone Else" } })), "VALIDATION_ERROR");
    await expectCode(owner.mutation(api.domain.mutate, operation("legal.agreement.sign", { ...base, subscription: { ...base.subscription, startDate: "2026-02-30" } })), "VALIDATION_ERROR");
    await expectCode(owner.mutation(api.domain.mutate, operation("legal.agreement.sign", { ...base, subscription: { ...base.subscription, termMonths: 0 } })), "VALIDATION_ERROR");
    await expectCode(owner.mutation(api.domain.mutate, operation("legal.agreement.sign", { ...base, customer: { ...base.customer, branches: 0 } })), "VALIDATION_ERROR");
    await expectCode(owner.mutation(api.domain.mutate, operation("legal.agreement.sign", { ...base, customer: { legalName: "Iron House Fitness Co." } })), "VALIDATION_ERROR");
    await expectCode(owner.mutation(api.domain.mutate, operation("legal.agreement.sign", { ...base, signatory: { ...base.signatory, email: "not-an-email" } })), "VALIDATION_ERROR");
    expect(await t.run(async (ctx) => await ctx.db.query("subscriptionAgreements").collect())).toHaveLength(0);
    // Optional details a future form may add are validated when present and stored as given.
    const typed = await owner.mutation(api.domain.mutate, operation("legal.agreement.sign", { ...base, signature: { method: "typed", typedName: "omar haddad" }, signatory: { ...base.signatory, idType: "passport", idNumber: "P1234567", title: "Owner", phone: "077 123 4567" }, customer: { ...base.customer, city: "Amman", branches: 2 }, subscription: { ...base.subscription, termMonths: 12, quote: "Q-1" } })) as Agreement & { customer: Record<string, unknown>; subscription: Record<string, unknown>; placeOfSigning?: string };
    expect(typed).toMatchObject({ signature: { method: "typed" }, signatory: { idNumberMasked: "••••4567", title: "Owner" }, customer: { city: "Amman", branches: 2 }, subscription: { termMonths: 12, quote: "Q-1" }, placeOfSigning: "Amman" });
    expect((await otherOwner.query(api.domain.query, operation("session")) as { legal: { agreementStatus: string } }).legal.agreementStatus).toBe("required");
  });

  it("re-sends the copies of an existing agreement with the PDF, and reports what was suppressed", async () => {
    const { owner, admin, manager, t } = await seeded();
    const signed = await owner.mutation(api.domain.mutate, operation("legal.agreement.sign", await signingInput())) as Agreement;
    await expectCode(manager.mutation(api.domain.mutate, operation("platform.agreement.resend_copies", { agreementId: signed.id, audience: "rivet", idempotencyKey: "r1" })), "FORBIDDEN");
    await expectCode(admin.mutation(api.domain.mutate, operation("platform.agreement.resend_copies", { agreementId: signed.id, audience: "everyone", idempotencyKey: "r1" })), "VALIDATION_ERROR");

    type Resend = { sequence: number; deliveries: Array<{ recipient: string; status: string; reason?: string }> };
    const first = await admin.mutation(api.domain.mutate, operation("platform.agreement.resend_copies", { agreementId: signed.id, audience: "rivet", idempotencyKey: "r1" })) as Resend;
    expect(first.sequence).toBe(1);
    expect(first.deliveries.map((delivery) => delivery.recipient)).toEqual(["elias@rivetjo.com", "hashem@rivetjo.com"]);
    // Sending is off in tests, so the honest answer is "suppressed", with the reason.
    expect(first.deliveries.every((delivery) => delivery.status === "suppressed" && /mode is off/.test(delivery.reason ?? ""))).toBe(true);
    // A repeat of the same request must not queue a second round.
    expect(await admin.mutation(api.domain.mutate, operation("platform.agreement.resend_copies", { agreementId: signed.id, audience: "rivet", idempotencyKey: "r1" }))).toEqual(first);

    const second = await admin.mutation(api.domain.mutate, operation("platform.agreement.resend_copies", { agreementId: signed.id, audience: "all", idempotencyKey: "r2" })) as Resend;
    expect(second.sequence).toBe(2);
    expect(second.deliveries.map((delivery) => delivery.recipient)).toEqual(["elias@rivetjo.com", "hashem@rivetjo.com", "omar@ironhouse.example"]);

    // Each resend writes its own delivery rows, every one carrying the PDF.
    const emails = await t.run(async (ctx) => await ctx.db.query("operationalEmailDeliveries").collect());
    const resends = emails.filter((row) => row.dedupeKey.startsWith("agreement-resend:"));
    expect(resends).toHaveLength(5);
    for (const row of resends) {
      expect(row.attachments?.[0]).toMatchObject({ filename: `RIVET-agreement-${signed.reference}.pdf`, contentType: "application/pdf" });
      expect(row.relatedEntityPublicId).toBe(signed.id);
    }
    const audits = await t.run(async (ctx) => (await ctx.db.query("platformAuditEvents").collect()).filter((event) => event.action === "agreement.copies_resent"));
    expect(audits).toHaveLength(2);
  });

  it("lets platform admins list, countersign, and reveal the ID with a reason and an audit event, and hides all of it from gym staff", async () => {
    const { owner, admin, manager, t } = await seeded();
    const signed = await owner.mutation(api.domain.mutate, operation("legal.agreement.sign", await signingInput())) as Agreement;
    await expectCode(owner.query(api.domain.query, operation("platform.agreements.list")), "FORBIDDEN");
    await expectCode(manager.mutation(api.domain.mutate, operation("platform.agreement.reveal_id", { agreementId: signed.id, reason: "Contract check" })), "FORBIDDEN");

    const list = await admin.query(api.domain.query, operation("platform.agreements.list")) as Array<{ id: string; organizationName: string; status: string; hashMatch: boolean }>;
    expect(list).toEqual([expect.objectContaining({ id: signed.id, organizationName: "Iron House Fitness", status: "signed", hashMatch: true })]);
    const detail = await admin.query(api.domain.query, operation("platform.agreement.get", { agreementId: signed.id })) as Agreement;
    expect(detail.signatory.idNumber).toBeUndefined();
    expect(detail.signatory.idNumberMasked).toBe("••••••4567");

    await expectCode(admin.mutation(api.domain.mutate, operation("platform.agreement.reveal_id", { agreementId: signed.id, reason: "" })), "VALIDATION_ERROR");
    const reveal = await admin.mutation(api.domain.mutate, operation("platform.agreement.reveal_id", { agreementId: signed.id, reason: "Verifying the signatory before countersigning" })) as { idNumber: string; revealCount: number };
    expect(reveal).toEqual({ idNumber: "9871234567", idType: "national", revealCount: 1 });
    const revealAudit = await t.run(async (ctx) => (await ctx.db.query("platformAuditEvents").collect()).filter((event) => event.action === "agreement.id_revealed"));
    expect(revealAudit).toHaveLength(1);
    expect(JSON.stringify(revealAudit[0])).not.toContain("9871234567");

    await expectCode(admin.mutation(api.domain.mutate, operation("platform.agreement.countersign", { agreementId: signed.id, title: "Co-founder", typedName: "Wrong Name", idempotencyKey: "cs-1" })), "VALIDATION_ERROR");
    // RIVET signs its own side by hand, exactly like the customer.
    const countersigned = await admin.mutation(api.domain.mutate, operation("platform.agreement.countersign", { agreementId: signed.id, title: "Co-founder", typedName: "Elias Hreish", signature: { method: "drawn", imageDataUrl: PNG }, idempotencyKey: "cs-1" })) as Agreement & { countersign?: { signature?: { method: string; imageDataUrl?: string } } };
    expect(countersigned).toMatchObject({ status: "countersigned", countersign: { byName: "Elias Hreish", title: "Co-founder", signature: { method: "drawn", imageDataUrl: PNG } } });
    await expectCode(admin.mutation(api.domain.mutate, operation("platform.agreement.countersign", { agreementId: signed.id, title: "Co-founder", typedName: "Elias Hreish", signature: { method: "typed", typedName: "Someone Else" }, replace: true, idempotencyKey: "cs-bad" })), "VALIDATION_ERROR");
    const again = await admin.mutation(api.domain.mutate, operation("platform.agreement.countersign", { agreementId: signed.id, title: "Co-founder", typedName: "Elias Hreish", idempotencyKey: "cs-2" })) as Agreement;
    expect(again.status).toBe("countersigned");
    // Replacing RIVET's mark is allowed, audited, and sends a fresh copy.
    const replaced = await admin.mutation(api.domain.mutate, operation("platform.agreement.countersign", { agreementId: signed.id, title: "Founder", typedName: "Elias Hreish", signature: { method: "typed", typedName: "Elias Hreish" }, replace: true, idempotencyKey: "cs-3" })) as Agreement & { countersign?: { title: string; signature?: { method: string } } };
    expect(replaced.countersign).toMatchObject({ title: "Founder", signature: { method: "typed" } });
    const replacedAudit = await t.run(async (ctx) => (await ctx.db.query("platformAuditEvents").collect()).filter((event) => event.action === "agreement.countersign_replaced"));
    expect(replacedAudit).toHaveLength(1);
    expect((await owner.query(api.domain.query, operation("session")) as { legal: { agreementStatus: string } }).legal.agreementStatus).toBe("countersigned");
    const emails = await t.run(async (ctx) => await ctx.db.query("operationalEmailDeliveries").collect());
    expect(emails.map((row) => row.kind)).toEqual(expect.arrayContaining(["subscription_agreement_signed", "subscription_agreement_countersigned"]));
    // The completed copy carries a PDF that shows both signatures.
    const completed = emails.find((row) => row.kind === "subscription_agreement_countersigned")!;
    const pdf = Array.from(decodeBase64(completed.attachments![0]!.contentBase64), (byte) => String.fromCharCode(byte)).join("");
    expect(pdf).toContain("(Elias Hreish, Co-founder) Tj");
    expect(pdf).toContain("(Countersigned ");
    expect(pdf).toContain("(Signed and countersigned) Tj");
  });
});
