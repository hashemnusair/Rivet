import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PhonePageBoundary } from "./phone-page-boundary";

const route = vi.hoisted(() => ({ pathname: "/reports" }));
vi.mock("next/navigation", () => ({ usePathname: () => route.pathname }));

function setScreen(width: number, height: number) {
  vi.spyOn(window.screen, "width", "get").mockReturnValue(width);
  vi.spyOn(window.screen, "height", "get").mockReturnValue(height);
  // Touch is the main pointer on phones and tablets alike.
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: query === "(pointer: coarse)", media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
}

describe("phone page boundary", () => {
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it("shows the computer-or-tablet message for a page that is not on phones", () => {
    route.pathname = "/reports";
    setScreen(390, 844);
    render(<PhonePageBoundary><div>Reports page</div></PhonePageBoundary>);
    expect(screen.getByRole("status")).toHaveTextContent("This page is for a computer or tablet");
    expect(screen.getByRole("link", { name: "Go to Reception" })).toHaveAttribute("href", "/reception");
    expect(screen.queryByText("Reports page")).not.toBeInTheDocument();
  });

  it("renders phone pages on a phone", () => {
    route.pathname = "/members/m-1";
    setScreen(390, 844);
    render(<PhonePageBoundary><div>Member profile</div></PhonePageBoundary>);
    expect(screen.getByText("Member profile")).toBeInTheDocument();
  });

  it("renders every page on a tablet", () => {
    route.pathname = "/reports";
    setScreen(768, 1024);
    render(<PhonePageBoundary><div>Reports page</div></PhonePageBoundary>);
    expect(screen.getByText("Reports page")).toBeInTheDocument();
  });
});
