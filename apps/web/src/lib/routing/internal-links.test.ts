import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every internal link must open a real page. This reads the source for path
 * strings ("/members/new", `/members/${id}`) and checks each one against the
 * route tree under src/app, so a link to a page that was moved or removed
 * fails here instead of in front of a gym.
 *
 * Two kinds of string are checked:
 *  - any path whose first part is the name of a real route tree, wherever it
 *    is written (a link, a notification, an email, a search result), and
 *  - any path handed straight to a link, a router call or a redirect, even
 *    when its first part is not a route tree at all (a made-up page).
 */

const WEB_ROOT = process.cwd();
const APP_ROOT = join(WEB_ROOT, "src/app");
const SCANNED = [join(WEB_ROOT, "src"), join(WEB_ROOT, "convex")];

/** Paths a link may use that are not pages: redirects made by the proxy, and files in /public. */
const NON_PAGE_TARGETS = new Set(["/arabic-room", "/offline", "/manifest.webmanifest"]);
/** First parts that are never pages: server endpoints, Clerk's proxy, build output. */
const NON_PAGE_ROOTS = new Set(["api", "_next", "__clerk"]);

type Route = { path: string; parts: string[] };

function routes(directory: string, parts: string[] = []): Route[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) {
      // A route group "(app)" adds nothing to the address; "_private" folders are not routes.
      if (entry.name.startsWith("_")) return [];
      const next = /^\(.*\)$/.test(entry.name) ? parts : [...parts, entry.name];
      return routes(join(directory, entry.name), next);
    }
    return /^(page|route)\.(ts|tsx)$/.test(entry.name) ? [{ path: `/${parts.join("/")}`, parts }] : [];
  });
}

const ROUTES = routes(APP_ROOT);
const ROUTE_ROOTS = new Set(ROUTES.map((route) => route.parts[0]).filter((part): part is string => Boolean(part)));

/** A written part is dynamic when it holds a `${value}`; such a part can stand for any one segment. */
const DYNAMIC = "\u0000";

function matches(target: string[], route: string[]): boolean {
  if (target.length !== route.length) return false;
  return route.every((part, index) => {
    const written = target[index]!;
    if (/^\[.+\]$/.test(part)) return written.length > 0;
    // A fixed route part must be written out; `${x}` may only fill a [param].
    return written === part;
  });
}

/**
 * A link must name a page exactly. A path written anywhere else may also be
 * the start of one ("/crm" for every CRM page), which is how the sidebar,
 * the host rules and the crawler rules name a group of pages.
 */
