"use client";

import dynamic from "next/dynamic";
import { registerCatalogue } from "./core";

/**
 * The root layout renders this only for Arabic readers. As a `next/dynamic`
 * import it stays out of the layout's own chunks, so English pages never
 * download Arabic, and the server puts a preload for the Arabic chunk in the
 * HTML, so it downloads alongside the page's startup code. LocaleProvider
 * waits for it before hydrating (the HTML is already Arabic). Same chunk name
 * as `loadCatalogue` in core.ts, so the language switch reuses the file.
 */
export const ArabicCatalogue = dynamic(() => import(/* webpackChunkName: "i18n-ar" */ "./messages/ar").then(({ ar }) => {
  registerCatalogue("ar", ar);
  return function ArabicCatalogueRegistered() {
    return null;
  };
}));
