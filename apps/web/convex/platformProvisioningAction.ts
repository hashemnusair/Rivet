import { ConvexError, v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { INVITATION_REDIRECT_PATH, provisioningIdentifiers } from "./platformProvisioning";

const provisionArgs = {
  applicationId: v.string(),
  correlationId: v.string(),
};

type Data = Record<string, unknown>;
type ClerkInvitation = { id?: unknown; email_address?: unknown; status?: unknown; public_metadata?: unknown; publicMetadata?: unknown };
type ClerkInvitationStatus = "pending" | "accepted" | "revoked" | "expired" | "failed";
export type ProvisioningFaultPoint = "before_organization" | "before_invitation";

/**
 * Deterministic provider faults are available only with Clerk development
 * credentials. A production `sk_live_` key can never activate this path even
 * if an environment variable is misconfigured.
 */
export function provisioningFaultMessage(secret: string, configured: string | undefined, point: ProvisioningFaultPoint): string | undefined {
  if (!secret.startsWith("sk_test_") || configured !== point) return undefined;
  return `Injected Clerk ${point === "before_organization" ? "organization" : "invitation"} failure for provisioning verification.`;
}

function injectProvisioningFault(secret: string, point: ProvisioningFaultPoint): void {
  const message = provisioningFaultMessage(secret, process.env.RIVET_PROVISIONING_FAULT_MODE, point);
  if (message) throw new Error(message);
}

async function clerkRequest(secret: string, url: string, method: "GET" | "POST", body?: Data): Promise<{ ok: boolean; status: number; payload: unknown; jsonReadable: boolean }> {
  try {
    const response = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    let payload: unknown;
    let jsonReadable = true;
    try {
      payload = await response.json();
    } catch {
      payload = undefined;
      jsonReadable = false;
    }
    return { ok: response.ok, status: response.status, payload, jsonReadable };
  } catch {
    // Status 0 is deliberately retained as a retryable network failure. The
    // action persists only this classification and a bounded provider code.
    return { ok: false, status: 0, payload: { message: "Network request failed." }, jsonReadable: true };
  }
}

function listPayload(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object" && Array.isArray((payload as { data?: unknown }).data)) return (payload as { data: unknown[] }).data;
  return [];
}

function clerkId(payload: unknown): string | undefined {
  return payload && typeof payload === "object" && typeof (payload as { id?: unknown }).id === "string" ? (payload as { id: string }).id : undefined;
}

type ClerkErrorItem = {
  code?: unknown;
  long_message?: unknown;
  longMessage?: unknown;
  message?: unknown;
  short_message?: unknown;
  shortMessage?: unknown;
};

export class ClerkProviderError extends Error {
  readonly status: number;
  readonly providerCode?: string;
  readonly retryable: boolean;

  constructor(message: string, input: { status: number; providerCode?: string; ambiguous?: boolean }) {
    super(message);
    this.name = "ClerkProviderError";
    this.status = input.status;
    this.providerCode = input.providerCode;
    this.retryable = Boolean(input.ambiguous) || input.status === 0 || input.status === 408 || input.status === 425 || input.status === 429 || input.status >= 500;
  }
}

type RecordValue = Record<string, unknown>;

function objectValue(value: unknown): RecordValue | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : undefined;
}

/**
 * Return every metadata container Clerk may use for the same provider object.
 * Keeping both spellings lets us recover older records while still treating
 * contradictory duplicate metadata as a mismatch.
 */
function clerkMetadataContainers(payload: unknown): RecordValue[] {
  const record = objectValue(payload);
  if (!record) return [];
  return [record.public_metadata, record.publicMetadata]
    .map(objectValue)
    .filter((value): value is RecordValue => Boolean(value));
}

/**
 * Match the server-owned RIVET identity tags without allowing a single
 * matching field to hide a contradictory second field. A legacy provider
 * record may contain either tag, but a record with neither tag is not safe to
 * reuse because names, slugs, and email addresses are not workspace identity.
 */
