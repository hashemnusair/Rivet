import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { addDays, todayISODate } from "@/lib/utils/dates";
import { ReportScopeBar, ScopePills, parseReportRange, parseReportScope, reportScopeFrom, reportScopeHref, validISODate } from "./report-scope";

HTMLElement.prototype.hasPointerCapture = () => false;
HTMLElement.prototype.setPointerCapture = () => undefined;
HTMLElement.prototype.releasePointerCapture = () => undefined;
HTMLElement.prototype.scrollIntoView = () => undefined;

const BRANCHES = [{ id: "branch-abdoun", name: "Forge — Abdoun" }, { id: "branch-sweifieh", name: "Forge — Sweifieh" }];
const params = (query: string) => new URLSearchParams(query);

describe("report scope parsing", () => {
  it("falls back to a 30 day window ending today in the actor's active branch", () => {
    const scope = parseReportScope(params(""), { branches: BRANCHES, defaultBranchId: "branch-sweifieh" });
    expect(scope).toEqual({ rangeDays: 30, to: todayISODate(), branchId: "branch-sweifieh" });
    expect(reportScopeFrom(scope)).toBe(addDays(todayISODate(), -29));
  });

  it("reads a valid range, end date and branch from the URL and rejects invalid values", () => {
    expect(parseReportScope(params("range=90&to=2026-08-31&branchId=branch-abdoun"), { branches: BRANCHES, defaultBranchId: "branch-sweifieh" })).toEqual({ rangeDays: 90, to: "2026-08-31", branchId: "branch-abdoun" });
    expect(parseReportScope(params("range=45&to=2026-02-30&branchId=branch-unknown"), { branches: BRANCHES, defaultBranchId: "branch-sweifieh" })).toEqual({ rangeDays: 30, to: todayISODate(), branchId: "branch-sweifieh" });
    expect(parseReportScope(params("branchId=all"), { branches: BRANCHES, defaultBranchId: "branch-sweifieh" }).branchId).toBe("all");
    expect(parseReportRange("7")).toBe(7);
    expect(validISODate("2026-13-01")).toBeUndefined();
  });

  it("writes only the parts of the scope that differ from the defaults", () => {
    const today = todayISODate();
    expect(reportScopeHref("/reports", "overview", { rangeDays: 30, to: today, branchId: "all" })).toBe("/reports");
    expect(reportScopeHref("/reports", "collections", { rangeDays: 7, to: "2026-08-31", branchId: "branch-abdoun" })).toBe("/reports?view=collections&range=7&to=2026-08-31&branchId=branch-abdoun");
    expect(reportScopeHref("/reports", "overview", { rangeDays: 30, to: today, branchId: "all" }, { defaultBranchId: "branch-sweifieh" })).toBe("/reports?branchId=all");
    expect(reportScopeHref("/reports", "overview", { rangeDays: 30, to: today, branchId: "branch-sweifieh" }, { defaultBranchId: "branch-sweifieh" })).toBe("/reports");
  });
});

describe("ScopePills", () => {
  it("announces the pressed preset and reports changes", () => {
    const onChange = vi.fn();
    render(<ScopePills label="Date range" value={30} items={[{ value: 7, label: "7 days" }, { value: 30, label: "30 days" }]} onChange={onChange} />);
    const group = screen.getByRole("group", { name: "Date range" });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "30 days" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "7 days" })).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(screen.getByRole("button", { name: "7 days" }));
    expect(onChange).toHaveBeenCalledWith(7);
  });
});

describe("ReportScopeBar", () => {
  const scope = { rangeDays: 30 as const, to: "2026-09-05", branchId: "all" };

  it("offers the branch, window and end date and describes the scope in words", () => {
    const onChange = vi.fn();
    const onRefresh = vi.fn();
    render(<ReportScopeBar branches={BRANCHES} scope={scope} onChange={onChange} ranged onRefresh={onRefresh} />);
    expect(screen.getByRole("combobox", { name: "Branch filter" })).toBeInTheDocument();
    expect(screen.getByLabelText("End date")).toHaveValue("2026-09-05");
    expect(screen.getByText(/7 Aug 2026 – 5 Sept 2026/)).toBeInTheDocument();
    expect(screen.getByText(/gym local time · All accessible branches/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "90 days" }));
    expect(onChange).toHaveBeenCalledWith({ rangeDays: 90 });
    fireEvent.change(screen.getByLabelText("End date"), { target: { value: "2026-08-31" } });
    expect(onChange).toHaveBeenCalledWith({ to: "2026-08-31" });
    fireEvent.click(screen.getByRole("button", { name: /Refresh/ }));
    expect(onRefresh).toHaveBeenCalled();
  });

  it("hides the window for point-in-time reports and the branch picker for single-branch gyms", () => {
    render(<ReportScopeBar branches={[BRANCHES[0]!]} scope={{ ...scope, branchId: "branch-abdoun" }} onChange={vi.fn()} ranged={false} onRefresh={vi.fn()} note="as of today" />);
    expect(screen.queryByRole("combobox", { name: "Branch filter" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("End date")).not.toBeInTheDocument();
    expect(screen.getByText(/Forge — Abdoun · as of today/)).toBeInTheDocument();
  });
});
