import { render, screen } from "@testing-library/react";
import { useContext } from "react";
import { describe, expect, it, vi } from "vitest";
import { NavigationHoldPathnameContext } from "./navigation-hold";
import { NavigationHoldPathname } from "./navigation-hold-pathname";

const navigation = vi.hoisted(() => ({ pathname: "/dashboard" as string | null }));
vi.mock("next/navigation", () => ({ usePathname: () => navigation.pathname }));

function Reader() {
  return <p>{useContext(NavigationHoldPathnameContext) ?? "outside the App Router"}</p>;
}

describe("NavigationHoldPathname", () => {
  it("hands the query hooks the pathname Next is rendering", () => {
    const { rerender } = render(<NavigationHoldPathname><Reader /></NavigationHoldPathname>);
    expect(screen.getByText("/dashboard")).toBeInTheDocument();

    navigation.pathname = "/members";
    rerender(<NavigationHoldPathname><Reader /></NavigationHoldPathname>);
    expect(screen.getByText("/members")).toBeInTheDocument();
  });

  it("leaves the hold off where nothing provides a pathname", () => {
    render(<Reader />);
    expect(screen.getByText("outside the App Router")).toBeInTheDocument();
  });
});
