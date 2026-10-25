"use client";

import { useMemo } from "react";
import { qk } from "@/lib/api/keys";
import { useApiQuery } from "@/lib/hooks/use-api";
import { useAiMessage } from "./ai-message";
import { capabilityAvailable, useAiSettings } from "./use-assist";

/**
 * For each member on the visible page of a list, the brief fact the row does
 * not already show (attendance, travel, an open call), in the reader's language. Empty while assistance is off, so list rows stay
 * exactly as they are.
 */
export function useMemberHeadlines(memberIds: readonly string[]): Map<string, string> {
  const { data: settings } = useAiSettings();
  const present = useAiMessage();
  const ids = useMemo(() => [...new Set(memberIds)].slice(0, 25), [memberIds]);
  const enabled = capabilityAvailable(settings, "member_context") && ids.length > 0;
  const query = useApiQuery(qk.aiHeadlines(ids), (api) => api.getMemberHeadlines(ids), { enabled });
  return useMemo(() => {
    const result = new Map<string, string>();
    if (!enabled || !query.data?.available) return result;
    for (const item of query.data.items) result.set(item.memberId, present(item.fact));
    return result;
  }, [enabled, present, query.data]);
}
