import { forwardRef, type HTMLAttributes, type TdHTMLAttributes, type ThHTMLAttributes } from "react";
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

const TableRow = forwardRef<HTMLTableRowElement, HTMLAttributes<HTMLTableRowElement> & { interactive?: boolean }>(
  ({ className, interactive, ...props }, ref) => (
    <tr
      ref={ref}
      className={cn(
        "border-b border-line/80 transition-colors",
        interactive && "cursor-pointer hover:bg-sunken/50",
        className,
      )}
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
        "h-9 px-3 text-start align-middle font-mono text-[10.5px] font-medium uppercase tracking-[0.12em] text-ink-3 whitespace-nowrap bg-surface",
        className,
      )}
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
