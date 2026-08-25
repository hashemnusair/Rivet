import { describe, expect, it } from "vitest";
import { buildSecurityHeaders } from "./security-headers.mjs";

function headerValue(headers: Array<{ key: string; value: string }>, key: string) {
  return headers.find((header) => header.key === key)?.value;
}

describe("security headers", () => {
  it("protects routes while allowing the Clerk and Convex origins", () => {
    const headers = buildSecurityHeaders();
    const csp = headerValue(headers, "Content-Security-Policy");

    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("https://*.clerk.com");
    expect(csp).toContain("https://*.convex.cloud");
    expect(headerValue(headers, "X-Content-Type-Options")).toBe("nosniff");
    expect(headerValue(headers, "X-Frame-Options")).toBe("DENY");
    expect(headerValue(headers, "Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(headerValue(headers, "Permissions-Policy")).toContain("camera=()");
    expect(headerValue(headers, "Strict-Transport-Security")).toBeUndefined();
  });

  it("adds HSTS only to production responses", () => {
    const headers = buildSecurityHeaders({ production: true });
    expect(headerValue(headers, "Strict-Transport-Security")).toBe("max-age=31536000; includeSubDomains");
  });
});
