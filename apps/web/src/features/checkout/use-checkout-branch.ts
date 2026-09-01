"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useApp } from "@/lib/providers/app-providers";

/**
 * Resolves the one concrete branch a sale belongs to.
 *
 * The topbar's "All branches" scope is deliberately not a checkout scope: a
 * sale must name the branch whose inventory is decremented, so an
 * organization-wide scope is never silently turned into the first visible
 * branch. A valid `branchId` in the URL is an explicit deep-link choice and
 * stays authoritative; otherwise the session's active branch is followed as
 * it changes. Reception staff assigned to one branch therefore start with
 * it preselected, and owners choose.
 */
export function useCheckoutBranch(onBranchChange: () => void) {
  const { session, setBranch } = useApp();
  const searchParams = useSearchParams();
  const visibleBranches = useMemo(() => session?.branches ?? [], [session?.branches]);
  const visibleBranchIds = useMemo(() => new Set(visibleBranches.map((branch) => branch.id)), [visibleBranches]);
  const requestedBranchId = searchParams.get("branchId") ?? undefined;
  const validUrlBranchId = requestedBranchId && visibleBranchIds.has(requestedBranchId) ? requestedBranchId : undefined;
  const globalBranchId = session?.activeBranchId && visibleBranchIds.has(session.activeBranchId) ? session.activeBranchId : undefined;
  const [branchId, setBranchId] = useState("");
  const [branchSelectionError, setBranchSelectionError] = useState<string>();
  const [branchChanging, setBranchChanging] = useState(false);
  const previousGlobalBranchId = useRef<string | undefined>(undefined);
  const previousUrlBranchId = useRef<string | undefined>(undefined);
  const syncedUrlBranchId = useRef<string | undefined>(undefined);
  const onBranchChangeRef = useRef(onBranchChange);
  useEffect(() => { onBranchChangeRef.current = onBranchChange; });
  const concreteBranchId = visibleBranchIds.has(branchId) ? branchId : validUrlBranchId ?? globalBranchId ?? "";

  useEffect(() => {
    const urlChanged = validUrlBranchId !== previousUrlBranchId.current;
    const globalChanged = globalBranchId !== previousGlobalBranchId.current;
    const nextBranchId = validUrlBranchId ?? globalBranchId;
    const shouldSync = validUrlBranchId ? urlChanged : urlChanged || globalChanged;
    if (shouldSync && nextBranchId !== branchId) {
      setBranchId(nextBranchId ?? "");
      onBranchChangeRef.current();
    }
    // A deep link also moves the app-level branch scope so Inventory and
    // Machines use the same branch afterwards. An already-matching global
    // branch is marked synced so a later topbar change does not snap the
    // checkout back to the URL branch.
    if (urlChanged) syncedUrlBranchId.current = undefined;
    if (validUrlBranchId && globalBranchId === validUrlBranchId) {
      syncedUrlBranchId.current = validUrlBranchId;
    } else if (validUrlBranchId && syncedUrlBranchId.current !== validUrlBranchId) {
      syncedUrlBranchId.current = validUrlBranchId;
      setBranchSelectionError(undefined);
      void setBranch(validUrlBranchId).catch((error: unknown) => {
        syncedUrlBranchId.current = undefined;
        setBranchSelectionError(error instanceof Error ? error.message : "That branch could not be selected.");
      });
    }
    if (!validUrlBranchId) syncedUrlBranchId.current = undefined;
    previousUrlBranchId.current = validUrlBranchId;
    previousGlobalBranchId.current = globalBranchId;
  }, [branchId, globalBranchId, setBranch, validUrlBranchId]);

  const chooseBranch = (nextBranchId: string) => {
    if (!visibleBranchIds.has(nextBranchId) || nextBranchId === concreteBranchId) return;
    const previousBranchId = concreteBranchId;
    setBranchSelectionError(undefined);
    setBranchId(nextBranchId);
    onBranchChangeRef.current();
    setBranchChanging(true);
    void setBranch(nextBranchId)
      .catch((error: unknown) => {
        setBranchId(previousBranchId);
        setBranchSelectionError(error instanceof Error ? error.message : "That branch could not be selected.");
      })
      .finally(() => setBranchChanging(false));
  };

  return { branches: visibleBranches, concreteBranchId, chooseBranch, branchChanging, branchSelectionError, session };
}
