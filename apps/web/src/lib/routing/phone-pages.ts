/**
 * Phones get a short list of gym pages: the dashboard's key numbers,
 * Reception, Members, Classes and Personal training (Elias, 29 October 2026;
 * docs/09). Every other page is for a computer or tablet. This is a product
 * choice about screens, not access control: the same person opens every page
 * their role allows on a larger screen, and the server still checks each call.
 */
const PHONE_PAGES = [
  "/dashboard",
  "/reception",
  "/members",
  "/classes",
  "/pt",
  // Opened from a payment taken at Reception or on a member's profile.
  "/payments/receipts",
  // A new owner signs the subscription agreement before any page opens.
  "/onboarding/agreement",
] as const;

/** Bulk member work stays on larger screens even though Members is on phones. */
const NOT_ON_PHONES = ["/members/import", "/members/duplicates"] as const;

function underPath(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

/** Whether a workspace href (path, query and fragment allowed) opens on a phone. */
export function phoneAllowsHref(href: string): boolean {
  const path = href.split(/[?#]/, 1)[0] || "/";
  if (NOT_ON_PHONES.some((prefix) => underPath(path, prefix))) return false;
  return PHONE_PAGES.some((prefix) => underPath(path, prefix));
}

/**
 * The shortest screen side, in CSS pixels, below which a device is a phone.
 * Measured on the screen rather than the window so a phone turned sideways is
 * still a phone and a narrow desktop window or a tablet in split view is not.
 * The smallest common tablets (7-inch Android, iPad mini) are 600px or wider.
 */
export const PHONE_SCREEN_MAX_SHORT_SIDE = 600;

/** A phone's main pointer is a finger; a computer's is a mouse or trackpad at any window size. */
export const PHONE_POINTER_QUERY = "(pointer: coarse)";

/** A phone is a small screen with touch as its main input. */
export function deviceIsPhone(screen: Pick<Screen, "width" | "height">, coarsePointer: boolean): boolean {
  // A screen that reports no size (test DOMs, some embedded views) gets the full workspace.
  if (!coarsePointer || !screen.width || !screen.height) return false;
  return Math.min(screen.width, screen.height) < PHONE_SCREEN_MAX_SHORT_SIDE;
}
