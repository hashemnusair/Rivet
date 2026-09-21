import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every Convex function a browser can call must establish who is calling
 * before it reads or writes tenant data. This guard scans the source of each
 * public query, mutation and action and fails when a new one appears without
 * an authentication, authorization or public-abuse call, unless it is listed
 * here with the reason it is public. A new entry to this list is a review
 * event, not a formality.
 */
const AUTH_CALLS = [
  "requireActor(",
  "requireAuthenticated(",
  "requirePlatformAdmin(",
  "requireMember(",
  "requirePermission(",
  "ctx.auth.getUserIdentity(",
  "enforcePublicRateLimit(",
];

/** Public on purpose. Each delegates to an internal function that enforces its own gate, or exposes nothing tenant-owned. */
const INTENTIONALLY_PUBLIC: Record<string, string> = {
  "domain.ts:query": "dispatcher: queryData calls requireActor/requireMember/requirePlatformAdmin before every operation",
  "domain.ts:mutate": "dispatcher: mutationData calls requireActor/requireMember/requirePlatformAdmin before every operation",
  "health.ts:check": "returns only an ok status and the server time",
  "gymApplications.ts:submit": "public application form; the internal create mutation rate-limits by privacy fingerprint and a honeypot drops bots",
  "gymApplications.ts:review": "runs internal reviewRecord, which requires a platform administrator",
  "invitations.ts:send": "runs internal prepare, which requires an actor with users.manage",
  "jevInference.ts:judge": "runs internal jev.prepare, which requires an actor holding the question's permission before any state is loaded or any model is called",
  "media.ts:finalizeUpload": "runs internal authorizeFinalize, which requires an actor with the media permission",
  "platformProvisioningAction.ts:provision": "runs internal begin, which requires a platform administrator",
  "users.ts:ensureCurrent": "ensureUserRecord reads ctx.auth.getUserIdentity and refuses unauthenticated callers",
};

function publicFunctions(): Array<{ key: string; source: string }> {
  const directory = join(__dirname);
  const files = readdirSync(directory).filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts") && !file.endsWith(".config.ts"));
  const found: Array<{ key: string; source: string }> = [];
  for (const file of files) {
    const text = readFileSync(join(directory, file), "utf8");
    const pattern = /export const (\w+) = (query|mutation|action|httpAction|convexQuery|convexMutation|convexAction)\(/g;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text))) {
      const start = match.index;
      const next = text.slice(match.index + 1).search(/\nexport const \w+ = (?:query|mutation|action|httpAction|convexQuery|convexMutation|convexAction|internalQuery|internalMutation|internalAction)\(/);
      const end = next === -1 ? text.length : match.index + 1 + next;
      found.push({ key: `${file}:${match[1]}`, source: text.slice(start, end) });
    }
  }
  return found;
}

describe("public Convex surface", () => {
  const surface = publicFunctions();

  it("finds the public functions this guard is meant to watch", () => {
    expect(surface.map((entry) => entry.key)).toEqual(expect.arrayContaining(["domain.ts:query", "domain.ts:mutate", "identity.ts:current", "users.ts:claimInvitation"]));
  });

  it.each(surface.map((entry) => [entry.key, entry] as const))("%s establishes the caller before touching data", (key, entry) => {
    const guarded = AUTH_CALLS.some((call) => entry.source.includes(call));
    const reason = INTENTIONALLY_PUBLIC[key];
    if (reason) {
      // Listed functions must still be what the reason describes: a delegating action or a data-free query.
      expect(entry.source.includes("runMutation(internal.") || entry.source.includes("runQuery(internal.") || entry.source.includes("ctx.db") === false || guarded, `${key}: ${reason}`).toBe(true);
      return;
    }
    expect(guarded, `${key} has no requireActor/requireAuthenticated/requirePlatformAdmin/requireMember/getUserIdentity/enforcePublicRateLimit call and is not listed as intentionally public`).toBe(true);
  });

  it("keeps the intentionally public list honest", () => {
    const keys = new Set(surface.map((entry) => entry.key));
    for (const key of Object.keys(INTENTIONALLY_PUBLIC)) expect(keys.has(key), `${key} is listed but no longer exists`).toBe(true);
  });
});
