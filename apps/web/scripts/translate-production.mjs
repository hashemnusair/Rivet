import { spawnSync } from "node:child_process";

// TEMPORARILY DISABLED: keep this release helper for a later translation
// rollout, but never contact GT from the normal Vercel build for now.
const TRANSLATION_RELEASE_PAUSED = true;
if (TRANSLATION_RELEASE_PAUSED) {
  console.log("General Translation release is temporarily paused; skipping GT publish.");
  process.exit(0);
}

const isVercelProduction =
  (process.env.VERCEL === "1" || process.env.VERCEL === "true") &&
  process.env.VERCEL_ENV === "production";

// Translation generation is a production release step. Preview deployments
// intentionally use the deterministic mock experience and local builds should
// remain usable without production GT credentials. Developers can opt in to a
// local production-style translation run with RIVET_TRANSLATE_BUILD=1.
const explicitlyEnabled = process.env.RIVET_TRANSLATE_BUILD === "1";
if (!isVercelProduction && !explicitlyEnabled) {
  console.log("Skipping production translation generation outside a production release.");
  process.exit(0);
}

const result = spawnSync("gtx-cli", ["translate", "--publish"], {
  cwd: process.cwd(),
  stdio: "inherit",
  env: process.env,
});

if (result.error) {
  console.error("Production translation generation could not start. Install the locked gtx-cli dependency.");
  process.exit(1);
}

if (typeof result.status === "number") process.exit(result.status);
process.exit(1);
