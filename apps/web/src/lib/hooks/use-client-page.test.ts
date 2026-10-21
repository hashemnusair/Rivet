import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ACTIVITY_PAGE_SIZES, DEFAULT_ACTIVITY_PAGE_SIZE, pageOf, useClientPage } from "./use-client-page";

const items = Array.from({ length: 23 }, (_, index) => index + 1);

describe("pageOf", () => {
  it("cuts an in-memory list into pages shaped like the API's", () => {
    expect(pageOf(items, 1, 10)).toEqual({ items: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], page: 1, pageSize: 10, totalItems: 23, totalPages: 3 });
    expect(pageOf(items, 3, 10).items).toEqual([21, 22, 23]);
    expect(pageOf(items, 2, 5).items).toEqual([6, 7, 8, 9, 10]);
  });

  it("keeps a page number inside the list", () => {
    expect(pageOf(items, 9, 20)).toMatchObject({ page: 2, items: [21, 22, 23] });
    expect(pageOf(items, 0, 20).page).toBe(1);
    expect(pageOf([], 1, 10)).toEqual({ items: [], page: 1, pageSize: 10, totalItems: 0, totalPages: 1 });
  });
});

describe("useClientPage", () => {
  it("starts at 10 per page and goes back to page 1 when the size changes", () => {
    expect(ACTIVITY_PAGE_SIZES).toEqual([5, 10, 20]);
    const { result } = renderHook(() => useClientPage(items));
    expect(result.current.page).toMatchObject({ page: 1, pageSize: DEFAULT_ACTIVITY_PAGE_SIZE, totalPages: 3 });

    act(() => result.current.setPage(3));
    expect(result.current.page.items).toEqual([21, 22, 23]);

    act(() => result.current.setPageSize(5));
    expect(result.current.page).toMatchObject({ page: 1, pageSize: 5, totalPages: 5, items: [1, 2, 3, 4, 5] });
  });
});
