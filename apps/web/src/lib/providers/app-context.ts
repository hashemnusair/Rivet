"use client";

import { createContext, useContext } from "react";
import type { AppContextValue } from "./app-providers";

/**
 * The app context object, kept apart from app-providers.tsx so code that only
 * needs to read it softly (intent prefetch on shell links) still works in the
 * many unit tests that replace app-providers with a partial mock.
 */
export const AppContext = createContext<AppContextValue | null>(null);

/** The app context, or null outside AppProviders. */
export function useOptionalApp(): AppContextValue | null {
  return useContext(AppContext);
}
