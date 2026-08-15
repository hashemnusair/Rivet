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
