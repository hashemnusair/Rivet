"use client";

import { useSyncExternalStore } from "react";

/**
 * Scope epoch for the active API client.
 *
 * A Convex watch is bound to the organization and branch that were active
 * when it was opened. Switching branch, choosing another organization or
 * signing in/out changes what the same query key should show, but a key that
 * does not carry the branch (a personal workspace, a profile, "my leads")
 * would otherwise keep streaming the previous scope. Bumping the epoch tells
 * every realtime bridge to dispose its watch and subscribe again under the
 * current scope; ordinary queries are already reset by the providers.
 */
let epoch = 0;
const listeners = new Set<() => void>();

export function bumpApiScope(): void {
  epoch += 1;
  for (const listener of listeners) listener();
}

export function currentApiScopeEpoch(): number {
  return epoch;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function useApiScopeEpoch(): number {
  return useSyncExternalStore(subscribe, currentApiScopeEpoch, currentApiScopeEpoch);
}
