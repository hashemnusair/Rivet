/**
 * The whole communications chain against the real backend: an owner signs,
 * RIVET countersigns by hand, copies are re-sent, the agreement is voided
 * and signed again; an invoice is issued, marked past due and paid. Every
 * message that comes out is checked for the branded template and a readable
 * PDF. Set RIVET_DUMP_DIR to a folder to write the emails and PDFs out for
 * a look in a browser.
 */
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import { mkdirSync, writeFileSync } from "node:fs";
import { api } from "./_generated/api";
import schema from "./schema";
import { canonicalAgreementText, sha256Hex } from "./legalAgreementText";
import { decodeBase64 } from "./pdfDocument";

declare global { interface ImportMeta { glob(pattern: string): Record<string, () => Promise<unknown>>; } }
const modules = import.meta.glob("./**/*.ts");
const operation = (name: string, input: Record<string, unknown> = {}) => ({ operation: name, input, correlationId: `cor-comms-${name}` });

const PNG = `data:image/png;base64,${"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ".repeat(8)}`;
// SOI, APP0, a 400x100 frame header, entropy, EOI: enough for the PDF to embed.
const JPEG_BYTES = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x64, 0x01, 0x90, 0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01, 0xff, 0xda, ...new Array(64).fill(0x7f), 0xff, 0xd9]);
const JPEG = `data:image/jpeg;base64,${Buffer.from(JPEG_BYTES).toString("base64")}`;
const DUMP = process.env.RIVET_DUMP_DIR;

type Delivery = { kind: string; dedupeKey?: string; recipientEmail?: string; subject?: string; html?: string; text?: string; status: string; attachments?: Array<{ filename: string; contentType: string; contentBase64: string }> };
type Agreement = { id: string; reference: string; status: string; countersign?: { signature?: { method: string } } };
// The chain below also proves the numbering: clauses 3 to 12, signatures at 13.

function pdfText(base64: string): string {
  return Array.from(decodeBase64(base64), (byte) => String.fromCharCode(byte)).join("");
}

function dump(name: string, content: string | Uint8Array) {
  if (!DUMP) return;
  mkdirSync(DUMP, { recursive: true });
  writeFileSync(`${DUMP}/${name}`, content);
}

/** Every delivery must be the branded template, and every PDF must open. */
function expectBranded(delivery: Delivery, label: string) {
  expect(delivery.html, label).toContain("/brand/rivet-lockup.png");
  expect(delivery.html, label).toContain("This is a service message about your RIVET account.");
  expect(delivery.html, label).toContain("077 837 8608");
  expect(delivery.html, label).not.toContain("Unsubscribe");
  dump(`${label}.html`, delivery.html ?? "");
  for (const attachment of delivery.attachments ?? []) {
    const pdf = pdfText(attachment.contentBase64);
    expect(pdf.startsWith("%PDF-1.4"), `${label} attachment`).toBe(true);
    expect(pdf.trimEnd().endsWith("%%EOF"), `${label} attachment`).toBe(true);
    expect(pdf, `${label} attachment`).toContain("/Subtype /Image");
    expect(delivery.html, label).toContain(attachment.filename);
    dump(`${label}-${attachment.filename}`, decodeBase64(attachment.contentBase64));
  }
}

