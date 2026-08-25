const CLERK_ORIGINS = "https://clerk.com https://*.clerk.com https://*.clerk.accounts.dev https://clerk.rivetjo.com https://challenges.cloudflare.com";
const CONVEX_ORIGINS = "https://*.convex.cloud https://*.convex.site wss://*.convex.cloud";

/**
 * Headers shared by every Next route. The CSP deliberately allows only the
 * Clerk/Convex origins the app needs; inline styles and eval remain enabled
 * for Clerk/Next compatibility until nonce-based rendering is introduced.
 */
export function buildSecurityHeaders({ production = false } = {}) {
  const headers = [
    {
      key: "Content-Security-Policy",
      value: [
        "default-src 'self'",
        `script-src 'self' 'unsafe-inline' 'unsafe-eval' ${CLERK_ORIGINS}`,
        "style-src 'self' 'unsafe-inline' https:",
        `img-src 'self' data: blob: ${CLERK_ORIGINS} ${CONVEX_ORIGINS}`,
        `font-src 'self' data: ${CLERK_ORIGINS}`,
        `connect-src 'self' ${CLERK_ORIGINS} ${CONVEX_ORIGINS}`,
        `frame-src 'self' ${CLERK_ORIGINS}`,
        "worker-src 'self' blob:",
        "manifest-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        `form-action 'self' ${CLERK_ORIGINS}`,
        "frame-ancestors 'none'",
      ].join("; "),
    },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
    { key: "X-DNS-Prefetch-Control", value: "off" },
    { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
  ];

  if (production) headers.push({ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" });
  return headers;
}
