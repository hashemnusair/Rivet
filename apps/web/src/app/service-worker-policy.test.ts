import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("member service-worker privacy policy", () => {
  const source = readFileSync(resolve(process.cwd(), "public/sw.js"), "utf8");

  it("precaches only the public offline shell and brand assets", () => {
    expect(source).toContain('const PUBLIC_SHELL = ["/offline", "/brand/rivet-glyph.png", "/icon.png"]');
    expect(source).not.toMatch(/PUBLIC_SHELL[^;]*(receipt|entry|finance|my-gyms)/i);
  });

  it("uses the offline page only as a failed-navigation fallback", () => {
    expect(source).toContain('event.request.mode === "navigate"');
    expect(source).toContain('fetch(event.request).catch(() => caches.match("/offline"))');
  });
});
