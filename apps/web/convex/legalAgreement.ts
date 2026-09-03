import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { domainError, publicOrganizationId, publicUserId, requireActor, requirePlatformAdmin, requireReason, type ActorContext, type RequestArgs } from "./security";
import { notifyPlatformAdmins } from "./notificationDelivery";
import { enqueueOperationalEmail } from "./operationalEmail";
import { renderAgreementCopyEmail, type AgreementCopy } from "./legalAgreementEmail";
import { attachmentSizeLabel } from "./emailTemplate";
import { agreementPdfFilename, renderAgreementPdfBase64 } from "./legalAgreementPdf";
import {
  AGREEMENT_COPY_RECIPIENTS,
  AGREEMENT_ID_TYPES,
  AGREEMENT_PLANS,
  MAX_SIGNATURE_IMAGE_LENGTH,
  MAX_SIGNATURE_PRINT_IMAGE_LENGTH,
  SIGNATURE_METHODS,
  SUBSCRIPTION_AGREEMENT_SECTIONS,
  SUBSCRIPTION_AGREEMENT_VERSION,
  agreementReference,
  canonicalAgreementText,
  maskIdNumber,
  sha256Hex,
  validCalendarDate,
  validNationalId,
  validPassportNumber,
} from "./legalAgreementText";

type ReadContext = QueryCtx | MutationCtx;
type Data = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type AgreementRow = Doc<"subscriptionAgreements">;
type PlatformAdmin = Awaited<ReturnType<typeof requirePlatformAdmin>>;

const MAX_TEXT = 160;
const MAX_ADDRESS = 240;

function text(input: unknown, fallback = ""): string {
  return typeof input === "string" ? input : fallback;
}

function trimmed(input: unknown): string {
  return text(input).trim();
}

function optionalTrimmed(input: unknown): string | undefined {
  const value = trimmed(input);
  return value || undefined;
}

function value(input: unknown): Data {
  return input && typeof input === "object" && !Array.isArray(input) ? input as Data : {};
}

function iso(timestamp: number): string {
  return new Date(timestamp).toISOString();
}

function localDate(timestamp: number, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timeZone || "Asia/Amman", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(timestamp));
}

function localDateTime(timestamp: number, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: timeZone || "Asia/Amman", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(timestamp));
}

function validEmail(input: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input);
}

function validPhone(input: string): boolean {
  return /^\+?[\d\s().-]{7,}$/.test(input);
}

function requireField(condition: boolean, field: string, message: string, correlationId: string): void {
  if (!condition) domainError("VALIDATION_ERROR", message, { correlationId, fieldErrors: { [field]: [message] } });
}

async function activeAgreement(ctx: ReadContext, organizationId: Id<"organizations">): Promise<AgreementRow | undefined> {
  const rows = await ctx.db.query("subscriptionAgreements").withIndex("by_organization", (q) => q.eq("organizationId", organizationId)).collect();
  return rows.filter((row) => row.status !== "void").sort((left, right) => right.signedAt - left.signedAt)[0];
}

/** Session projection: does this actor still owe a signature? */
export async function agreementSessionState(ctx: ReadContext, actor: ActorContext): Promise<{ agreementStatus: "required" | "signed" | "countersigned" | "not_applicable"; agreementReference?: string }> {
  const current = await activeAgreement(ctx, actor.organization._id);
  if (current) return { agreementStatus: current.status === "countersigned" ? "countersigned" : "signed", agreementReference: current.reference };
  return { agreementStatus: actor.role === "owner" ? "required" : "not_applicable" };
}

