/**
 * Demo fixtures are for development and staging only.
 *
 * Convex gives a function no reliable "this is Production" signal, so the
 * guard fails closed: seeding the demo gym, and signing in by claiming a
 * `seed:` fixture account through an email match, both need the deployment to
 * opt in with RIVET_ALLOW_DEMO_SEED=1. Production never sets it. The unit-test
 * runner is allowed without the flag. No Convex imports, so tests can share it.
 */
export function demoSeedAllowed(env: Record<string, string | undefined> = process.env): boolean {
  if (env.RIVET_ALLOW_DEMO_SEED === "1") return true;
  const production = env.NODE_ENV === "production" || env.VERCEL_ENV === "production";
  return !production && (env.NODE_ENV === "test" || env.VITEST === "true");
}
