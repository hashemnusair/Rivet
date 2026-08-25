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

export const DEMO_AUTH_BYPASS = demoAuthBypassAllowed();
