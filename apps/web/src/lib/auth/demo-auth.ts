/**
 * Browser tests exercise deterministic seeded personas instead of creating real
 * Clerk users, so they run with `NEXT_PUBLIC_RIVET_DEMO_AUTH=1`. That flag turns
 * off every identity check in the product — the Clerk middleware, the gym
 * workspace guard, the member gate and the platform console guard.
 *
 * It is therefore refused in production builds. Without that second condition a
 * single stray environment variable in a deployment would quietly publish the
 * whole application, including the platform console, with no authentication at
 * all. A deliberate public demo should be built as a preview deployment, not by
 * loosening this.
 */
export function demoAuthBypassAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  const approvedPreview = env.NEXT_PUBLIC_RIVET_DEPLOYMENT_CLASS === "preview" && env.VERCEL_ENV !== "production";
  const productionDeployment = env.NODE_ENV === "production" || env.VERCEL_ENV === "production" || env.NEXT_PUBLIC_RIVET_DEPLOYMENT_CLASS === "production";
  return env.NEXT_PUBLIC_RIVET_DEMO_AUTH === "1" && (!productionDeployment || approvedPreview);
}

// Next.js only inlines literal `process.env.X` member expressions into client
// bundles. Reading these through the function's `env` parameter default left
// every browser bundle with `undefined` values, silently disabling the demo
// personas that the mock-mode Playwright contract depends on. Keep each
// variable a literal member expression here; the browser still fails closed in
// production because NODE_ENV is inlined as "production" there.
export const DEMO_AUTH_BYPASS = demoAuthBypassAllowed({
  NEXT_PUBLIC_RIVET_DEMO_AUTH: process.env.NEXT_PUBLIC_RIVET_DEMO_AUTH,
  NEXT_PUBLIC_RIVET_DEPLOYMENT_CLASS: process.env.NEXT_PUBLIC_RIVET_DEPLOYMENT_CLASS,
  NODE_ENV: process.env.NODE_ENV,
  VERCEL_ENV: process.env.VERCEL_ENV,
} as NodeJS.ProcessEnv);
