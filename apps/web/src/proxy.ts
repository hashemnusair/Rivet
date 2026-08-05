import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { DEMO_AUTH_BYPASS } from "@/lib/auth/demo-auth";
import { decideHostRouting } from "@/lib/routing/host-routing";

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
function routeByHost(request: NextRequest) {
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || request.nextUrl.hostname;
  const decision = decideHostRouting(host, request.nextUrl.pathname);

  if (decision.kind === "rewrite") {
    const destination = request.nextUrl.clone();
    destination.pathname = decision.pathname;
    return NextResponse.rewrite(destination);
  }

  if (decision.kind === "redirect") {
    const destination = request.nextUrl.clone();
    destination.protocol = "https:";
    destination.hostname = decision.hostname;
    destination.port = "";
    return NextResponse.redirect(destination, decision.status);
  }

  return NextResponse.next();
}

const clerkProxy = clerkMiddleware((_auth, request) => routeByHost(request));

export default DEMO_AUTH_BYPASS ? routeByHost : clerkProxy;

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/__clerk/:path*",
    "/(api|trpc)(.*)",
  ],
};
