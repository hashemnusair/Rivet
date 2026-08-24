const isVercelBuild = process.env.VERCEL === "1" || process.env.VERCEL === "true";
const isPreviewBuild = process.env.VERCEL_ENV === "preview";

// Preview deployments may intentionally use the deterministic mock experience.
// Production must never publish a bundle that cannot reach Convex or Clerk:
// both values are inlined into the browser bundle at build time.
if (!isVercelBuild || isPreviewBuild) process.exit(0);

const required = [
  "NEXT_PUBLIC_CONVEX_URL",
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
];

// TEMPORARILY DISABLED: General Translation remains available in the source
// tree, but GT credentials are intentionally not part of the Vercel release
// gate while the deployment path is stabilized.
const missing = required.filter((name) => !process.env[name]?.trim());

if (process.env.NEXT_PUBLIC_DATA_MODE !== "convex") {
  missing.push("NEXT_PUBLIC_DATA_MODE (must be convex for Production)");
}

if (!missing.length) {
  try {
    const convexUrl = new URL(process.env.NEXT_PUBLIC_CONVEX_URL);
    if (convexUrl.protocol !== "https:") missing.push("NEXT_PUBLIC_CONVEX_URL (must use https)");
  } catch {
    missing.push("NEXT_PUBLIC_CONVEX_URL (must be a valid URL)");
  }
}

if (missing.length) {
  console.error(
    [
      "Production Vercel build stopped: required public runtime configuration is missing or invalid.",
      ...missing.map((name) => `- ${name}`),
      "Set these in Vercel for the Production environment, then redeploy.",
      "Do not put secrets in this file or commit them to the repository.",
    ].join("\n"),
  );
  process.exit(1);
}
