import { v } from "convex/values";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { domainError } from "./security";

const FALLBACK_PEPPER = "rivet-public-request-v1";
const CLEANUP_BATCH_SIZE = 100;
const GUARD_RETENTION_MS = 7 * 86_400_000;

export function isStrongPublicRequestPepper(value: string | undefined): boolean {
  const pepper = value?.trim() ?? "";
  if (pepper.length < 32 || /^(.)(\1)+$/.test(pepper)) return false;
  const characterClasses = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z\d]/].filter((pattern) => pattern.test(pepper)).length;
  return characterClasses >= 3;
}

function publicRequestPepper(): string {
  const configured = process.env.RIVET_PUBLIC_REQUEST_PEPPER?.trim();
  const isProduction = process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";
  const isTest = !isProduction && (process.env.NODE_ENV === "test" || process.env.VITEST === "true");
  // The deterministic fallback is only a local-development escape hatch. A
  // production Convex runtime must provide a real pepper even if someone
  // accidentally carries the fallback flag into its environment.
  const allowFallback = process.env.RIVET_PUBLIC_REQUEST_ALLOW_FALLBACK === "1" && !isProduction && process.env.NODE_ENV === "development";
  if (configured && isStrongPublicRequestPepper(configured)) return configured;
  if (isTest || allowFallback) return configured || FALLBACK_PEPPER;
  domainError("CONFIGURATION_ERROR", "Public request protection is not configured.");
}

/**
 * Public request controls deliberately store only a one-way fingerprint. The
 * caller's IP is not available inside a Convex function, so this is a
 * tenant-independent application/user signal rather than a replacement for
 * an edge/WAF rate limit. Production should set a private pepper through
 * RIVET_PUBLIC_REQUEST_PEPPER; the fallback keeps local tests deterministic.
 */
export async function privacyFingerprint(value: unknown): Promise<string> {
  const pepper = publicRequestPepper();
  const payload = `${pepper}:${JSON.stringify(value)}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Bounded maintenance for public retry/throttle state. Expired idempotency
 * rows are safe to remove after their replay window; old guard rows no longer
 * contribute to a live window. The cron invokes this repeatedly until the
 * backlog is drained without allowing one run to grow unbounded.
 */
export const cleanupExpired = internalMutation({
  args: {},
  returns: { idempotencyDeleted: v.number(), guardsDeleted: v.number() },
  handler: async (ctx) => {
    const now = Date.now();
    const expiredIdempotency = await ctx.db.query("publicRequestIdempotency").withIndex("by_expires_at", (q) => q.lte("expiresAt", now)).take(CLEANUP_BATCH_SIZE);
    const staleGuards = await ctx.db.query("publicRequestGuards").withIndex("by_last_request", (q) => q.lte("lastRequestAt", now - GUARD_RETENTION_MS)).take(CLEANUP_BATCH_SIZE);
    await Promise.all([...expiredIdempotency, ...staleGuards].map((row) => ctx.db.delete(row._id)));
    return { idempotencyDeleted: expiredIdempotency.length, guardsDeleted: staleGuards.length };
  },
});

export async function enforcePublicRateLimit(
  ctx: MutationCtx,
  input: {
    scope: string;
    fingerprint: string;
    maxRequests: number;
    windowMs: number;
    correlationId?: string;
  },
): Promise<void> {
  const now = Date.now();
  const existing = await ctx.db
    .query("publicRequestGuards")
    .withIndex("by_scope_fingerprint", (q) => q.eq("scope", input.scope).eq("fingerprint", input.fingerprint))
    .unique();

  if (existing && now - existing.windowStartedAt < input.windowMs) {
    if (existing.requestCount >= input.maxRequests) {
      // Keep the response deliberately generic. Do not tell an unauthenticated
      // caller which identity/fingerprint triggered the guard or how many
      // requests remain.
      domainError("RATE_LIMITED", "Too many requests. Please wait and try again.", { correlationId: input.correlationId });
    }
    await ctx.db.patch(existing._id, { requestCount: existing.requestCount + 1, lastRequestAt: now });
    return;
  }

  if (existing) {
    await ctx.db.patch(existing._id, { windowStartedAt: now, requestCount: 1, lastRequestAt: now });
    return;
  }

  await ctx.db.insert("publicRequestGuards", {
    scope: input.scope,
    fingerprint: input.fingerprint,
    windowStartedAt: now,
    requestCount: 1,
    lastRequestAt: now,
  });
}
