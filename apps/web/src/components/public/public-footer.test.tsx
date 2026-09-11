import { render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { PublicFooter } from "./public-footer";

vi.mock("@/lib/auth/public-viewer", () => ({ usePublicViewer: () => ({ status: "signed-out" }) }));
afterEach(() => vi.unstubAllGlobals());

it("opens pricing and the gym application on www from member discovery", () => {
  const location = { hostname: "app.rivetjo.com", href: "https://app.rivetjo.com/customer/discover", origin: "https://app.rivetjo.com" };
  vi.stubGlobal("window", new Proxy(window, { get: (target, key) => key === "location" ? location : Reflect.get(target, key) }));
  render(<PublicFooter />);
  expect(screen.getByRole("link", { name: "Pricing" })).toHaveAttribute("href", "https://www.rivetjo.com/?site#pricing");
  expect(screen.getByRole("link", { name: "Send gym application" })).toHaveAttribute("href", "https://www.rivetjo.com/signup");
});