function agreementView(row: AgreementRow, organizationName: string, options: { revealId?: boolean } = {}): Data {
  return {
    id: row.publicId,
    reference: row.reference,
    version: row.agreementVersion,
    status: row.status,
    organizationId: row.organizationPublicId,
    organizationName,
    customer: { ...row.customer },
    signatory: {
      name: row.signatory.name,
      title: row.signatory.title,
      idType: row.signatory.idType,
      idNumberMasked: maskIdNumber(row.signatory.idNumber),
      ...(options.revealId ? { idNumber: row.signatory.idNumber } : {}),
      phone: row.signatory.phone,
      email: row.signatory.email,
    },
    subscription: { ...row.subscription },
    consents: { ...row.consents },
    signature: { method: row.signature.method, imageDataUrl: row.signature.imageDataUrl, printImageDataUrl: row.signature.printImageDataUrl, typedName: row.signature.typedName },
    client: { ...row.client },
    placeOfSigning: row.placeOfSigning,
    signedAt: iso(row.signedAt),
    signedAtLocal: row.signedAtLocal,
    timezone: row.timezone,
    signedByName: row.signedByName,
    documentSha256: row.documentSha256,
    clientDocumentSha256: row.clientDocumentSha256,
    hashMatch: row.hashMatch,
    countersign: row.countersignedAt ? {
      at: iso(row.countersignedAt),
      byName: row.countersignedByName ?? "RIVET",
      title: row.countersignTitle ?? "",
      typedName: row.countersignTypedName ?? "",
      signature: row.countersignSignature ? { ...row.countersignSignature } : { method: "typed" as const, typedName: row.countersignTypedName ?? "" },
    } : undefined,
    idRevealCount: row.idRevealCount,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

/** Summary used by the platform console and the gym detail panel. */
export function agreementSummary(row: AgreementRow, organizationName: string): Data {
  return {
    id: row.publicId,
    reference: row.reference,
    version: row.agreementVersion,
    status: row.status,
    organizationId: row.organizationPublicId,
    organizationName,
    plan: row.subscription.plan,
    startDate: row.subscription.startDate,
    termMonths: row.subscription.termMonths,
    signatoryName: row.signatory.name,
    signedAt: iso(row.signedAt),
    countersignedAt: row.countersignedAt ? iso(row.countersignedAt) : undefined,
    hashMatch: row.hashMatch,
  };
}

export async function agreementSummaryForOrganization(ctx: ReadContext, organizationId: Id<"organizations">, organizationName: string): Promise<Data | undefined> {
  const current = await activeAgreement(ctx, organizationId);
  return current ? agreementSummary(current, organizationName) : undefined;
}

async function signingContext(ctx: ReadContext, actor: ActorContext): Promise<Data> {
  const organization = actor.organization;
  const current = await activeAgreement(ctx, organization._id);
  const textBody = canonicalAgreementText();
  const sha256 = await sha256Hex(textBody);
  const branches = await ctx.db.query("branches").withIndex("by_organization", (q) => q.eq("organizationId", organization._id)).collect();
  const application = organization.publicId
    ? (await ctx.db.query("gymApplications").collect()).find((row) => row.provisionedOrganizationId === organization.publicId)
    : undefined;
  const timeZone = organization.timezone || "Asia/Amman";
  const startDate = organization.subscriptionStartedAt ? localDate(organization.subscriptionStartedAt, timeZone) : localDate(Date.now(), timeZone);
  const address = branches.find((branch) => branch.active && branch.address)?.address ?? branches[0]?.address;
  return {
    version: SUBSCRIPTION_AGREEMENT_VERSION,
    sections: SUBSCRIPTION_AGREEMENT_SECTIONS.map((section) => ({ ...section, paragraphs: [...section.paragraphs] })),
    text: textBody,
    sha256,
    status: current ? current.status : actor.role === "owner" ? "required" : "not_applicable",
    canSign: actor.role === "owner" && !current,
    organizationName: organization.name,
    timezone: timeZone,
    prefill: {
      legalName: organization.name,
      address,
      signatoryName: actor.user.fullName,
      email: actor.user.email,
      plan: organization.subscriptionPlan ?? application?.plan ?? "Growth",
      startDate,
    },
    agreement: current ? agreementView(current, organization.name) : undefined,
  };
}

/** The email-safe projection of a row: masked ID, local times, no image. */
function agreementCopy(row: AgreementRow, organizationName: string): AgreementCopy {
  return {
    reference: row.reference,
    version: row.agreementVersion,
    organizationName,
    customer: { legalName: row.customer.legalName, address: row.customer.address, city: row.customer.city },
    signatory: { name: row.signatory.name, idType: row.signatory.idType, idNumberMasked: maskIdNumber(row.signatory.idNumber), email: row.signatory.email },
    subscription: { plan: row.subscription.plan, startDate: row.subscription.startDate },
    signature: { method: row.signature.method, typedName: row.signature.typedName, printImageDataUrl: row.signature.printImageDataUrl },
    signedAtLocal: row.signedAtLocal,
    timezone: row.timezone,
    documentSha256: row.documentSha256,
    hashMatch: row.hashMatch,
    countersign: row.countersignedAt ? {
      byName: row.countersignedByName ?? "RIVET",
      title: row.countersignTitle ?? "",
      atLocal: localDateTime(row.countersignedAt, row.timezone),
      signature: row.countersignSignature ?? { method: "typed", typedName: row.countersignTypedName },
    } : undefined,
  };
}

/**
 * Validate a captured signature, drawn or typed, against the name it must
 * match. Used for the customer's signature and for RIVET's countersignature,
 * so both sides are held to the same rules.
 */
function readSignature(input: Data, expectedName: string, correlationId: string, field = "signature"): { method: "drawn" | "typed"; imageDataUrl?: string; printImageDataUrl?: string; typedName?: string } {
  const method = trimmed(input.method) as (typeof SIGNATURE_METHODS)[number];
  requireField(SIGNATURE_METHODS.includes(method), field, "Sign, or type your name instead.", correlationId);
  const imageDataUrl = optionalTrimmed(input.imageDataUrl);
  const printImageDataUrl = optionalTrimmed(input.printImageDataUrl);
  const typedName = optionalTrimmed(input.typedName);
  if (method === "drawn") {
    requireField(Boolean(imageDataUrl) && imageDataUrl!.startsWith("data:image/png;base64,") && imageDataUrl!.length <= MAX_SIGNATURE_IMAGE_LENGTH && imageDataUrl!.length > 200, field, "Draw the signature before signing.", correlationId);
    // The PDF twin is optional: an older client, or a browser that cannot
    // produce it, still signs. The PDF then says the signature is on file.
    requireField(!printImageDataUrl || (printImageDataUrl.startsWith("data:image/jpeg;base64,") && printImageDataUrl.length <= MAX_SIGNATURE_PRINT_IMAGE_LENGTH), field, "The signature image could not be read. Draw it again.", correlationId);
    return { method, imageDataUrl, printImageDataUrl };
  }
  requireField(Boolean(typedName) && typedName!.toLowerCase() === expectedName.trim().toLowerCase(), field, "The typed signature must match the full name exactly.", correlationId);
  return { method, typedName };
}

/** The signed agreement as a PDF, named by its reference. */
function agreementPdfAttachment(row: AgreementRow, organizationName: string): { filename: string; contentType: string; contentBase64: string } {
  const copy = agreementCopy(row, organizationName);
  return {
    filename: agreementPdfFilename(row.reference),
    contentType: "application/pdf",
    contentBase64: renderAgreementPdfBase64({
      ...copy,
      status: row.status,
      placeOfSigning: row.placeOfSigning,
      signature: { method: row.signature.method, typedName: row.signature.typedName, printImageDataUrl: row.signature.printImageDataUrl },
    }, SUBSCRIPTION_AGREEMENT_SECTIONS),
  };
}

/**
 * Re-queue the copies for an agreement that is already signed. The email and
 * the PDF are rendered from the record as it stands now, so a resend carries
 * the countersignature and anything else added since. Each resend gets its
 * own dedupe keys: the original copies are deduped forever, and an email
 * suppressed while sending was off is never revisited by the worker.
 */
async function resendAgreementCopies(ctx: MutationCtx, row: AgreementRow, organizationName: string, language: "en" | "ar", includeSigner: boolean): Promise<Data> {
  const copy = agreementCopy(row, organizationName);
  const attachments = [agreementPdfAttachment(row, organizationName)];
  const options = { siteUrl: process.env.RIVET_SITE_URL, attachment: { filename: attachments[0]!.filename, sizeLabel: attachmentSizeLabel(attachments[0]!.contentBase64.length) } };
  const sequence = (row.copyResendCount ?? 0) + 1;
  const deliveries: Data[] = [];
  const queue = async (recipient: string, audience: "signer" | "rivet") => {
    const delivery = await enqueueOperationalEmail(ctx, {
      organizationId: row.organizationId,
      kind: audience === "signer" ? (row.status === "countersigned" ? "subscription_agreement_countersigned" : "subscription_agreement_signed") : "subscription_agreement_copy",
      templateVersion: row.agreementVersion,
      language: audience === "signer" ? language : "en",
      recipientReference: `agreement:${row.publicId}${audience === "rivet" ? ":rivet" : ""}`,
      recipientEmail: recipient,
      relatedEntityType: "subscription_agreement",
      relatedEntityPublicId: row.publicId,
      dedupeKey: `agreement-resend:${row.publicId}:${sequence}:${recipient}`,
      attachments,
      ...renderAgreementCopyEmail(copy, audience, options),
    });
    deliveries.push({ recipient, status: delivery.status === "suppressed" ? "suppressed" : "queued", reason: delivery.suppressionReason });
  };
  for (const recipient of AGREEMENT_COPY_RECIPIENTS) await queue(recipient, "rivet");
  if (includeSigner) await queue(row.signatory.email, "signer");
  await ctx.db.patch(row._id, { copyResendCount: sequence, updatedAt: Date.now() });
  return { sequence, deliveries };
}

/**
 * One copy to the signer and one to each founder address. All of them go
 * through the operational email boundary, so RIVET_EMAIL_MODE decides
 * whether anything leaves the platform; the queue rows are the evidence.
 */
async function sendAgreementCopies(ctx: MutationCtx, row: AgreementRow, organizationName: string, language: "en" | "ar"): Promise<Doc<"operationalEmailDeliveries">> {
  const copy = agreementCopy(row, organizationName);
  const attachments = [agreementPdfAttachment(row, organizationName)];
  const options = { siteUrl: process.env.RIVET_SITE_URL, attachment: { filename: attachments[0]!.filename, sizeLabel: attachmentSizeLabel(attachments[0]!.contentBase64.length) } };
  const signerDelivery = await enqueueOperationalEmail(ctx, {
    organizationId: row.organizationId,
    kind: "subscription_agreement_signed",
    templateVersion: row.agreementVersion,
    language,
    recipientReference: `agreement:${row.publicId}`,
    recipientEmail: row.signatory.email,
    relatedEntityType: "subscription_agreement",
    relatedEntityPublicId: row.publicId,
    dedupeKey: `agreement-signed:${row.publicId}`,
    attachments,
    ...renderAgreementCopyEmail(copy, "signer", options),
  });
  const rivetCopy = renderAgreementCopyEmail(copy, "rivet", options);
  for (const recipient of AGREEMENT_COPY_RECIPIENTS) {
    await enqueueOperationalEmail(ctx, {
      organizationId: row.organizationId,
      kind: "subscription_agreement_copy",
      templateVersion: row.agreementVersion,
      language: "en",
      recipientReference: `agreement:${row.publicId}:rivet`,
      recipientEmail: recipient,
      relatedEntityType: "subscription_agreement",
      relatedEntityPublicId: row.publicId,
      dedupeKey: `agreement-copy:${row.publicId}:${recipient}`,
      attachments,
      ...rivetCopy,
    });
  }
  return signerDelivery;
}

async function signAgreement(ctx: MutationCtx, actor: ActorContext, input: Data): Promise<Data> {
  const correlationId = actor.correlationId;
  if (actor.role !== "owner") domainError("FORBIDDEN", "Only the gym owner can sign the subscription agreement.", { correlationId });
  const idempotencyKey = optionalTrimmed(input.idempotencyKey);
  if (!idempotencyKey || idempotencyKey.length > 160) domainError("VALIDATION_ERROR", "A bounded idempotency key is required.", { correlationId });
  const existingKey = await ctx.db.query("idempotencyRecords").withIndex("by_organization_operation_key", (q) => q.eq("organizationId", actor.organization._id).eq("operation", "legal.agreement.sign").eq("key", idempotencyKey)).unique();
  if (existingKey) return value(existingKey.result);
  const current = await activeAgreement(ctx, actor.organization._id);
  if (current) domainError("CONFLICT", `This gym already signed agreement ${current.reference}. Contact RIVET if it must be replaced.`, { correlationId, details: { reference: current.reference } });

  const customer = value(input.customer);
  const signatory = value(input.signatory);
  const subscription = value(input.subscription);
  const consents = value(input.consents);
  const signature = value(input.signature);
  const client = value(input.client);

  // Only what a binding agreement needs: the parties, the signatory's
  // identity document, the plan RIVET set up, the start date, and the
  // signature. Everything else stays optional and is never asked for.
  const legalName = trimmed(customer.legalName);
  requireField(legalName.length >= 2 && legalName.length <= MAX_TEXT, "legalName", "Enter the registered name of the gym or company.", correlationId);
  const tradeName = optionalTrimmed(customer.tradeName);
  requireField(!tradeName || tradeName.length <= MAX_TEXT, "tradeName", "Trade name is too long.", correlationId);
  const registrationNumber = optionalTrimmed(customer.registrationNumber);
  requireField(!registrationNumber || registrationNumber.length <= 40, "registrationNumber", "Commercial registration number is too long.", correlationId);
  const address = trimmed(customer.address);
  requireField(address.length >= 3 && address.length <= MAX_ADDRESS, "address", "Enter the gym's address, including the city.", correlationId);
  const city = optionalTrimmed(customer.city);
  requireField(!city || city.length <= 80, "city", "City is too long.", correlationId);
  const branches = customer.branches === undefined || customer.branches === null || customer.branches === "" ? undefined : typeof customer.branches === "number" ? customer.branches : Number.parseInt(trimmed(customer.branches), 10);
  requireField(branches === undefined || (Number.isSafeInteger(branches) && branches >= 1 && branches <= 100), "branches", "Enter the number of branches (1 to 100).", correlationId);

  const signatoryName = trimmed(signatory.name);
  requireField(signatoryName.length >= 2 && signatoryName.length <= 120, "signatoryName", "Enter the owner's full name as on their ID.", correlationId);
  const signatoryTitle = optionalTrimmed(signatory.title);
  requireField(!signatoryTitle || signatoryTitle.length <= 80, "signatoryTitle", "Role is too long.", correlationId);
  const idType = trimmed(signatory.idType) as (typeof AGREEMENT_ID_TYPES)[number];
  requireField(AGREEMENT_ID_TYPES.includes(idType), "idType", "Choose the ID document.", correlationId);
  const idNumber = trimmed(signatory.idNumber);
  requireField(idType === "national" ? validNationalId(idNumber) : validPassportNumber(idNumber), "idNumber", idType === "national" ? "Enter the ten-digit Jordanian national ID number." : "Enter a valid passport number.", correlationId);
  const phone = optionalTrimmed(signatory.phone);
  requireField(!phone || (validPhone(phone) && phone.length <= 40), "phone", "Enter a valid phone number.", correlationId);
  const email = (optionalTrimmed(signatory.email) ?? actor.user.email).toLowerCase();
  requireField(validEmail(email) && email.length <= 160, "email", "Enter the email address for the signed copy.", correlationId);

  const plan = trimmed(subscription.plan) as (typeof AGREEMENT_PLANS)[number];
  requireField(AGREEMENT_PLANS.includes(plan), "plan", "Choose a plan.", correlationId);
  const startDate = trimmed(subscription.startDate);
  requireField(validCalendarDate(startDate), "startDate", "Enter the contract start date.", correlationId);
  const termMonths = subscription.termMonths === undefined || subscription.termMonths === null || subscription.termMonths === "" ? undefined : typeof subscription.termMonths === "number" ? subscription.termMonths : Number.parseInt(trimmed(subscription.termMonths), 10);
  requireField(termMonths === undefined || (Number.isSafeInteger(termMonths) && termMonths >= 1 && termMonths <= 60), "termMonths", "Term must be between 1 and 60 months.", correlationId);
  const quote = optionalTrimmed(subscription.quote);
  requireField(!quote || quote.length <= 60, "quote", "Quote number is too long.", correlationId);

  for (const key of ["agreement", "authority", "electronic", "accurate"] as const) {
    requireField(consents[key] === true, `consent_${key}`, "Every declaration must be accepted before signing.", correlationId);
  }

  const mark = readSignature(signature, signatoryName, correlationId);
  const { method, imageDataUrl, printImageDataUrl, typedName } = mark;

  const placeOfSigning = optionalTrimmed(input.placeOfSigning) ?? city;
  requireField(!placeOfSigning || placeOfSigning.length <= 80, "placeOfSigning", "Place of signing is too long.", correlationId);
  const clientDocumentSha256 = optionalTrimmed(input.clientDocumentSha256)?.toLowerCase();
  const documentText = canonicalAgreementText();
  const documentSha256 = await sha256Hex(documentText);
  // A mismatch is flagged for review rather than rejected: the signer still
  // agreed to the text RIVET published, and the flag makes the discrepancy
  // impossible to miss when countersigning.
  const hashMatch = clientDocumentSha256 === documentSha256;

  const now = Date.now();
  const timeZone = actor.organization.timezone || "Asia/Amman";
  const reference = agreementReference(localDate(now, timeZone));
  const publicId = `agreement-${crypto.randomUUID()}`;
  const organizationPublicId = publicOrganizationId(actor.organization);
  await ctx.db.insert("subscriptionAgreements", {
    organizationId: actor.organization._id,
    organizationPublicId,
    publicId,
    reference,
    agreementVersion: SUBSCRIPTION_AGREEMENT_VERSION,
    documentSha256,
    clientDocumentSha256,
    hashMatch,
    status: "signed",
    customer: { legalName, tradeName, registrationNumber, address, city, branches },
    signatory: { name: signatoryName, title: signatoryTitle, idType, idNumber, phone, email },
    subscription: { plan, startDate, termMonths, quote },
    consents: { agreement: true, authority: true, electronic: true, accurate: true },
    signature: { method, imageDataUrl: method === "drawn" ? imageDataUrl : undefined, printImageDataUrl: method === "drawn" ? printImageDataUrl : undefined, typedName: method === "typed" ? typedName : undefined },
    client: { userAgent: trimmed(client.userAgent).slice(0, 300), language: trimmed(client.language).slice(0, 20), viewport: trimmed(client.viewport).slice(0, 40) },
    placeOfSigning,
    signedAt: now,
    signedAtLocal: localDateTime(now, timeZone),
    timezone: timeZone,
    signedByUserId: actor.user._id,
    signedByName: actor.user.fullName,
    idRevealCount: 0,
    createdAt: now,
    updatedAt: now,
  });
  await ctx.db.insert("auditEvents", {
    organizationId: actor.organization._id,
    publicId: `audit-${crypto.randomUUID()}`,
    actorUserId: actor.user._id,
    actorPublicId: publicUserId(actor.user),
    actorName: actor.user.fullName,
    actorRole: actor.role,
    category: "legal",
    action: "legal.agreement.sign",
    entityType: "subscription_agreement",
    entityPublicId: publicId,
    entityLabel: reference,
    summary: `Signed subscription agreement ${reference} (${plan}, from ${startDate})`,
    after: { reference, version: SUBSCRIPTION_AGREEMENT_VERSION, plan, startDate, signatory: signatoryName, hashMatch, method },
    correlationId,
    occurredAt: now,
  });
  await notifyPlatformAdmins(ctx, {
    kind: "subscription_agreement_signed",
    title: `${actor.organization.name} signed its subscription agreement`,
    body: `${signatoryName} · ${plan} · ${reference}${hashMatch ? "" : " · document fingerprint mismatch, review before countersigning"}`,
    href: "/platform/agreements",
    dedupeKey: `agreement-signed:${publicId}`,
  });
  const row = (await ctx.db.query("subscriptionAgreements").withIndex("by_public_id", (q) => q.eq("publicId", publicId)).unique())!;
  const delivery = await sendAgreementCopies(ctx, row, actor.organization.name, actor.organization.defaultLanguage ?? "en");
  await ctx.db.patch(row._id, { emailDeliveryPublicId: delivery.publicId });
  const result = agreementView({ ...row, emailDeliveryPublicId: delivery.publicId }, actor.organization.name);
  await ctx.db.insert("idempotencyRecords", { organizationId: actor.organization._id, operation: "legal.agreement.sign", key: idempotencyKey, requestHash: documentSha256, result, createdAt: now, expiresAt: now + 90 * 86_400_000 });
  return result;
}

async function organizationNames(ctx: ReadContext, rows: AgreementRow[]): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  for (const row of rows) {
    if (names.has(String(row.organizationId))) continue;
    const organization = await ctx.db.get(row.organizationId);
    names.set(String(row.organizationId), organization?.name ?? row.customer.legalName);
  }
  return names;
}

async function agreementByPublicId(ctx: ReadContext, agreementId: string | undefined, correlationId: string | undefined): Promise<AgreementRow> {
  const row = agreementId ? await ctx.db.query("subscriptionAgreements").withIndex("by_public_id", (q) => q.eq("publicId", agreementId)).unique() : null;
  if (!row) domainError("NOT_FOUND", "Subscription agreement not found.", { correlationId });
  return row;
}

async function insertPlatformAudit(ctx: MutationCtx, admin: PlatformAdmin, event: { action: string; entityPublicId: string; entityLabel: string; summary: string; reason?: string; after?: Data }): Promise<void> {
  await ctx.db.insert("platformAuditEvents", {
    publicId: crypto.randomUUID(),
    actorUserId: admin.user._id,
    actorPublicId: publicUserId(admin.user),
    actorName: admin.user.fullName,
    action: event.action,
    entityType: "subscription_agreement",
    entityPublicId: event.entityPublicId,
    entityLabel: event.entityLabel,
    summary: event.summary,
    ...(event.reason ? { reason: event.reason } : {}),
    ...(event.after ? { after: event.after } : {}),
    correlationId: admin.correlationId,
    occurredAt: Date.now(),
  });
}

export async function legalAgreementQuery(ctx: QueryCtx, operation: string, input: Data, request: RequestArgs): Promise<unknown> {
  switch (operation) {
    case "legal.agreement.current": {
      const actor = await requireActor(ctx, request);
      return await signingContext(ctx, actor);
    }
    case "platform.agreements.list": {
      await requirePlatformAdmin(ctx, request.correlationId);
      const rows = (await ctx.db.query("subscriptionAgreements").collect()).sort((left, right) => right.signedAt - left.signedAt);
      const names = await organizationNames(ctx, rows);
      return rows.map((row) => agreementSummary(row, names.get(String(row.organizationId)) ?? row.customer.legalName));
    }
    case "platform.agreement.get": {
      const admin = await requirePlatformAdmin(ctx, request.correlationId);
      const row = await agreementByPublicId(ctx, optionalTrimmed(input.agreementId), admin.correlationId);
      const organization = await ctx.db.get(row.organizationId);
      return agreementView(row, organization?.name ?? row.customer.legalName);
    }
    default:
      domainError("NOT_FOUND", `Unknown legal query ${operation}.`, { correlationId: request.correlationId });
  }
}

export async function legalAgreementMutation(ctx: MutationCtx, operation: string, input: Data, request: RequestArgs): Promise<unknown> {
  switch (operation) {
    case "legal.agreement.sign": {
      const actor = await requireActor(ctx, request);
      return await signAgreement(ctx, actor, input);
    }
    case "platform.agreement.reveal_id": {
      const admin = await requirePlatformAdmin(ctx, request.correlationId);
      requireReason(input.reason, admin.correlationId);
      const row = await agreementByPublicId(ctx, optionalTrimmed(input.agreementId), admin.correlationId);
      await ctx.db.patch(row._id, { idRevealCount: row.idRevealCount + 1, updatedAt: Date.now() });
      await insertPlatformAudit(ctx, admin, { action: "agreement.id_revealed", entityPublicId: row.publicId, entityLabel: row.reference, summary: `Revealed the signatory ID number on ${row.reference}`, reason: input.reason.trim(), after: { idType: row.signatory.idType, revealCount: row.idRevealCount + 1 } });
      return { idNumber: row.signatory.idNumber, idType: row.signatory.idType, revealCount: row.idRevealCount + 1 };
    }
    case "legal.agreement.attach_print_signature": {
      // A drawn signature is stored as a transparent PNG for the screen and an
      // opaque JPEG for the PDF. Anything signed before the PDF existed has
      // only the PNG, and the server has no image decoder, so the browser that
      // can already display it sends the printable twin back once.
      const admin = await requirePlatformAdmin(ctx, request.correlationId);
      const row = await agreementByPublicId(ctx, optionalTrimmed(input.agreementId), admin.correlationId);
      const target = trimmed(input.target) || "signatory";
      requireField(target === "signatory" || target === "countersign", "target", "Choose which signature to complete.", admin.correlationId);
      const printImageDataUrl = optionalTrimmed(input.printImageDataUrl);
      requireField(Boolean(printImageDataUrl) && printImageDataUrl!.startsWith("data:image/jpeg;base64,") && printImageDataUrl!.length <= MAX_SIGNATURE_PRINT_IMAGE_LENGTH && printImageDataUrl!.length > 200, "printImageDataUrl", "The signature image could not be read.", admin.correlationId);
      const current = target === "signatory" ? row.signature : row.countersignSignature;
      const organization = await ctx.db.get(row.organizationId);
      const organizationName = organization?.name ?? row.customer.legalName;
      // Only ever fills a gap: an existing printable image is never replaced.
      if (!current || current.method !== "drawn" || !current.imageDataUrl || current.printImageDataUrl) return agreementView(row, organizationName);
      const next = { ...current, printImageDataUrl };
      await ctx.db.patch(row._id, target === "signatory" ? { signature: next, updatedAt: Date.now() } : { countersignSignature: next, updatedAt: Date.now() });
      await insertPlatformAudit(ctx, admin, { action: "agreement.print_signature_attached", entityPublicId: row.publicId, entityLabel: row.reference, summary: `Completed the printable ${target === "signatory" ? "signature" : "countersignature"} on ${row.reference}`, after: { target } });
      return agreementView((await ctx.db.get(row._id))!, organizationName);
    }
    case "platform.agreement.resend_copies": {
      const admin = await requirePlatformAdmin(ctx, request.correlationId);
      const row = await agreementByPublicId(ctx, optionalTrimmed(input.agreementId), admin.correlationId);
      const idempotencyKey = optionalTrimmed(input.idempotencyKey);
      if (!idempotencyKey || idempotencyKey.length > 160) domainError("VALIDATION_ERROR", "A bounded idempotency key is required.", { correlationId: admin.correlationId });
      const existing = await ctx.db.query("idempotencyRecords").withIndex("by_organization_operation_key", (q) => q.eq("organizationId", row.organizationId).eq("operation", "legal.agreement.resend").eq("key", idempotencyKey!)).unique();
      if (existing) return value(existing.result);
      const audience = trimmed(input.audience) || "rivet";
      requireField(audience === "rivet" || audience === "all", "audience", "Choose who receives the copy.", admin.correlationId);
      const organization = await ctx.db.get(row.organizationId);
      const organizationName = organization?.name ?? row.customer.legalName;
      const result = await resendAgreementCopies(ctx, row, organizationName, organization?.defaultLanguage ?? "en", audience === "all");
      await insertPlatformAudit(ctx, admin, {
        action: "agreement.copies_resent",
        entityPublicId: row.publicId,
        entityLabel: row.reference,
        summary: `Re-sent the copies of ${row.reference} to ${audience === "all" ? "RIVET and the signatory" : "RIVET"}`,
        after: { sequence: result.sequence, recipients: (result.deliveries as Data[]).length, audience },
      });
      const now = Date.now();
      await ctx.db.insert("idempotencyRecords", { organizationId: row.organizationId, operation: "legal.agreement.resend", key: idempotencyKey!, requestHash: `${row.publicId}:${audience}`, result, createdAt: now, expiresAt: now + 30 * 86_400_000 });
      return result;
    }
    case "platform.agreement.countersign": {
      const admin = await requirePlatformAdmin(ctx, request.correlationId);
      const row = await agreementByPublicId(ctx, optionalTrimmed(input.agreementId), admin.correlationId);
      const idempotencyKey = optionalTrimmed(input.idempotencyKey);
      if (!idempotencyKey || idempotencyKey.length > 160) domainError("VALIDATION_ERROR", "A bounded idempotency key is required.", { correlationId: admin.correlationId });
      const organization = await ctx.db.get(row.organizationId);
      const organizationName = organization?.name ?? row.customer.legalName;
      // Countersigning twice is a no-op unless the admin asks to replace the
      // mark, which is how a typed countersignature becomes a drawn one.
      const replacing = row.status === "countersigned";
      if (replacing && input.replace !== true) return agreementView(row, organizationName);
      const title = trimmed(input.title);
      requireField(title.length >= 2 && title.length <= 80, "title", "Enter your role at RIVET.", admin.correlationId);
      const typedName = trimmed(input.typedName);
      requireField(typedName.length >= 2 && typedName.toLowerCase() === admin.user.fullName.trim().toLowerCase(), "typedName", "Type your full name exactly as on your RIVET account to countersign.", admin.correlationId);
      const mark = readSignature(value(input.signature).method ? value(input.signature) : { method: "typed", typedName }, admin.user.fullName, admin.correlationId);
      const now = Date.now();
      await ctx.db.patch(row._id, {
        status: "countersigned",
        countersignedAt: now,
        countersignedByUserId: admin.user._id,
        countersignedByName: admin.user.fullName,
        countersignTitle: title,
        countersignTypedName: typedName,
        countersignSignature: mark,
        countersignCount: (row.countersignCount ?? 0) + 1,
        updatedAt: now,
      });
      await insertPlatformAudit(ctx, admin, {
        action: replacing ? "agreement.countersign_replaced" : "agreement.countersigned",
        entityPublicId: row.publicId,
        entityLabel: row.reference,
        summary: `${replacing ? "Replaced RIVET's signature on" : "Countersigned"} subscription agreement ${row.reference} for ${organizationName}`,
        after: { title, hashMatch: row.hashMatch, method: mark.method, attempt: (row.countersignCount ?? 0) + 1 },
      });
      const updated = (await ctx.db.get(row._id))!;
      const completedAttachment = agreementPdfAttachment(updated, organizationName);
      const rendered = renderAgreementCopyEmail(agreementCopy(updated, organizationName), "signer", { siteUrl: process.env.RIVET_SITE_URL, attachment: { filename: completedAttachment.filename, sizeLabel: attachmentSizeLabel(completedAttachment.contentBase64.length) } });
      await enqueueOperationalEmail(ctx, {
        organizationId: row.organizationId,
        kind: "subscription_agreement_countersigned",
        templateVersion: row.agreementVersion,
        language: organization?.defaultLanguage ?? "en",
        recipientReference: `agreement:${row.publicId}`,
        recipientEmail: row.signatory.email,
        relatedEntityType: "subscription_agreement",
        relatedEntityPublicId: row.publicId,
        dedupeKey: `agreement-countersigned:${row.publicId}:${(row.countersignCount ?? 0) + 1}`,
        attachments: [completedAttachment],
        ...rendered,
      });
      return agreementView(updated, organizationName);
    }
    default:
      domainError("NOT_FOUND", `Unknown legal mutation ${operation}.`, { correlationId: request.correlationId });
  }
}
