import type { MessageTree } from "./dictionary";

/**
 * Browser stand-in for `arabic-catalogue.ts` (swapped in by `next.config.mjs`).
 * Arabic reaches the browser through `ArabicCatalogue` in the root layout or
 * `loadCatalogue("ar")`, so English readers do not download it.
 */
export const bundledArabic: MessageTree | undefined = undefined;
