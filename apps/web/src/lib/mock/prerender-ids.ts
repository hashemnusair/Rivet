import { buildSeed } from "./seed";

/**
 * Build-time only. Enumerates the record ids that exist in the canonical demo
 * tenant so `output: "export"` can prerender the dynamic detail routes.
 *
 * Why this is sound in mock mode: the mock database is rebuilt from this same
 * deterministic seed on every cold page load, so the seeded ids are exactly the
 * set that can resolve on a fresh request. A record created during a session
 * lives only in that tab's memory and would not survive a reload regardless of
 * how the route was rendered.
 *
 * This is the ONE place allowed to reach into seed data outside the mock client.
 * It is imported by `generateStaticParams()` in server page shells, never by a
 * component, and never runs in the browser.
 *
 * BACKEND AGENT: delete this file when `HttpGymOSApi` lands. At that point the
 * detail routes should be server-rendered (or ISR) against real data instead of
 * prerendered from a fixture, and their `generateStaticParams()` shells can go.
 */

let cached: ReturnType<typeof buildSeed> | null = null;

function db() {
  cached ??= buildSeed();
  return cached;
}

export function memberIds(): string[] {
  return db().members.map((m) => m.id);
}

export function leadIds(): string[] {
  return db().leads.map((l) => l.id);
}

export function receiptIds(): string[] {
  return db().receipts.map((r) => r.id);
}

export function automationRuleIds(): string[] {
  return db().rules.map((r) => r.id);
}
