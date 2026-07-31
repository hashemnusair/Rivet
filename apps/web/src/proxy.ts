import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { DEMO_AUTH_BYPASS } from "@/lib/auth/demo-auth";

/**
 * Browser tests run the seeded preview personas and never sign in to Clerk.
 * Leaving the Clerk middleware active there makes every request attempt a
 * session handshake that cannot succeed — it surfaces as "Refreshing the session
 * token resulted in an infinite redirect loop" and stalls client-side
 * navigation. The bypass has to cover the middleware, not just the UI.
 *
 * `DEMO_AUTH_BYPASS` is false in production builds regardless of the
 * environment variable, so a deployment cannot accidentally ship without auth.
 */
export default DEMO_AUTH_BYPASS ? () => NextResponse.next() : clerkMiddleware();

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/__clerk/:path*",
    "/(api|trpc)(.*)",
  ],
};
