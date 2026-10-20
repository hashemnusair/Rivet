"use client";

import { useState } from "react";
import type { Page } from "@/lib/domain/types";

/** How many entries an activity log shows on one page; people choose one of these. */
export const ACTIVITY_PAGE_SIZES = [5, 10, 20] as const;
export const DEFAULT_ACTIVITY_PAGE_SIZE = 10;

/** One page of a list that is already in memory, in the same shape the API returns. */
export function pageOf<T>(items: readonly T[], page: number, pageSize: number): Page<T> {
  const size = Math.max(1, Math.floor(pageSize));
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / size));
  const current = Math.min(Math.max(1, Math.floor(page) || 1), totalPages);
  return { items: items.slice((current - 1) * size, current * size), page: current, pageSize: size, totalItems, totalPages };
}

/**
 * Pages a list held in memory, such as the platform console's recent
 * activity. Choosing a new page size goes back to the first page, so the
 * reader never lands on a page that no longer exists.
 */
export function useClientPage<T>(items: readonly T[], initialPageSize: number = DEFAULT_ACTIVITY_PAGE_SIZE) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);
  return {
    page: pageOf(items, page, pageSize),
    setPage,
    setPageSize: (next: number) => {
      setPageSize(next);
      setPage(1);
    },
  };
}
