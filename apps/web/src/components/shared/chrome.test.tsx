import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Page } from "@/lib/domain/types";
import { DataPagination } from "./chrome";

vi.mock("@/lib/providers/app-providers", () => ({
  usePermissions: () => ({ can: () => true, canAny: () => true, permissions: [], role: "owner" }),
}));

function page(overrides: Partial<Page<string>>): Page<string> {
  return { items: [], page: 1, pageSize: 20, totalItems: 0, totalPages: 0, ...overrides };
}

describe("DataPagination", () => {
  it("moves a page number that is past the end back to the last real page", () => {
    const onPage = vi.fn();
    render(<DataPagination page={page({ page: 4, totalItems: 25, totalPages: 2 })} onPage={onPage} />);
    expect(onPage).toHaveBeenCalledWith(2);
  });

  it("does not move a page that is in range, and renders nothing for an empty set", () => {
    const onPage = vi.fn();
    const { rerender, container } = render(<DataPagination page={page({ page: 2, totalItems: 25, totalPages: 2 })} onPage={onPage} />);
    expect(onPage).not.toHaveBeenCalled();
    expect(screen.getByText("21–25 of 25")).toBeInTheDocument();
    rerender(<DataPagination page={page({ page: 3, totalItems: 0, totalPages: 0 })} onPage={onPage} />);
    expect(onPage).not.toHaveBeenCalled();
    expect(container).toBeEmptyDOMElement();
  });

  it("never prints a range that starts after it ends while the page corrects itself", () => {
    render(<DataPagination page={page({ page: 2, totalItems: 2, totalPages: 1 })} onPage={vi.fn()} />);
    expect(screen.getByText("2–2 of 2")).toBeInTheDocument();
  });
});
