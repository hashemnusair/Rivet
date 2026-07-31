import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

/**
 * Browser tests run the seeded preview personas with `NEXT_PUBLIC_RIVET_DEMO_AUTH=1`
 * and never sign in to Clerk. Leaving the Clerk middleware active there makes
 * every request attempt a session handshake that cannot succeed — it surfaces as
 * "Refreshing the session token resulted in an infinite redirect loop" and stalls
 * client-side navigation. The bypass has to cover the middleware, not just the UI.
 */
const demoAuthBypass = process.env.NEXT_PUBLIC_RIVET_DEMO_AUTH === "1";

export default demoAuthBypass ? () => NextResponse.next() : clerkMiddleware();

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/__clerk/:path*",
    "/(api|trpc)(.*)",
  ],
};
