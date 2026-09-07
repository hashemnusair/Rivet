import { forwardRef, type HTMLAttributes, type MouseEvent, type TdHTMLAttributes, type ThHTMLAttributes } from "react";
import { cn } from "@/lib/utils/cn";

/** Dense operational table. Sticky header, hairline rows, tabular numerals. */
const Table = forwardRef<HTMLTableElement, HTMLAttributes<HTMLTableElement> & { containerClassName?: string }>(
  ({ className, containerClassName, ...props }, ref) => (
    <div className={cn("relative w-full overflow-auto", containerClassName)}>
      <table ref={ref} className={cn("w-full caption-bottom text-[13px]", className)} {...props} />
    </div>
  ),
);
Table.displayName = "Table";

const TableHeader = forwardRef<HTMLTableSectionElement, HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <thead ref={ref} className={cn("[&_tr]:border-b [&_tr]:border-line", className)} {...props} />
  ),
);
TableHeader.displayName = "TableHeader";

const TableBody = forwardRef<HTMLTableSectionElement, HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <tbody ref={ref} className={cn("[&_tr:last-child]:border-0", className)} {...props} />
  ),
);
TableBody.displayName = "TableBody";

/**
 * A row that opens a record on click. The row itself is a pointer convenience;
 * the cell that names the record should carry a real link so keyboard users,
 * middle-clicks and "open in new tab" work. Clicks that land on a nested
 * control (the link, a checkbox, a row action) or that end a text selection
 * are left alone, so selecting a phone number or ticking a box never opens
 * the record by accident.
 */
export function rowClickShouldNavigate(event: Pick<MouseEvent<HTMLElement>, "target" | "currentTarget" | "defaultPrevented">): boolean {
  if (event.defaultPrevented) return false;
  const target = event.target;
  if (target instanceof Element) {
    const control = target.closest("a, button, input, select, textarea, label, [role='checkbox'], [role='button'], [role='menuitem']");
    if (control && event.currentTarget.contains(control)) return false;
  }
  const selection = typeof window !== "undefined" ? window.getSelection() : null;
  if (selection && selection.type === "Range" && selection.toString().length > 0) return false;
  return true;
}

const TableRow = forwardRef<HTMLTableRowElement, HTMLAttributes<HTMLTableRowElement> & { interactive?: boolean }>(
  ({ className, interactive, onClick, ...props }, ref) => (
    <tr
      ref={ref}
      className={cn(
        "border-b border-line/80 transition-colors",
        interactive && "cursor-pointer hover:bg-sunken/50",
        className,
      )}
      onClick={interactive && onClick ? (event) => { if (rowClickShouldNavigate(event)) onClick(event); } : onClick}
      {...props}
    />
  ),
);
TableRow.displayName = "TableRow";

const TableHead = forwardRef<HTMLTableCellElement, ThHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <th
      ref={ref}
      className={cn(
        "h-9 whitespace-nowrap bg-surface px-3 text-start align-middle text-[11.5px] font-semibold text-ink-3",
        className,
      )}
      data-rivet-table-head
      {...props}
    />
  ),
);
TableHead.displayName = "TableHead";

const TableCell = forwardRef<HTMLTableCellElement, TdHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <td ref={ref} className={cn("px-3 py-2.5 align-middle", className)} {...props} />
  ),
);
TableCell.displayName = "TableCell";

export { Table, TableHeader, TableBody, TableHead, TableRow, TableCell };