async function seeded() {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    const now = Date.now();
    const organization = await ctx.db.insert("organizations", { publicId: "comms-org", name: "Forge Fitness Club", slug: "forge", status: "active", subscriptionPlan: "Growth", subscriptionStartedAt: Date.UTC(2026, 8, 3, 9), timezone: "Asia/Amman", currency: "JOD", brandPaletteKey: "rivet", createdAt: now, updatedAt: now });
    const branch = await ctx.db.insert("branches", { organizationId: organization, publicId: "comms-branch", name: "Abdoun", code: "ABD", address: "Salah Al-Suheimat St 12, Abdoun, Amman", active: true, status: "active", createdAt: now, updatedAt: now });
    const owner = await ctx.db.insert("users", { publicId: "comms-owner", authSubject: "clerk-comms-owner", email: "omar@forgefitness.jo", fullName: "Omar Al-Khatib", platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
    await ctx.db.insert("users", { publicId: "comms-admin", authSubject: "clerk-comms-admin", email: "elias@rivetjo.com", fullName: "Elias Hreish", platformAdmin: true, status: "active", createdAt: now, updatedAt: now });
    await ctx.db.insert("organizationMemberships", { organizationId: organization, userId: owner, role: "owner", branchIds: [branch], branchScope: "all", active: true, createdAt: now, updatedAt: now });
    await ctx.db.insert("domainRecords", { organizationId: organization, entityType: "marketplaceGym", publicId: "forge-gym", createdAt: now, updatedAt: now, data: { id: "forge-gym", name: "Forge Fitness Club", targetOrganizationId: "comms-org", subscriptionStatus: "active", rivetPlan: "Growth", isPublic: true } });
  });
  return { t, owner: t.withIdentity({ subject: "clerk-comms-owner" }), admin: t.withIdentity({ subject: "clerk-comms-admin" }) };
}

async function signingInput(key: string) {
  return {
    customer: { legalName: "Forge Fitness Club LLC", address: "Salah Al-Suheimat St 12, Abdoun, Amman" },
    signatory: { name: "Omar Al-Khatib", idType: "national", idNumber: "9871234567", email: "omar@forgefitness.jo" },
    subscription: { plan: "Growth", startDate: "2026-09-03" },
    consents: { agreement: true, authority: true, electronic: true, accurate: true },
    signature: { method: "drawn", imageDataUrl: PNG, printImageDataUrl: JPEG },
    client: { userAgent: "Mozilla/5.0 (test)", language: "en-JO", viewport: "1440x900" },
    clientDocumentSha256: await sha256Hex(canonicalAgreementText()),
    idempotencyKey: key,
  };
}

