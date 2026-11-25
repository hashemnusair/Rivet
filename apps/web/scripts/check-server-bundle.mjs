import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Fails the build when the server bundle asks Node for a Next.js
 * `*.shared-runtime` file.
 *
 * Next's server patches `require`: any request ending in `.shared-runtime`
 * is answered with the Pages Router's copy
 * (`next/dist/server/route-modules/pages/vendored/contexts/...`), which loads
 * `next/dist/compiled/next-server/pages.runtime.prod.js`. This app has no
 * Pages Router pages, so Vercel's functions do not contain that file. The
 * swap happens at run time, where file tracing cannot see it, so the build
 * succeeds, `next start` works on a machine with all of `node_modules`, and
 * every page's server render throws "Cannot find module" on Vercel.
 *
 * Next's own files never reach the bundle this way (the build maps their
 * relative `./x.shared-runtime` imports to the App Router's copy). It only
 * happens when application code imports `next/dist/...shared-runtime`
 * directly, as `navigation-hold.tsx` did from 23 to 25 November 2026.
 */
const FORBIDDEN = /require\(\s*["'](next\/dist\/[^"']*\.shared-runtime(?:\.js)?)["']\s*\)/g;

export function forbiddenExternals(source) {
  return [...new Set([...source.matchAll(FORBIDDEN)].map((match) => match[1]))];
}

function javascriptFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return javascriptFiles(path);
    return entry.name.endsWith(".js") ? [path] : [];
  });
}

export function checkServerBundle(distDir) {
  const serverDir = join(distDir, "server");
  try {
    if (!statSync(serverDir).isDirectory()) throw new Error("not a directory");
  } catch {
    return { checked: 0, problems: [`No server bundle at ${serverDir}. Run the build first.`] };
  }
  const files = javascriptFiles(serverDir);
  const problems = files.flatMap((file) =>
    forbiddenExternals(readFileSync(file, "utf8")).map((request) => `${relative(distDir, file)} requires ${request}`),
  );
  return { checked: files.length, problems };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const distDir = resolve(process.argv[2] ?? process.env.NEXT_DIST_DIR ?? ".next");
  const { checked, problems } = checkServerBundle(distDir);
  if (problems.length > 0) {
    console.error("Server bundle check failed. These would make pages answer HTTP 500 on Vercel:");
    for (const problem of problems.slice(0, 20)) console.error(`  ${problem}`);
    if (problems.length > 20) console.error(`  ... and ${problems.length - 20} more`);
    console.error("Application code must not import next/dist/...shared-runtime. Use the public next/* API instead.");
    process.exit(1);
  }
  console.log(`Server bundle check passed (${checked} files).`);
}
