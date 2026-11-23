export function getAppQueryDefaults(convexMode: boolean) {
  return {
    // One-shot screens refresh when they become active again, but do not keep
    // every open screen reading the database while it is sitting idle.
    staleTime: convexMode ? 10_000 : 5_000,
    refetchInterval: false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  } as const;
}

/**
 * How long a screen's last data stays in memory after the screen is left, so
 * going back to it draws at once and refreshes in place. Fifteen minutes
 * covers the back-and-forth of a front-desk shift without keeping a whole
 * day's screens. Memory only: nothing is written to browser storage, and
 * sign-out, an organization change and a branch change clear it
 * (app-providers.tsx).
 */
export const QUERY_GC_TIME_MS = 15 * 60_000;
