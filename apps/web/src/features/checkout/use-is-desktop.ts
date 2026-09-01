"use client";

import { useEffect, useState } from "react";

const DESKTOP_QUERY = "(min-width: 1024px)";

/** Layout switch for the cart: a sticky side panel on desktop, a bottom sheet on phones. */
export function useIsDesktop(): boolean {
  const [desktop, setDesktop] = useState(() => (typeof window === "undefined" || typeof window.matchMedia !== "function" ? true : window.matchMedia(DESKTOP_QUERY).matches));
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia(DESKTOP_QUERY);
    const update = () => setDesktop(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return desktop;
}