describe("communications, end to end", () => {
  it("signs, countersigns by hand, re-sends, voids and signs again, with a branded email and a readable PDF at every step", async () => {
    const { t, owner, admin } = await seeded();
    const emails = async () => await t.run(async (ctx) => await ctx.db.query("operationalEmailDeliveries").collect()) as Delivery[];

    // 1. The owner signs through the short form with a drawn signature.
    const first = await owner.mutation(api.domain.mutate, operation("legal.agreement.sign", await signingInput("sign-1"))) as Agreement;
    expect(first.status).toBe("signed");
    let all = await emails();
    expect(all.map((row) => row.recipientEmail).sort()).toEqual(["elias@rivetjo.com", "hashem@rivetjo.com", "omar@forgefitness.jo"]);
    for (const row of all) {
      expectBranded(row, `01-signed-${row.recipientEmail}`);
      expect(row.attachments?.[0]?.filename).toBe(`RIVET-agreement-${first.reference}.pdf`);
      const pdf = pdfText(row.attachments![0]!.contentBase64);
      expect(pdf).toContain("(SUBSCRIPTION AGREEMENT) Tj");
      expect(pdf).toContain("(Signed, awaiting countersignature) Tj");
      expect(pdf).not.toContain("9871234567");
    }

    // 2. RIVET countersigns by hand; the completed copy shows both marks.
    const countersigned = await admin.mutation(api.domain.mutate, operation("platform.agreement.countersign", { agreementId: first.id, title: "Co-founder", typedName: "Elias Hreish", signature: { method: "drawn", imageDataUrl: PNG, printImageDataUrl: JPEG }, idempotencyKey: "cs-1" })) as Agreement;
    expect(countersigned.countersign?.signature?.method).toBe("drawn");
    all = await emails();
    const completed = all.find((row) => row.kind === "subscription_agreement_countersigned")!;
    expectBranded(completed, "02-countersigned");
    // RIVET's own addresses get the completed agreement too, not only the signer.
    const completedCopies = all.filter((row) => row.dedupeKey?.startsWith("agreement-countersigned-copy:"));
    expect(completedCopies.map((row) => row.recipientEmail).sort()).toEqual(["elias@rivetjo.com", "hashem@rivetjo.com"]);
    for (const row of completedCopies) expect(row.attachments?.[0]?.filename).toBe(`RIVET-agreement-${first.reference}.pdf`);
    const completedPdf = pdfText(completed.attachments![0]!.contentBase64);
    expect(completedPdf).toContain("(Signed and countersigned) Tj");
    expect(completedPdf).toContain("(Elias Hreish) Tj");
    expect(completedPdf).toContain("(Co-founder, RIVET) Tj");
    // Two signature frames, each with an embedded image: the customer's and RIVET's.
    expect([...completedPdf.matchAll(/\/Subtype \/Image/g)].length).toBeGreaterThanOrEqual(4);

    // 3. Copies can be sent again, and the console is told what happened.
    const resent = await admin.mutation(api.domain.mutate, operation("platform.agreement.resend_copies", { agreementId: first.id, audience: "all", idempotencyKey: "rs-1" })) as { deliveries: Array<{ recipient: string; status: string; reason?: string }> };
    expect(resent.deliveries.map((delivery) => delivery.recipient)).toEqual(["elias@rivetjo.com", "hashem@rivetjo.com", "omar@forgefitness.jo"]);
    expect(resent.deliveries.every((delivery) => delivery.status === "suppressed" && /mode is off/.test(delivery.reason ?? ""))).toBe(true);
    all = await emails();
    for (const row of all.filter((item) => item.subject?.includes("countersigned") && item.kind === "subscription_agreement_copy")) expectBranded(row, `03-resent-${row.recipientEmail}`);

    // 4. Voiding retires the record and gates the owner again.
    await expect(admin.mutation(api.domain.mutate, operation("platform.agreement.void", { agreementId: first.id, reason: "" }))).rejects.toMatchObject({ data: expect.objectContaining({ code: "VALIDATION_ERROR" }) });
    await expect(owner.mutation(api.domain.mutate, operation("platform.agreement.void", { agreementId: first.id, reason: "Owner cannot void" }))).rejects.toMatchObject({ data: expect.objectContaining({ code: "FORBIDDEN" }) });
    const voided = await admin.mutation(api.domain.mutate, operation("platform.agreement.void", { agreementId: first.id, reason: "Signed under the long form before the modal; re-signing on 1.1" })) as Agreement & { voidReason?: string };
    expect(voided).toMatchObject({ status: "void", voidReason: "Signed under the long form before the modal; re-signing on 1.1" });
    const session = await owner.query(api.domain.query, operation("session")) as { legal: { agreementStatus: string } };
    expect(session.legal.agreementStatus).toBe("required");
    const context = await owner.query(api.domain.query, operation("legal.agreement.current")) as { canSign: boolean; agreement?: unknown };
    expect(context.canSign).toBe(true);
    expect(context.agreement).toBeUndefined();

    // 5. The owner signs again; it is a new agreement with a new reference and fresh copies.
    const second = await owner.mutation(api.domain.mutate, operation("legal.agreement.sign", await signingInput("sign-2"))) as Agreement;
    expect(second.id).not.toBe(first.id);
    expect(second.reference).not.toBe(first.reference);
    expect((await owner.query(api.domain.query, operation("session")) as { legal: { agreementStatus: string; agreementReference: string } }).legal).toEqual({ agreementStatus: "signed", agreementReference: second.reference });
    all = await emails();
    expect(all.filter((row) => row.attachments?.[0]?.filename === `RIVET-agreement-${second.reference}.pdf`)).toHaveLength(3);
    const list = await admin.query(api.domain.query, operation("platform.agreements.list")) as Array<{ id: string; status: string }>;
    expect(list.map((row) => [row.id, row.status])).toEqual(expect.arrayContaining([[first.id, "void"], [second.id, "signed"]]));
    const ledger = await t.run(async (ctx) => (await ctx.db.query("platformAuditEvents").collect()).map((event) => event.action));
    expect(ledger).toEqual(expect.arrayContaining(["agreement.countersigned", "agreement.copies_resent", "agreement.voided"]));
  });

  it("issues, chases and settles an invoice, each notice branded and carrying the invoice PDF", async () => {
    const { t, admin, owner } = await seeded();
    const emails = async () => await t.run(async (ctx) => await ctx.db.query("operationalEmailDeliveries").collect()) as Delivery[];
    const draft = await admin.mutation(api.domain.mutate, operation("platform.invoice.create", { gymId: "forge-gym", amountMinor: 149_000, currency: "JOD", periodStart: "2026-09-03", periodEnd: "2026-10-02", dueAt: "2026-09-17" })) as { id: string };

    await admin.mutation(api.domain.mutate, operation("platform.invoice.issue", { invoiceId: draft.id }));
    let all = await emails();
    const issued = all.find((row) => row.kind === "platform_invoice_issued")!;
    expectBranded(issued, "04-invoice-issued");
    expect(issued.subject).toBe("A RIVET invoice was issued");
    expect(issued.html).toContain("View invoice");
    expect(issued.html).not.toContain("#AD1B22");
    expect(issued.attachments?.[0]?.filename).toBe(`RIVET-invoice-${draft.id}.pdf`);
    const issuedPdf = pdfText(issued.attachments![0]!.contentBase64);
    expect(issuedPdf).toContain("(INVOICE) Tj");
    expect(issuedPdf).toContain("(Open) Tj");
    expect(issuedPdf).toContain("(Forge Fitness Club) Tj");
    expect(issuedPdf).toContain("(Omar Al-Khatib \\(owner\\)) Tj");
    expect(issuedPdf).toContain("JOD 149.000");
    expect(issuedPdf).toContain("(Total due) Tj");
    expect(issuedPdf).toContain("[Treatment to be decided]");

    await admin.mutation(api.domain.mutate, operation("platform.invoice.past_due", { invoiceId: draft.id, reason: "Bank transfer was not received by the due date." }));
    all = await emails();
    const pastDue = all.find((row) => row.kind === "platform_invoice_past_due")!;
    expectBranded(pastDue, "05-invoice-past-due");
    // The one signal red: a single chip in the email, a single chip on the PDF.
    expect([...(pastDue.html ?? "").matchAll(/#AD1B22/g)]).toHaveLength(1);
    expect(pdfText(pastDue.attachments![0]!.contentBase64)).toContain("(Past due) Tj");

    // The gym sees its own invoices, drafts excluded, and nobody else's.
    const mine = await owner.query(api.domain.query, operation("billing.invoices.list")) as Array<{ id: string; status: string; gym: string }>;
    expect(mine).toEqual([expect.objectContaining({ id: draft.id, status: "past_due", gym: "Forge Fitness Club" })]);

    await admin.mutation(api.domain.mutate, operation("platform.invoice.payment", { invoiceId: draft.id, reference: "CLIQ-8F2K19", reason: "CliQ transfer verified." }));
    all = await emails();
    const paid = all.find((row) => row.kind === "platform_invoice_paid")!;
    expectBranded(paid, "06-invoice-paid");
    const paidPdf = pdfText(paid.attachments![0]!.contentBase64);
    expect(paidPdf).toMatch(/\(Paid \\267 \d+ [A-Z][a-z]{2} 2026\) Tj|\(Paid \xb7 \d+ [A-Z][a-z]{2} 2026\) Tj/);
    expect(paidPdf).toContain("(Amount paid) Tj");
    expect(paidPdf).toContain("(Payment reference CLIQ-8F2K19.) Tj");
  });
});
