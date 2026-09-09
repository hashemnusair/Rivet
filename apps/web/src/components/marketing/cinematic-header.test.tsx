import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CinematicHeader, homeHref } from "./cinematic-header";

const state = vi.hoisted(() => ({ viewer: { status: "signed-out" } as Record<string, unknown> }));
vi.mock("@/lib/auth/public-viewer", () => ({ usePublicViewer: () => state.viewer }));

describe("CinematicHeader", () => {
  beforeEach(() => {
    state.viewer = { status: "signed-out" };
  });

  it("scrolls the landing to its own sections", async () => {
    const user = userEvent.setup();
    render(<CinematicHeader />);

    expect(screen.getByRole("link", { name: "RIVET, back to top" })).toHaveAttribute("href", "#top");
    expect(screen.getByRole("link", { name: "Member sign in" })).toHaveAttribute("href", "/login/member");
    expect(screen.getByRole("link", { name: "Apply for access" })).toHaveAttribute("href", "/signup");
    await user.click(screen.getByRole("button", { name: "Menu" }));

    const menu = screen.getByRole("dialog", { name: "RIVET navigation" });
    expect(within(menu).getByRole("link", { name: /Pricing/ })).toHaveAttribute("href", "#pricing");
    expect(within(menu).getByRole("link", { name: /Overview/ })).toHaveAttribute("aria-current", "true");
    expect(within(menu).queryByText("Legal")).not.toBeInTheDocument();
  });

  it("links a document page to the home page's sections and names the document that is open", async () => {
    const user = userEvent.setup();
    render(<CinematicHeader page="document" currentPath="/terms" />);

    expect(screen.getByRole("link", { name: "RIVET, home" })).toHaveAttribute("href", "/");
    await user.click(screen.getByRole("button", { name: "Menu" }));

    const menu = screen.getByRole("dialog", { name: "RIVET navigation" });
    expect(within(menu).getByRole("link", { name: /Overview/ })).toHaveAttribute("href", "/");
    expect(within(menu).getByRole("link", { name: /Pricing/ })).toHaveAttribute("href", "/#pricing");
    expect(within(menu).queryAllByRole("link", { current: "true" })).toHaveLength(0);
    expect(within(menu).getByRole("link", { name: "Terms of service" })).toHaveAttribute("aria-current", "page");
    expect(within(menu).getByRole("link", { name: "Privacy policy" })).not.toHaveAttribute("aria-current");
    expect(within(menu).getByRole("link", { name: "Gym sign in" })).toHaveAttribute("href", "/login/gym");
  });

  it("offers a member page account creation instead of the application", () => {
    render(<CinematicHeader page="document" currentPath="/customer/discover" audience="member" />);
    expect(screen.getByRole("link", { name: "Create account" })).toHaveAttribute("href", "/login/member/create");
    expect(screen.queryByRole("link", { name: "Apply for access" })).not.toBeInTheDocument();
  });

  it("shows a signed-in visitor their own area and a way out, and nothing to apply for", async () => {
    const user = userEvent.setup();
    const signOut = vi.fn().mockResolvedValue(undefined);
    state.viewer = { status: "signed-in", destination: { area: "platform", href: "/platform", label: "Platform", verb: "Open the platform" }, signOut };
    render(<CinematicHeader />);

    expect(screen.getByRole("link", { name: "Platform" })).toHaveAttribute("href", "/platform");
    expect(screen.queryByRole("link", { name: "Apply for access" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Member sign in" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Menu" }));
    const menu = screen.getByRole("dialog", { name: "RIVET navigation" });
    expect(within(menu).getByRole("link", { name: "Open the platform" })).toHaveAttribute("href", "/platform");
    expect(within(menu).queryByRole("link", { name: /sign in/i })).not.toBeInTheDocument();
    await user.click(within(menu).getByRole("button", { name: "Sign out" }));
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it("shows neither set while the viewer is still unknown", () => {
    state.viewer = { status: "loading" };
    render(<CinematicHeader />);
    expect(screen.queryByRole("link", { name: "Apply for access" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Menu" })).toBeInTheDocument();
  });

  it("locks the page behind the open menu and releases it on Escape", async () => {
    const user = userEvent.setup();
    render(
      <div data-landing-sheet>
        <CinematicHeader page="document" currentPath="/privacy" />
      </div>,
    );

    await user.click(screen.getByRole("button", { name: "Menu" }));
    expect(document.body.style.overflow).toBe("hidden");
    expect(document.documentElement.classList.contains("landing-nav-open")).toBe(true);

    await user.keyboard("{Escape}");
    expect(document.body.style.overflow).toBe("");
    expect(document.documentElement.classList.contains("landing-nav-open")).toBe(false);
    expect(screen.getByRole("button", { name: "Menu" })).toHaveFocus();
  });

  it("maps landing anchors to home-page destinations", () => {
    expect(homeHref("#top")).toBe("/");
    expect(homeHref("#pricing")).toBe("/#pricing");
  });
});