function clerkRivetMetadataMatches(payload: unknown, input: { applicationId: string; organizationPublicId: string }): boolean {
  const containers = clerkMetadataContainers(payload);
  if (containers.length === 0) return false;

  let hasRivetIdentity = false;
  for (const [key, expected] of [
    ["rivetApplicationId", input.applicationId],
    ["rivetOrganizationPublicId", input.organizationPublicId],
  ] as const) {
    const values = containers
      .map((container) => container[key])
      .filter((value): value is unknown => value !== undefined);
    if (values.length === 0) continue;
    hasRivetIdentity = true;
    if (values.some((value) => typeof value !== "string" || value !== expected)) return false;
  }
  return hasRivetIdentity;
}

/** Keep Clerk's actionable diagnostic, but never persist the whole response. */
function clerkErrorDetails(payload: unknown): { code?: string; message?: string } {
  if (!payload || typeof payload !== "object") return {};
  const record = payload as ClerkErrorItem & { errors?: unknown };
  const candidates: ClerkErrorItem[] = [record];
  if (Array.isArray(record.errors)) {
    candidates.push(...record.errors.filter((item): item is ClerkErrorItem => Boolean(item) && typeof item === "object"));
  }
  const code = candidates.map((item) => item.code).find((value): value is string => typeof value === "string" && value.trim().length > 0);
  const message = candidates
    .flatMap((item) => [item.long_message, item.longMessage, item.message, item.short_message, item.shortMessage])
    .find((value): value is string => typeof value === "string" && value.trim().length > 0);
  return {
    code: code?.trim().slice(0, 120),
    message: message?.replace(/\s+/g, " ").trim().slice(0, 300),
  };
}

export function clerkOrganizationMatches(payload: unknown, input: { name: string; slug: string; applicationId: string; organizationPublicId: string }): boolean {
  // Name and slug are search hints only. A matching slug can belong to an
  // unrelated Clerk organization, so only server-owned metadata can bind it
  // to this RIVET application/workspace.
  return clerkRivetMetadataMatches(payload, input);
}

export function clerkInvitationMatches(payload: unknown, input: { email: string; applicationId: string; organizationPublicId: string }): boolean {
  if (!payload || typeof payload !== "object") return false;
  const invitation = payload as ClerkInvitation;
  const email = typeof invitation.email_address === "string" ? invitation.email_address.trim().toLowerCase() : undefined;
  return invitation.status === "pending"
    && email === input.email.trim().toLowerCase()
    && clerkRivetMetadataMatches(payload, input);
}

function providerError(prefix: string, status: number, payload: unknown, options?: { ambiguous?: boolean }): ClerkProviderError {
  const details = clerkErrorDetails(payload);
  const detail = details.message ?? details.code;
  return new ClerkProviderError(`${prefix} (${status || "network error"})${detail ? `: ${detail}` : "."}`, { status, providerCode: details.code ?? (options?.ambiguous ? "ambiguous_response" : undefined), ambiguous: options?.ambiguous });
}

async function findExistingClerkOrganization(secret: string, input: { name: string; slug: string; applicationId: string; organizationPublicId: string }): Promise<string | undefined> {
  for (const query of [input.name, input.slug]) {
    const existing = await clerkRequest(secret, `https://api.clerk.com/v1/organizations?query=${encodeURIComponent(query)}&limit=100`, "GET");
    if (!existing.ok) throw providerError("Clerk organization lookup failed", existing.status, existing.payload);
    if (!existing.jsonReadable) throw providerError("Clerk organization lookup returned unreadable data", existing.status, existing.payload, { ambiguous: true });
    const match = listPayload(existing.payload).find((item) => clerkOrganizationMatches(item, input));
    const existingId = clerkId(match);
    if (existingId) return existingId;
  }
  return undefined;
}

async function createOrFindClerkOrganization(secret: string, input: { name: string; slug: string; applicationId: string; organizationPublicId: string }): Promise<string> {
  // Clerk organization slugs are optional and disabled by default on newer
  // instances. RIVET keeps its own stable internal slug, so look up existing
  // organizations by name/metadata and never require Clerk's slug feature.
  // Clerk does not expose a provider idempotency key here; if a POST response
  // is lost, the next attempt reconciles the metadata-tagged organization.
  const existingId = await findExistingClerkOrganization(secret, input);
  if (existingId) return existingId;

  const created = await clerkRequest(secret, "https://api.clerk.com/v1/organizations", "POST", {
    name: input.name,
    public_metadata: { rivetApplicationId: input.applicationId, rivetOrganizationPublicId: input.organizationPublicId },
  });
  const createdId = clerkId(created.payload);
  if (!created.ok) throw providerError("Clerk organization request failed", created.status, created.payload);
  if (createdId) return createdId;
  // A successful response without an id may mean the provider committed the
  // organization but the response body was truncated. Reconcile by metadata
  // before classifying the attempt as retryable/action-required.
  const reconciledId = await findExistingClerkOrganization(secret, input);
  if (reconciledId) return reconciledId;
  throw providerError("Clerk organization request returned no identifier", created.status, created.payload, { ambiguous: true });
}

