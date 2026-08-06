import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PublicHeader } from "./public-shell";

const state = vi.hoisted(() => ({
  clerkLoaded: false,
  clerkSignedIn: false,
  identity: { status: "loading", platformAdmin: false, memberships: [] } as Record<string, unknown>,
}));

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ isLoaded: state.clerkLoaded, isSignedIn: state.clerkSignedIn }),
  useClerk: () => ({ signOut: vi.fn() }),
  UserButton: () => <span data-testid="user-button" />,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/lib/auth/rivet-identity", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/rivet-identity")>();
  return { ...actual, useRivetIdentity: () => state.identity };
});

describe("PublicHeader authentication actions", () => {
  beforeEach(() => {
    state.clerkLoaded = false;
    state.clerkSignedIn = false;
    state.identity = { status: "loading", platformAdmin: false, memberships: [] };
  });

  it("renders public actions on the first frame before Clerk loads", () => {
    render(<PublicHeader />);

    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
    expect(screen.getByRole("link", { name: /Send gym application/ })).toHaveAttribute("href", "/signup");
  });

  it("links a signed-in administrator directly to the platform", () => {
    state.clerkLoaded = true;
    state.clerkSignedIn = true;
    state.identity = {
      status: "ready",
      platformAdmin: true,
      memberships: [],
    };

    render(<PublicHeader />);

    expect(screen.getByRole("link", { name: /Open RIVET/ })).toHaveAttribute("href", "/platform");
    expect(screen.getByTestId("user-button")).toBeInTheDocument();
  });
});
