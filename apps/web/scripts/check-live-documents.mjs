import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Asks the live site for its main pages and fails if any of them answers
 * with a server error, or with Next's error document.
 *
 * When a page's server render throws, Next still sends a document (status
 * 500, `<html id="__next_error__">`, empty body) and the browser builds the
 * page from scratch. The page then looks fine to a person and to the browser
 * journeys, which is how every Production page answered 500 from 23 to 25
 * November 2026 without anyone noticing. Only the response itself shows it.
 *
 * Usage: node scripts/check-live-documents.mjs [--attempts 3] [--wait 20] [url ...]
 * Signed out, read-only; sends no cookies and no credentials.
 */
export const LIVE_DOCUMENTS = [
  "https://www.rivetjo.com/",
  "https://www.rivetjo.com/terms",
  "https://www.rivetjo.com/signup",
  "https://www.rivetjo.com/login",
  "https://dashboard.rivetjo.com/login/gym",
  "https://dashboard.rivetjo.com/dashboard",
  "https://app.rivetjo.com/login/member",
  "https://app.rivetjo.com/customer/discover",
  "https://platform.rivetjo.com/login/admin",
];

/** What is wrong with a document response, or null when it is fine. */
export function documentProblem({ status, body }) {
  if (status >= 500) return `answered HTTP ${status}`;
  if (/<html[^>]*\sid=["']__next_error__["']/.test(body)) return `answered HTTP ${status} with Next's error document (the server render failed)`;
  if (status >= 400) return `answered HTTP ${status}`;
  return null;
}

async function checkOnce(url) {
  try {
    const response = await fetch(url, { headers: { accept: "text/html", "user-agent": "rivet-live-document-check" }, redirect: "follow" });
    return documentProblem({ status: response.status, body: await response.text() });
  } catch (error) {
    return `could not be fetched (${error instanceof Error ? error.message : String(error)})`;
  }
}

export async function checkLiveDocuments(urls, { attempts = 1, waitSeconds = 0, log = () => {} } = {}) {
  let failing = new Map(urls.map((url) => [url, "not checked"]));
  for (let attempt = 1; attempt <= attempts && failing.size > 0; attempt += 1) {
    if (attempt > 1) await new Promise((done) => setTimeout(done, waitSeconds * 1000));
    const results = await Promise.all([...failing.keys()].map(async (url) => [url, await checkOnce(url)]));
    failing = new Map(results.filter(([, problem]) => problem !== null));
    log(`Attempt ${attempt}: ${results.length - failing.size} of ${results.length} fine.`);
  }
  return [...failing].map(([url, problem]) => `${url} ${problem}`);
}

function option(args, name, fallback) {
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  const value = Number(args.splice(index, 2)[1]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const attempts = Math.max(1, option(args, "--attempts", 1));
  const waitSeconds = option(args, "--wait", 20);
  const urls = args.length > 0 ? args : LIVE_DOCUMENTS;
  const problems = await checkLiveDocuments(urls, { attempts, waitSeconds, log: console.log });
  if (problems.length > 0) {
    console.error("Live document check failed:");
    for (const problem of problems) console.error(`  ${problem}`);
    process.exit(1);
  }
  console.log(`Live document check passed (${urls.length} pages).`);
}