function resolves(pathname: string, exact = true): boolean {
  const clean = pathname.replace(/\/+$/, "") || "/";
  if (NON_PAGE_TARGETS.has(clean)) return true;
  if (clean === "/") return true;
  const parts = clean.slice(1).split("/");
  if (NON_PAGE_ROOTS.has(parts[0]!)) return true;
  if (existsSync(join(WEB_ROOT, "public", ...parts)) && !parts.includes(DYNAMIC)) return true;
  return ROUTES.some((route) => matches(parts, exact ? route.parts : route.parts.slice(0, parts.length)));
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === "_generated" || entry.name === "__snapshots__" ? [] : sourceFiles(path);
    return /\.(ts|tsx|mjs)$/.test(entry.name) && !/\.(test|bench\.test|spec)\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

type Found = { literal: string; pathname: string; linkPosition: boolean };

/** Something that takes a path and navigates to it. */
const LINK_POSITION = /(?:\bhref\s*[=:]\s*\{?\s*|\b(?:push|replace|prefetch|redirect|permanentRedirect|loginHref|openSignedInPage|canonicalHref)\(\s*(?:router\s*,\s*)?|\b(?:pathname|actionHref|backHref|destination\.pathname)\s*[=:]\s*)$/;

/**
 * Path strings in a source file. A template's `${...}` becomes one dynamic
 * part; a string that continues after its closing quote (`"/members/" + id`)
 * is treated the same way.
 */
export function pathLiterals(source: string): Found[] {
  const found: Found[] = [];
  const opener = /(["'`])\//g;
  for (let match = opener.exec(source); match; match = opener.exec(source)) {
    const quote = match[1]!;
    const start = match.index + 1;
    let index = start;
    let text = "";
    let closed = false;
    while (index < source.length) {
      const char = source[index]!;
      if (char === "\\") { index += 2; continue; }
      if (char === quote) { closed = true; break; }
      if (char === "\n" && quote !== "`") break;
      if (quote === "`" && char === "$" && source[index + 1] === "{") {
        let depth = 1;
        index += 2;
        while (index < source.length && depth > 0) {
          if (source[index] === "{") depth += 1;
          else if (source[index] === "}") depth -= 1;
          index += 1;
        }
        text += DYNAMIC;
        continue;
      }
      text += char;
      index += 1;
    }
    if (!closed) continue;
    opener.lastIndex = index + 1;
    // Only an address: no spaces, and nothing that reads as prose or a pattern.
    const [pathname = ""] = text.split(/[?#]/);
    if (!/^\/[A-Za-z0-9\-._~/\u0000[\]]*$/.test(pathname) || pathname.startsWith("//")) continue;
    // "/members/" + id, or `/members/${id}` written as a prefix.
    const continues = /^\s*\+/.test(source.slice(index + 1, index + 6));
    const full = continues && pathname.endsWith("/") ? `${pathname}${DYNAMIC}` : pathname;
    // A dynamic tail glued to a word ("/maintenance${query}") is a query string, not a segment.
    const normalised = full.split("/").map((part) => (part.includes(DYNAMIC) ? (part.replaceAll(DYNAMIC, "") === "" ? DYNAMIC : part.replaceAll(DYNAMIC, "")) : part)).join("/");
    const before = source.slice(Math.max(0, match.index - 80), match.index);
    found.push({ literal: text.replaceAll(DYNAMIC, "${…}"), pathname: normalised, linkPosition: LINK_POSITION.test(before) });
  }
  return found;
}

function brokenLinks(source: string): string[] {
  return pathLiterals(source)
    .filter(({ pathname, linkPosition }) => {
      const root = pathname.slice(1).split("/")[0] ?? "";
      if (!linkPosition && !ROUTE_ROOTS.has(root)) return false;
      return !resolves(pathname, linkPosition);
    })
    .map(({ literal }) => literal);
}

describe("internal links", () => {
  it("finds the route tree", () => {
    expect(ROUTES.length).toBeGreaterThan(50);
    expect(resolves("/members")).toBe(true);
    expect(resolves(`/members/${DYNAMIC}`)).toBe(true);
    expect(resolves("/billing")).toBe(true);
    expect(resolves("/members/nope/deeper")).toBe(false);
  });

  it("recognises a link to a page that does not exist", () => {
    expect(brokenLinks('<Link href="/memberz">x</Link>')).toEqual(["/memberz"]);
    expect(brokenLinks("router.push(`/members/${id}/edit`)")).toEqual(["/members/${…}/edit"]);
    expect(brokenLinks('const target = "/platform/invoices";')).toEqual(["/platform/invoices"]);
    expect(brokenLinks('<Link href="/crm">x</Link>')).toEqual(["/crm"]);
    expect(brokenLinks('pathname.startsWith("/crm")')).toEqual([]);
    expect(brokenLinks("router.push(`/customer/gyms/${id}${query}`)")).toEqual([]);
    expect(brokenLinks('<Link href="/members/new?from=desk">x</Link>')).toEqual([]);
    expect(brokenLinks("router.push(`/members/${id}?action=renew`)")).toEqual([]);
    expect(brokenLinks('fetch("/v1/chat/completions")')).toEqual([]);
  });

  it("all open a real page", () => {
    const offenders = SCANNED.flatMap(sourceFiles).flatMap((file) =>
      brokenLinks(readFileSync(file, "utf8")).map((literal) => `${relative(WEB_ROOT, file)}: ${literal}`),
    );
    expect(offenders).toEqual([]);
  });
});
