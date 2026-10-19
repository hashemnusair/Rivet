import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SignedInGuard } from "./signed-in-guard";

const state = vi.hoisted(() => ({
  replace: vi.fn(),
  viewer: { status: "signed-in", destination: { area: "platform", href: "/platform", label: "Platform console", verb: "Open the console" } } as Record<string, unknown>,
}));

vi.mock("@/lib/auth/public-viewer", () => ({ usePublicViewer: () => state.viewer }));
vi.mock("@/lib/routing/use-host-router", () => ({ useHostRouter: () => ({ replace: state.replace, push: vi.fn() }) }));

describe("SignedInGuard", () => {
  beforeEach(() => state.replace.mockReset());
  afterEach(() => window.history.replaceState({}, "", "/"));

  it("sends someone signed in from the landing to their own area", () => {
    window.history.replaceState({}, "", "/");
    render(<SignedInGuard />);
    expect(state.replace).toHaveBeenCalledWith("/platform");
  });

  it("leaves the landing open when it was asked for on purpose", () => {
    window.history.replaceState({}, "", "/?view=landing");
    render(<SignedInGuard />);
    expect(state.replace).not.toHaveBeenCalled();
  });

  it("still hands off from the resolver, which is not a signed-out page", () => {
    window.history.replaceState({}, "", "/login");
    render(<SignedInGuard />);
    expect(state.replace).toHaveBeenCalledWith("/platform");
  });

  it("still sends someone signed in away from a sign-in door that carries the request", () => {
    window.history.replaceState({}, "", "/login/admin?view=landing");
    render(<SignedInGuard />);
    expect(state.replace).toHaveBeenCalledWith("/platform");
  });
});
