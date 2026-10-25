/**
 * Model-output cache keys (AI-1.9). A repeated live reading of the same note
 * reuses the provider's validated answer instead of paying for another call.
 * RIVET still computes dates, checks evidence against the note and rechecks
 * the reader's access every time it serves an answer.
 *
 * The key names everything the answer could depend on or must not leak
 * across: the gym, the subject and its record version, the reader's access
 * scope, the reader's language, the task's prompt version and the protocol
 * and model. A change to any of them is a new key, so an edited member, a
 * changed role, a corrected note or a new prompt never reuses an old answer.
 * Relative imports only: Convex bundles this module.
 */

/** How long a validated answer may be reused. Short, because it holds words from an unsaved note. */
export const MODEL_CACHE_TTL_MS = 15 * 60_000;

export interface ModelCacheKeyParts {
  organizationId: string;
  task: string;
  promptVersion: string;
  protocol: string;
  model: string;
  subjectType: "member" | "lead";
  subjectId: string;
  /** The subject record's version; any change to the record is a new key. */
  subjectVersion: number;
  /** The reader's role, branch scope and permissions, as one stable string. */
  scope: string;
  locale: "en" | "ar";
  /** The exact input the provider reads, after the same normalisation the reader applies. */
  input: string;
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** The reader's access as a stable string: the same people with the same access share answers, nobody else does. */
export function accessScope(actor: { role: string; branchScope: string; branchIds: readonly string[]; permissions: readonly string[] }): string {
  return [actor.role, actor.branchScope, [...actor.branchIds].sort().join(","), [...actor.permissions].sort().join(",")].join("|");
}

export async function modelCacheKey(parts: ModelCacheKeyParts): Promise<string> {
  // Every part goes into one digest, length-prefixed so no two different sets of parts can run together.
  const fields = [parts.organizationId, parts.task, parts.promptVersion, parts.protocol, parts.model, parts.subjectType, parts.subjectId, String(parts.subjectVersion), parts.scope, parts.locale, parts.input];
  return `${parts.task}:${await sha256Hex(fields.map((field) => `${field.length}:${field}`).join("|"))}`;
}
