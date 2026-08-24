import { spawnSync } from "node:child_process";

// Publishing a translation catalog is an explicit localization release step,
// not part of every web deployment. This keeps ordinary Vercel releases from
// consuming translation quota or failing when the catalog has not changed.
// Run it only from a trusted environment with the production GT credentials.
const explicitlyEnabled = process.env.RIVET_TRANSLATE_BUILD === "1";
if (!explicitlyEnabled) {
  console.log("Skipping translation publication; set RIVET_TRANSLATE_BUILD=1 for a localization release.");
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
