import { ConvexError, v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { provisioningIdentifiers } from "./platformProvisioning";

const provisionArgs = {
  applicationId: v.string(),
  correlationId: v.string(),
};

type Data = Record<string, unknown>;
type ClerkOrganization = { id?: unknown; name?: unknown; slug?: unknown; public_metadata?: unknown; publicMetadata?: unknown };
type ClerkInvitation = { id?: unknown; email_address?: unknown; status?: unknown };

async function clerkRequest(secret: string, url: string, method: "GET" | "POST", body?: Data): Promise<{ ok: boolean; status: number; payload: unknown }> {
  const response = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    payload = undefined;
  }
  return { ok: response.ok, status: response.status, payload };
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

function clerkErrorMessage(payload: unknown): string | undefined {
  const details = clerkErrorDetails(payload);
  if (!details.message) return details.code;
  return details.code ? `${details.code}: ${details.message}` : details.message;
}

function clerkOrganizationMatches(payload: unknown, input: { name: string; slug: string; applicationId: string; organizationPublicId: string }): boolean {
  if (!payload || typeof payload !== "object") return false;
  const organization = payload as ClerkOrganization;
  const metadata = organization.public_metadata && typeof organization.public_metadata === "object"
    ? organization.public_metadata as Record<string, unknown>
    : organization.publicMetadata && typeof organization.publicMetadata === "object"
      ? organization.publicMetadata as Record<string, unknown>
      : {};
  return metadata.rivetApplicationId === input.applicationId
    || metadata.rivetOrganizationPublicId === input.organizationPublicId
    || organization.slug === input.slug;
}

async function createOrFindClerkOrganization(secret: string, input: { name: string; slug: string; applicationId: string; organizationPublicId: string }): Promise<string> {
  // Clerk organization slugs are optional and disabled by default on newer
  // instances. RIVET keeps its own stable internal slug, so look up existing
  // organizations by name/metadata and never require Clerk's slug feature.
  for (const query of [input.name, input.slug]) {
    const existing = await clerkRequest(secret, `https://api.clerk.com/v1/organizations?query=${encodeURIComponent(query)}&limit=100`, "GET");
    const match = listPayload(existing.payload).find((item) => clerkOrganizationMatches(item, input));
    const existingId = clerkId(match);
    if (existing.ok && existingId) return existingId;
  }

  const created = await clerkRequest(secret, "https://api.clerk.com/v1/organizations", "POST", {
    name: input.name,
    public_metadata: { rivetApplicationId: input.applicationId, rivetOrganizationPublicId: input.organizationPublicId },
  });
  const createdId = clerkId(created.payload);
  if (!created.ok || !createdId) {
    const detail = clerkErrorMessage(created.payload);
    throw new Error(`Clerk organization request failed (${created.status})${detail ? `: ${detail}` : "."}`);
  }
  return createdId;
}

async function createOrFindClerkInvitation(secret: string, input: { organizationId: string; email: string; applicationId: string; organizationPublicId: string }): Promise<string> {
  const existing = await clerkRequest(secret, `https://api.clerk.com/v1/organizations/${encodeURIComponent(input.organizationId)}/invitations?status=pending&limit=100`, "GET");
  const match = listPayload(existing.payload).find((item) => item && typeof item === "object" && (item as ClerkInvitation).email_address === input.email && (item as ClerkInvitation).status === "pending");
  const existingId = clerkId(match);
  if (existing.ok && existingId) return existingId;

  const siteUrl = process.env.RIVET_SITE_URL?.replace(/\/$/, "");
  const created = await clerkRequest(secret, `https://api.clerk.com/v1/organizations/${encodeURIComponent(input.organizationId)}/invitations`, "POST", {
    email_address: input.email,
    role: "org:admin",
    notify: true,
    ...(siteUrl ? { redirect_url: `${siteUrl}/login` } : {}),
    public_metadata: { rivetApplicationId: input.applicationId, rivetOrganizationPublicId: input.organizationPublicId },
  });
  const createdId = clerkId(created.payload);
  if (!created.ok || !createdId) {
    const detail = clerkErrorMessage(created.payload);
    throw new Error(`Clerk owner invitation request failed (${created.status})${detail ? `: ${detail}` : "."}`);
  }
  return createdId;
}

export const provision = action({
  args: provisionArgs,
  returns: v.any(),
  handler: async (ctx, args): Promise<unknown> => {
    const prepared = await ctx.runMutation(internal.platformProvisioning.begin, args) as { status: "completed" | "in_progress" | "busy"; result?: unknown; applicationId: string; gymName: string; email: string; clerkOrganizationId?: string; clerkInvitationId?: string; correlationId: string };
    if (prepared.status === "completed") return prepared.result;
    if (prepared.status === "busy") throw new ConvexError({ code: "CONFLICT", message: "Gym provisioning is already in progress. Refresh the application before retrying." } as never);

    const secret = process.env.CLERK_SECRET_KEY;
    if (!secret) {
      await ctx.runMutation(internal.platformProvisioning.fail, { applicationId: prepared.applicationId, message: "Clerk organization provisioning is not configured.", correlationId: prepared.correlationId });
      throw new ConvexError({ code: "CONFIGURATION_ERROR", message: "Clerk organization provisioning is not configured." } as never);
    }

    try {
      const identifiers = provisioningIdentifiers(prepared.applicationId, prepared.gymName);
      const clerkOrganizationId = prepared.clerkOrganizationId ?? await createOrFindClerkOrganization(secret, { name: prepared.gymName, slug: identifiers.organizationSlug, applicationId: prepared.applicationId, organizationPublicId: identifiers.organizationPublicId });
      if (!prepared.clerkOrganizationId) await ctx.runMutation(internal.platformProvisioning.rememberClerkOrganization, { applicationId: prepared.applicationId, clerkOrganizationId, correlationId: prepared.correlationId });
      await ctx.runMutation(internal.platformProvisioning.createWorkspace, { applicationId: prepared.applicationId, clerkOrganizationId, correlationId: prepared.correlationId });
      const clerkInvitationId = prepared.clerkInvitationId ?? await createOrFindClerkInvitation(secret, { organizationId: clerkOrganizationId, email: prepared.email, applicationId: prepared.applicationId, organizationPublicId: identifiers.organizationPublicId });
      if (!prepared.clerkInvitationId) await ctx.runMutation(internal.platformProvisioning.rememberClerkInvitation, { applicationId: prepared.applicationId, clerkInvitationId, correlationId: prepared.correlationId });
      return await ctx.runMutation(internal.platformProvisioning.complete, { applicationId: prepared.applicationId, correlationId: prepared.correlationId });
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : "Gym provisioning could not be completed.";
      await ctx.runMutation(internal.platformProvisioning.fail, { applicationId: prepared.applicationId, message, correlationId: prepared.correlationId });
      // The application row remains the durable audit trail, but return the
      // provider detail to the already-authorized platform operator too. This
      // avoids hiding a Clerk configuration/API response behind a generic
      // action error while never exposing it to public routes.
      throw new ConvexError({ code: "PROVISIONING_FAILED", message } as never);
    }
  },
});