async function findPendingClerkInvitation(secret: string, input: { organizationId: string; email: string; applicationId: string; organizationPublicId: string }): Promise<string | undefined> {
  const existing = await clerkRequest(secret, `https://api.clerk.com/v1/organizations/${encodeURIComponent(input.organizationId)}/invitations?status=pending&limit=100`, "GET");
  if (!existing.ok) throw providerError("Clerk invitation lookup failed", existing.status, existing.payload);
  if (!existing.jsonReadable) throw providerError("Clerk invitation lookup returned unreadable data", existing.status, existing.payload, { ambiguous: true });
  const match = listPayload(existing.payload).find((item) => clerkInvitationMatches(item, input));
  return clerkId(match);
}

async function createOrFindClerkInvitation(secret: string, input: { organizationId: string; email: string; applicationId: string; organizationPublicId: string }): Promise<string> {
  // Invitation POSTs have the same ambiguous-response limitation. A retry
  // reconciles the provider's pending email list; an already accepted/expired
  // invitation is intentionally not reused and receives a replacement.
  const existingId = await findPendingClerkInvitation(secret, input);
  if (existingId) return existingId;

  const siteUrl = process.env.RIVET_SITE_URL?.replace(/\/$/, "");
  const created = await clerkRequest(secret, `https://api.clerk.com/v1/organizations/${encodeURIComponent(input.organizationId)}/invitations`, "POST", {
    email_address: input.email,
    role: "org:admin",
    notify: true,
    ...(siteUrl ? { redirect_url: `${siteUrl}${INVITATION_REDIRECT_PATH}` } : {}),
    public_metadata: { rivetApplicationId: input.applicationId, rivetOrganizationPublicId: input.organizationPublicId },
  });
  const createdId = clerkId(created.payload);
  if (!created.ok) throw providerError("Clerk owner invitation request failed", created.status, created.payload);
  if (createdId) return createdId;
  const reconciledId = await findPendingClerkInvitation(secret, input);
  if (reconciledId) return reconciledId;
  throw providerError("Clerk owner invitation request returned no identifier", created.status, created.payload, { ambiguous: true });
}

