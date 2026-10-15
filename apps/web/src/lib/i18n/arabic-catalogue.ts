import type { MessageTree } from "./dictionary";
import { ar } from "./messages/ar";

/**
 * Arabic bundled with English, for server code, Convex functions and tests:
 * emails, PDFs and system messages translate Arabic synchronously.
 *
 * Browser bundles replace this module with `arabic-catalogue.browser.ts`
 * (`next.config.mjs`); see `core.ts` for how the browser gets Arabic instead.
 */
export const bundledArabic: MessageTree | undefined = ar as unknown as MessageTree;
