import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FinanceNav } from "./finance-nav";

vi.mock("next/link", async () => {
  const { forwardRef } = await import("react");
  type Props = Omit<import("react").ComponentPropsWithoutRef<"a">, "href"> & { href: string; prefetch?: boolean | null };
  return {
    default: forwardRef<HTMLAnchorElement, Props>(function Link({ href, prefetch, ...props }, ref) {
      return <a ref={ref} href={href} data-prefetch={String(prefetch)} {...props} />;
    }),
  };
});

vi.mock("next/navigation", () => ({ usePathname: () => "/payments" }));

vi.mock("@/lib/providers/app-providers", () => ({
  useApp: () => ({ session: { permissions: ["reports.financial.read"] } }),
}));

describe("finance tabs", () => {
  it("prepare a view only when the operator reaches for its tab", () => {
    render(<FinanceNav />);

    const tabs = screen.getAllByRole("link");
    expect(tabs.map((tab) => tab.getAttribute("href"))).toEqual(["/payments", "/payments/shifts"]);
    for (const tab of tabs) expect(tab).toHaveAttribute("data-prefetch", "false");

    const shifts = screen.getByRole("link", { name: "Shifts & cash" });
    fireEvent.pointerEnter(shifts);
    expect(shifts).toHaveAttribute("data-prefetch", "true");
    expect(screen.getByRole("link", { name: "Payments" })).toHaveAttribute("data-prefetch", "false");

    const payments = screen.getByRole("link", { name: "Payments" });
    fireEvent.focus(payments);
    expect(payments).toHaveAttribute("data-prefetch", "true");
    expect(payments).toHaveAttribute("aria-current", "page");
  });
});