export const provision = action({
  args: provisionArgs,
  returns: v.any(),
  handler: async (ctx, args): Promise<unknown> => {
    const prepared = await ctx.runMutation(internal.platformProvisioning.begin, args) as { status: "completed" | "in_progress" | "busy" | "permanent"; result?: unknown; applicationId: string; gymName: string; email: string; clerkOrganizationId?: string; clerkInvitationId?: string; clerkInvitationStatus?: ClerkInvitationStatus; ownerInvitationStatus?: "pending" | "accepted" | "revoked"; correlationId: string; leaseId: string; message?: string };
    if (prepared.status === "completed") return prepared.result;
    if (prepared.status === "busy") throw new ConvexError({ code: "CONFLICT", message: "Gym provisioning is already in progress. Refresh the application before retrying." } as never);
    if (prepared.status === "permanent") throw new ConvexError({ code: "PROVISIONING_PERMANENT", message: prepared.message ?? "Provisioning requires manual correction before it can be retried." } as never);

    const secret = process.env.CLERK_SECRET_KEY;
    const needsClerkOrganization = !prepared.clerkOrganizationId;
    // Even a previously pending id must be reconciled against Clerk's
    // current pending list. Expired/revoked/failed ids are never reused.
    const needsClerkInvitation = prepared.ownerInvitationStatus !== "accepted";
    if (!secret && (needsClerkOrganization || needsClerkInvitation)) {
      await ctx.runMutation(internal.platformProvisioning.fail, { applicationId: prepared.applicationId, message: "Clerk organization provisioning is not configured.", correlationId: prepared.correlationId, leaseId: prepared.leaseId, outcome: "retryable" });
      throw new ConvexError({ code: "CONFIGURATION_ERROR", message: "Clerk organization provisioning is not configured." } as never);
    }

    try {
      const identifiers = provisioningIdentifiers(prepared.applicationId, prepared.gymName);
      if (!prepared.clerkOrganizationId) injectProvisioningFault(secret!, "before_organization");
      const clerkOrganizationId = prepared.clerkOrganizationId ?? await createOrFindClerkOrganization(secret!, { name: prepared.gymName, slug: identifiers.organizationSlug, applicationId: prepared.applicationId, organizationPublicId: identifiers.organizationPublicId });
      if (!prepared.clerkOrganizationId) await ctx.runMutation(internal.platformProvisioning.rememberClerkOrganization, { applicationId: prepared.applicationId, clerkOrganizationId, correlationId: prepared.correlationId, leaseId: prepared.leaseId });
      await ctx.runMutation(internal.platformProvisioning.createWorkspace, { applicationId: prepared.applicationId, clerkOrganizationId, correlationId: prepared.correlationId, leaseId: prepared.leaseId });
      const ownerState = await ctx.runQuery(internal.platformProvisioning.ownerInvitationState, { applicationId: prepared.applicationId, correlationId: prepared.correlationId, leaseId: prepared.leaseId }) as { invitationStatus?: "pending" | "accepted" | "revoked"; clerkInvitationId?: string };
      let clerkInvitationId = ownerState.invitationStatus === "accepted" ? ownerState.clerkInvitationId : undefined;
      if (ownerState.invitationStatus !== "accepted") {
        injectProvisioningFault(secret!, "before_invitation");
        clerkInvitationId = await createOrFindClerkInvitation(secret!, { organizationId: clerkOrganizationId, email: prepared.email, applicationId: prepared.applicationId, organizationPublicId: identifiers.organizationPublicId });
        const recorded = await ctx.runMutation(internal.platformProvisioning.rememberClerkInvitation, { applicationId: prepared.applicationId, clerkInvitationId, correlationId: prepared.correlationId, leaseId: prepared.leaseId }) as { status?: "pending" | "accepted"; clerkInvitationId?: string };
        if (recorded.status === "accepted") clerkInvitationId = recorded.clerkInvitationId;
      }
      // Finalize the application and persist the invitation in one durable
      // mutation. The previous two-mutation sequence could create the Clerk
      // organization, workspace, and invitation successfully, then throw
      // while recording the invitation. The catch block would consequently
      // mark a fully usable workspace as failed and emit a false failure
      // notification. `complete` is idempotent and owns this final write now.
      return await ctx.runMutation(internal.platformProvisioning.complete, { applicationId: prepared.applicationId, ...(clerkInvitationId ? { clerkInvitationId } : {}), correlationId: prepared.correlationId, leaseId: prepared.leaseId });
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : "Gym provisioning could not be completed.";
      const data = error && typeof error === "object" && "data" in error && typeof (error as { data?: unknown }).data === "object" ? (error as { data: { code?: unknown } }).data : undefined;
      const providerFailure = error instanceof ClerkProviderError ? error : undefined;
      const stale = data?.code === "CONFLICT" && /stale/i.test(message);
      const permanent = !stale && (providerFailure ? !providerFailure.retryable : data?.code === "CONFLICT" || data?.code === "FORBIDDEN" || data?.code === "VALIDATION_ERROR");
      await ctx.runMutation(internal.platformProvisioning.fail, { applicationId: prepared.applicationId, message, correlationId: prepared.correlationId, leaseId: prepared.leaseId, outcome: permanent ? "permanent" : "retryable", ...(providerFailure?.status !== undefined ? { providerStatus: providerFailure.status } : {}), ...(providerFailure?.providerCode ? { providerCode: providerFailure.providerCode } : {}) });
      // The application row remains the durable audit trail, but return the
      // provider detail to the already-authorized platform operator too. This
      // avoids hiding a Clerk configuration/API response behind a generic
      // action error while never exposing it to public routes.
      throw new ConvexError({ code: stale ? "PROVISIONING_STALE" : permanent ? "PROVISIONING_PERMANENT" : "PROVISIONING_FAILED", message } as never);
    }
  },
});
