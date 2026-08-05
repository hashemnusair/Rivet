"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition, type ComponentProps, type MouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils/cn";
import { RivetLogoLoader } from "./rivet-logo-loader";

/**
 * The full-screen hold shown while a route is fetched: the page blurs back and
 * the mark loads itself in the middle. Also used by `loading.tsx`, so a cold
 * navigation and an in-app one look the same.
 */
export function RouteLoadingOverlay({ fixed = true }: { fixed?: boolean }) {
  return (
    <div
      className={cn(
        "z-[100] grid place-items-center bg-paper/70 backdrop-blur-md",
        "animate-fade-in motion-reduce:animate-none",
        fixed ? "fixed inset-0" : "min-h-[70vh] w-full",
      )}
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-col items-center gap-5">
        <RivetLogoLoader className="h-24 w-auto text-ink sm:h-28" />
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-3">Loading</p>
      </div>
    </div>
  );
}

/**
 * A link that holds the branded loader while the next route resolves.
 * `useTransition` around `router.push` gives the pending window; modified
 * clicks fall through to the browser so new-tab and download behaviour survive.
 */
export function LoadingLink({
  href,
  children,
  className,
  onClick,
  ...rest
}: { href: string; children: ReactNode } & Omit<ComponentProps<typeof Link>, "href">) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // In-page anchors are not navigations — they should glide via CSS smooth
  // scrolling, so intercepting them would flash a loader over a scroll.
  const isAnchor = href.startsWith("#") || href.includes("/#");

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (isAnchor || event.defaultPrevented) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;

    event.preventDefault();
    startTransition(() => router.push(href));
  };

  return (
    <>
      <Link href={href} className={className} onClick={handleClick} {...rest}>
        {children}
      </Link>
      {pending ? <OverlayPortal /> : null}
    </>
  );
}

/**
 * The overlay has to leave the subtree it was triggered from. A `fixed` element
 * is positioned against the nearest ancestor with a filter, transform or
 * backdrop-filter rather than the viewport — and these links live inside a
 * header that uses `backdrop-blur`, which was trapping the overlay in the
 * header's box and blurring only that strip.
 */
function OverlayPortal() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(<RouteLoadingOverlay />, document.body);
}
