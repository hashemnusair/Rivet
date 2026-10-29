import type { Metadata } from "next";
import { DEFAULT_LOCALE } from "@/lib/i18n/config";
import NotFound from "./(main)/not-found";
import { RootDocument, rootViewport } from "./root-document";

export const metadata: Metadata = { title: "Page not found · RIVET" };
export const viewport = rootViewport;

/**
 * The 404 for an address no route matches. With two root layouts (the
 * product's and the landing's) there is no single layout to draw it in, so it
 * brings its own document. The product's not-found page still answers inside
 * the product.
 */
export default function GlobalNotFound() {
  return (
    <RootDocument locale={DEFAULT_LOCALE}>
      <NotFound />
    </RootDocument>
  );
}
