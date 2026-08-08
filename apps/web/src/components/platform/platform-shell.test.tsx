import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PlatformShell } from "./platform-shell";

const state = vi.hoisted(() => ({
  clerkSignOut: vi.fn(),
  replace: vi.fn(),
  clearPlatformSession: vi.fn(),
}));

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true }),
  useClerk: () => ({ signOut: state.clerkSignOut }),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/platform",
  useRouter: () => ({ replace: state.replace, push: vi.fn() }),
}));

vi.mock("@/lib/auth/rivet-identity", () => ({
  useRivetIdentity: () => ({
    status: "ready",
    fullName: "RIVET Admin",
    email: "admin@rivetjo.com",
    platformAdmin: true,
    memberships: [],
  }),
}));

vi.mock("@/lib/providers/experience-provider", () => ({
  useExperience: () => ({
    platformAdminSignedIn: true,
    previewSessionReady: true,
    experienceReady: true,
    signOutPlatformAdmin: state.clearPlatformSession,
  }),
}));

describe("PlatformShell sign out", () => {
  beforeEach(() => {
    state.clerkSignOut.mockReset().mockResolvedValue(undefined);
    state.replace.mockReset();
    state.clearPlatformSession.mockReset();
  });

  it("holds a transition while signing out and uses only the login destination", async () => {
    render(<PlatformShell><div>Platform content</div></PlatformShell>);

    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

    expect(screen.getByRole("status")).toHaveTextContent("Signing you out");
    await waitFor(() => {
      expect(state.clerkSignOut).toHaveBeenCalledWith({ redirectUrl: "/login" });
      expect(state.clearPlatformSession).toHaveBeenCalledOnce();
      expect(state.replace).toHaveBeenCalledWith("/login");
    });
    expect(state.replace).not.toHaveBeenCalledWith("/");
  });
});
