/**
 * Rewrites the address of the page already on screen: a list page, a tab, a
 * filter, a search. Next keeps `usePathname` and `useSearchParams` in sync
 * with the browser's own history API, so the page re-renders from what it
 * already has. `router.replace` asked the server for the page again first, so
 * every page flip, tab and filter waited for a network round trip before
 * anything moved.
 *
 * Only the query string and hash may change this way. A different path is a
 * real navigation and still goes through the router.
 */
export function replaceQueryInPlace(router: { replace(href: string, options?: { scroll?: boolean }): void }, href: string): void {
  const target = new URL(href, window.location.href);
  if (target.origin === window.location.origin && target.pathname === window.location.pathname) {
    window.history.replaceState(null, "", `${target.pathname}${target.search}${target.hash}`);
    return;
  }
  router.replace(href, { scroll: false });
}
