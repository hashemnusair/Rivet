"use client";

import { useEffect, useState, type ComponentType } from "react";
import { useSigningInCover } from "@/lib/auth/signing-in";
import { SIGNING_IN_DOCUMENT_ATTRIBUTE } from "@/lib/auth/signing-in-marker";

type CoverBody = ComponentType<{ covering: boolean }>;

/*
 * The cover's own code is a separate chunk, so pages that never sign anyone
 * in (the landing above all) do not carry it. It is loaded by hand rather
 * than with React.lazy or next/dynamic: those go through Suspense, and React
 * holds back content that resolves right after a fallback for about 300 ms.
 * Here that would show the page under the cover for that long.
 */
let loadedBody: CoverBody | null = null;
let loadingBody: Promise<CoverBody> | null = null;

function loadBody(): Promise<CoverBody> {
  loadingBody ??= import("./signing-in-cover-body").then((module) => {
    loadedBody = module.SigningInCoverBody;
    return loadedBody;
  });
  return loadingBody;
}

/** Fetches the cover ahead of its first use: a sign-in page calls this when it opens. */
export function preloadSigningInCover() {
  void loadBody().catch(() => {
    // A failed fetch may be retried by the cover itself.
    loadingBody = null;
  });
}

/**
 * The one "Signing you in…" screen (see `@/lib/auth/signing-in`). It sits in
 * the root layout, above every route, so it stays in place while the page
 * underneath changes from the sign-in page to the dashboard, and lifts off
 * whatever is there once nothing is waiting any more.
 */
export function SigningInCover() {
  const covering = useSigningInCover();
  const [used, setUsed] = useState(false);
  const [, setLoaded] = useState(false);
  if (covering && !used) setUsed(true);

  // Every cover on this page now carries its final words (a shell that
  // arrived mid sign-in swapped them before this ran), so they may show.
  useEffect(() => {
    document.documentElement.removeAttribute(SIGNING_IN_DOCUMENT_ATTRIBUTE);
  }, []);

  // Normally the sign-in page fetched the code already and nothing happens
  // here. Otherwise fetch it now and draw the cover as soon as it is in.
  useEffect(() => {
    if (!used || loadedBody) return;
    let live = true;
    void loadBody()
      .then(() => {
        if (live) setLoaded(true);
      })
      .catch(() => {
        loadingBody = null;
      });
    return () => {
      live = false;
    };
  }, [used]);

  // Kept after the first use so the cover can finish lifting.
  const Body = loadedBody;
  return used && Body ? <Body covering={covering} /> : null;
}
