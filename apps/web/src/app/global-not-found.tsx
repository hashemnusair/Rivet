import type { Metadata } from "next";
import { getRequestUiPreference } from "@/lib/i18n/server";
import NotFound from "./(main)/not-found";
import { RootDocument, rootViewport } from "./root-document";

export const metadata: Metadata = { title: "Page not found · RIVET" };
export const viewport = rootViewport;

/**
 * The 404 for an address no route matches. With two root layouts (the
 * product's and the landing's) there is no single layout to draw it in, so it
 * brings its own document. It reads the language from the request like the
 * product's layout: a fixed language here would also overwrite the visitor's
 * saved choice when the page mounts. The product's not-found page still
 * answers inside the product.
 */
export default async function GlobalNotFound() {
  const preference = await getRequestUiPreference();
  return (
    <RootDocument locale={preference.locale} owner={preference.owner} pending={preference.pending}>
      <NotFound />
    </RootDocument>
  );
}
