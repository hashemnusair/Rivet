import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextRequest, NextResponse, type NextFetchEvent } from "next/server";
import { DEMO_AUTH_BYPASS } from "@/lib/auth/demo-auth";
import { decideHostRouting, type HostRoutingDecision } from "@/lib/routing/host-routing";
import { signedInRedirectTarget } from "@/lib/routing/signed-in-routing";

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
function hostOf(request: NextRequest) {
  return request.headers.get("x-forwarded-host") || request.headers.get("host") || request.nextUrl.hostname;
}

function applyHostDecision(request: NextRequest, decision: HostRoutingDecision) {
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
    if (decision.pathname) destination.pathname = decision.pathname;
    return NextResponse.redirect(destination, decision.status);
  }

  return NextResponse.next();
}

function routeByHost(request: NextRequest) {
  return applyHostDecision(request, decideHostRouting(hostOf(request), request.nextUrl.pathname));
}

/** Signed-in doors and the landing hand off to the shared resolver, which
 * opens the account's own area. App roots initialize Clerk before their
 * internal rewrites. */
const clerkProxy = clerkMiddleware(async (auth, request) => {
  const decision = decideHostRouting(hostOf(request), request.nextUrl.pathname);
  if (decision.kind !== "next") return applyHostDecision(request, decision);

  const target = signedInRedirectTarget({ pathname: request.nextUrl.pathname });
  if (target) {
    const { userId } = await auth();
    if (userId) {
      const destination = request.nextUrl.clone();
      destination.pathname = target;
      // Keep invitation/continuation parameters through the identity resolver.
      return NextResponse.redirect(destination);
    }
  }

  return NextResponse.next();
});

export default function proxy(request: NextRequest, event: NextFetchEvent) {
  // Canonical redirects precede Clerk so an old host never starts a handshake.
  const decision = decideHostRouting(hostOf(request), request.nextUrl.pathname);
  if (decision.kind === "redirect") return applyHostDecision(request, decision);
  return DEMO_AUTH_BYPASS ? routeByHost(request) : clerkProxy(request, event);
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/__clerk/:path*",
    "/(api|trpc)(.*)",
  ],
};
