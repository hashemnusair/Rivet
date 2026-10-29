import type { RivetIdentity } from "@/lib/auth/rivet-identity";
import type { ExperienceStatus } from "@/lib/providers/experience-provider";

/**
 * Whether the member app is still opening: a member's own page was asked for
 * and who they are is not known yet. While it is, the shell shows the RIVET
 * mark on plain paper instead of the public site's bar and a loading line,
 * which used to sit still for seconds and then jump into the app.
 *
 * Only the member's own pages wait. The marketplace and gym pages are public
 * and paint at once. A visitor who turns out to be signed out keeps the mark
 * while the shell sends them to sign in; an answer that is not a member
 * (staff, an administrator, a failed check, a member without a profile) ends
 * the wait so the page can say what happened.
 */
export function memberAppOpening(input: {
  protectedRoute: boolean;
  previewSessionReady: boolean;
  customerSignedIn: boolean;
  signedOut: boolean;
  identity: Pick<RivetIdentity, "status" | "platformAdmin" | "gymAccessUnavailable" | "memberships">;
  experienceStatus: ExperienceStatus;
}): boolean {
  // The preview restores its member from sessionStorage after hydration.
  if (!input.previewSessionReady) return true;
  if (input.customerSignedIn || !input.protectedRoute) return false;
  if (input.signedOut) return true;
  const { identity } = input;
  if (identity.status === "loading" || identity.status === "pending") return true;
  if (identity.status !== "ready") return false;
  const member = !identity.platformAdmin && !identity.gymAccessUnavailable && identity.memberships.length === 0;
  return member && input.experienceStatus === "loading";
}
