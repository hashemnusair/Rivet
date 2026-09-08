import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { CinematicHeader, homeHref } from "./cinematic-header";

describe("CinematicHeader", () => {
  it("scrolls the landing to its own sections", async () => {
    const user = userEvent.setup();
    render(<CinematicHeader />);

    expect(screen.getByRole("link", { name: "RIVET, back to top" })).toHaveAttribute("href", "#top");
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
    expect(within(menu).getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
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
