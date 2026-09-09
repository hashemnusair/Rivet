import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
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
    return NextResponse.redirect(destination, decision.status);
  }

  return NextResponse.next();
}

function routeByHost(request: NextRequest) {
  return applyHostDecision(request, decideHostRouting(hostOf(request), request.nextUrl.pathname));
}

/**
 * With a Clerk session, the public site's signed-out pages are not shown: a
 * direct arrival on the landing, the gym application and the sign-in doors go
 * to the resolver, which opens the account's own area. Hostname rewrites
 * (the app and console hosts) are decided first and never redirected.
 */
const clerkProxy = clerkMiddleware(async (auth, request) => {
  const decision = decideHostRouting(hostOf(request), request.nextUrl.pathname);
  if (decision.kind !== "next") return applyHostDecision(request, decision);

  const target = signedInRedirectTarget({
    pathname: request.nextUrl.pathname,
    searchParams: request.nextUrl.searchParams,
    referer: request.headers.get("referer"),
    host: hostOf(request),
  });
  if (target) {
    const { userId } = await auth();
    if (userId) {
      const destination = request.nextUrl.clone();
      destination.pathname = target;
      destination.search = "";
      return NextResponse.redirect(destination);
    }
  }

  return NextResponse.next();
});

export default DEMO_AUTH_BYPASS ? routeByHost : clerkProxy;

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/__clerk/:path*",
    "/(api|trpc)(.*)",
  ],
};
