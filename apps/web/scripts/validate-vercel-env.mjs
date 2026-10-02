import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

function hasValue(env, name) {
  return typeof env[name] === "string" && env[name].trim().length > 0;
}

function isStrongPublicRequestPepper(value) {
  const pepper = value?.trim() ?? "";
  if (pepper.length < 32 || /^(.)(\1)+$/.test(pepper)) return false;
  const characterClasses = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z\d]/].filter((pattern) => pattern.test(pepper)).length;
  return characterClasses >= 3;
}

function isHttpsUrl(value) {
  if (!value?.trim()) return false;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" && Boolean(url.hostname) && url.hostname !== "localhost";
  } catch {
    return false;
  }
}

function validateUrl(env, name, missing) {
  if (!hasValue(env, name)) {
    missing.push(name);
    return;
  }
  if (!isHttpsUrl(env[name])) missing.push(`${name} (must be a valid https URL)`);
}

/** Validate Convex-only names and shapes without returning any secret value. */
export function validateConvexRuntimeEnv(env = process.env) {
  const missing = [];
  const required = ["CLERK_FRONTEND_API_URL", "ENTRY_PASS_SIGNING_SECRET", "RIVET_SITE_URL", "RIVET_PUBLIC_REQUEST_PEPPER"];
  for (const name of required) if (!hasValue(env, name)) missing.push(name);
  if (hasValue(env, "CLERK_FRONTEND_API_URL") && !isHttpsUrl(env.CLERK_FRONTEND_API_URL)) missing.push("CLERK_FRONTEND_API_URL (must be a valid https URL)");
  if (hasValue(env, "RIVET_SITE_URL") && !isHttpsUrl(env.RIVET_SITE_URL)) missing.push("RIVET_SITE_URL (must be a valid https URL)");
  if (hasValue(env, "ENTRY_PASS_SIGNING_SECRET") && env.ENTRY_PASS_SIGNING_SECRET.trim().length < 32) missing.push("ENTRY_PASS_SIGNING_SECRET (must be at least 32 characters)");
  if (hasValue(env, "RIVET_PUBLIC_REQUEST_PEPPER") && !isStrongPublicRequestPepper(env.RIVET_PUBLIC_REQUEST_PEPPER)) missing.push("RIVET_PUBLIC_REQUEST_PEPPER (must be at least 32 characters with 3 character classes)");
  return { missing };
}

/** Validate public/server configuration needed for a Vercel Production build. */
export function validateProductionEnv(env = process.env) {
  const isVercelBuild = env.VERCEL === "1" || env.VERCEL === "true";
  const isPreviewBuild = env.VERCEL_ENV === "preview";
  // Preview deployments may intentionally use the deterministic mock
  // experience; only Vercel Production is fail-closed here.
  if (!isVercelBuild || isPreviewBuild) return { applicable: false, missing: [] };

  const missing = [];
  const required = [
    "NEXT_PUBLIC_CONVEX_URL",
    "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
    "CLERK_SECRET_KEY",
    "NEXT_PUBLIC_SITE_URL",
    "RIVET_PUBLIC_REQUEST_PEPPER",
  ];
  for (const name of required) if (!hasValue(env, name)) missing.push(name);
  if (env.NEXT_PUBLIC_DATA_MODE !== "convex") missing.push("NEXT_PUBLIC_DATA_MODE (must be convex for Production)");
  if (env.NEXT_PUBLIC_RIVET_DEPLOYMENT_CLASS === "preview") missing.push("NEXT_PUBLIC_RIVET_DEPLOYMENT_CLASS (must not be preview for Production)");
  if (env.NEXT_PUBLIC_RIVET_DEMO_AUTH === "1") missing.push("NEXT_PUBLIC_RIVET_DEMO_AUTH (must not be enabled for Production)");
  if (env.RIVET_PUBLIC_REQUEST_ALLOW_FALLBACK === "1") missing.push("RIVET_PUBLIC_REQUEST_ALLOW_FALLBACK (must not be enabled for Production)");

  validateUrl(env, "NEXT_PUBLIC_CONVEX_URL", missing);
  validateUrl(env, "NEXT_PUBLIC_SITE_URL", missing);

  if (hasValue(env, "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY") && !/^pk_live_[A-Za-z0-9_-]+$/.test(env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY.trim())) missing.push("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY (must be a Production Clerk key)");
  if (hasValue(env, "CLERK_SECRET_KEY") && !/^sk_live_[A-Za-z0-9_-]+$/.test(env.CLERK_SECRET_KEY.trim())) missing.push("CLERK_SECRET_KEY (must be a Production Clerk key)");

  // These are usually Convex-only values. If a deployment-health process also
  // supplies them, validate their class and shape without exposing contents.
  if (hasValue(env, "CLERK_FRONTEND_API_URL") && !isHttpsUrl(env.CLERK_FRONTEND_API_URL)) missing.push("CLERK_FRONTEND_API_URL (must be a valid https URL)");
  if (hasValue(env, "RIVET_SITE_URL") && !isHttpsUrl(env.RIVET_SITE_URL)) missing.push("RIVET_SITE_URL (must be a valid https URL)");
  if (hasValue(env, "ENTRY_PASS_SIGNING_SECRET") && env.ENTRY_PASS_SIGNING_SECRET.trim().length < 32) missing.push("ENTRY_PASS_SIGNING_SECRET (must be at least 32 characters)");
  if (hasValue(env, "RIVET_PUBLIC_REQUEST_PEPPER") && !isStrongPublicRequestPepper(env.RIVET_PUBLIC_REQUEST_PEPPER)) missing.push("RIVET_PUBLIC_REQUEST_PEPPER (must be at least 32 characters with 3 character classes)");
  if (env.RIVET_VALIDATE_CONVEX_CONFIG === "1") missing.push(...validateConvexRuntimeEnv(env).missing);

  return { applicable: true, missing: [...new Set(missing)] };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const result = validateProductionEnv(process.env);
  if (!result.applicable || result.missing.length === 0) process.exit(0);

  console.error(
    [
      "Production Vercel build stopped: required runtime configuration is missing or invalid.",
      ...result.missing.map((name) => `- ${name}`),
      "Set these names in the correct Vercel/Convex environment, then redeploy.",
      "Secret values are intentionally not printed and must never be committed.",
    ].join("\n"),
  );
  process.exit(1);
}
