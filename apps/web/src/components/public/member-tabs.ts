"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from "react";
import { getApi } from "@/lib/api/client";
import { prefetchFully } from "@/components/shell/instant-navigation";
import { qk } from "@/lib/api/keys";
import { customerTransactionQuery } from "@/lib/public/customer-finance-query";

/**
 * The member dock's sections. They behave like a phone app's tab bar: the
 * pages are fetched ahead so a tap never waits for the server, each section
 * keeps its scroll position, and tapping the open section scrolls it to the
 * top.
 */
export const MEMBER_TAB_HREFS: readonly string[] = ["/customer/my-gyms", "/customer/finance", "/customer/discover"];

/**
 * A fully prefetched route stays usable for Next's static stale time (five
 * minutes). The dock never leaves the screen, so Next would not fetch it
 * again on its own; refresh just before it expires and when the app returns
 * to the foreground.
 */
const PREFETCH_REFRESH_MS = 4 * 60 * 1000;

/** `signedIn`: only a signed-in member has the dock and the Payments data to warm. */
export function useMemberTabs(pathname: string, signedIn: boolean) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const scrolls = useRef(new Map<string, number>());
  const restoreFor = useRef<string | undefined>(undefined);
  // The tapped tab lights up at once, before its page has rendered; it
  // belongs to the page it was tapped from, so it clears itself on arrival.
  const [pending, setPending] = useState<{ href: string; from: string }>();
  const [pressed, setPressed] = useState<string>();
  const pendingHref = pending && pending.from === pathname ? pending.href : undefined;

  useEffect(() => {
    if (!signedIn) return;
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      for (const href of MEMBER_TAB_HREFS) prefetchFully(router, href);
    };
    const timer = window.setInterval(refresh, PREFETCH_REFRESH_MS);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [router, signedIn]);

  // Payments is the one section that loads its own data; have it ready
  // before the first tap. The keys match the page's own queries.
  useEffect(() => {
    if (!signedIn) return;
    void queryClient.prefetchQuery({ queryKey: qk.customerFinance("summary"), queryFn: () => getApi().getCustomerFinancialSummary(), staleTime: 10_000 });
    const transactions = customerTransactionQuery({});
    void queryClient.prefetchQuery({ queryKey: qk.customerFinance(transactions), queryFn: () => getApi().listCustomerTransactions(transactions), staleTime: 10_000 });
  }, [queryClient, signedIn]);

  // Back on a section reached from the dock, return to where it was left, in
  // the same frame (the page's smooth scrolling would glide there instead).
  useLayoutEffect(() => {
    if (restoreFor.current !== pathname) return;
    restoreFor.current = undefined;
    window.scrollTo({ top: scrolls.current.get(pathname) ?? 0, behavior: "instant" });
  }, [pathname]);

  const press = useCallback((href: string, event: MouseEvent<HTMLAnchorElement>) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    setPressed(href);
    if (pathname === href) {
      event.preventDefault();
      const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
      return;
    }
    scrolls.current.set(pathname, window.scrollY);
    restoreFor.current = href;
    setPending({ href, from: pathname });
  }, [pathname]);

  const activeHref = pendingHref ?? MEMBER_TAB_HREFS.find((href) => pathname === href || pathname.startsWith(`${href}/`));
  return { activeHref, pressed, press };
}
