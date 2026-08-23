import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { IdentityPanel } from "./identity-panels.client";

const state = vi.hoisted(() => ({
  identity: {
    status: "ready",
    userId: "user-1",
    email: "admin@rivetjo.com",
    fullName: "RIVET Admin",
    platformAdmin: true,
    gymAccessUnavailable: false,
    memberships: [],
  },
  replace: vi.fn(),
  signInAsIdentity: vi.fn(),
  signInPlatformAdmin: vi.fn(),
  signOutClerk: vi.fn(),
  signOutApp: vi.fn(),
  signOutCustomer: vi.fn(),
  signOutPlatformAdmin: vi.fn(),
}));

vi.mock("@clerk/nextjs", () => ({
  useClerk: () => ({ signOut: state.signOutClerk }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: state.replace }),
}));

vi.mock("@/lib/auth/rivet-identity", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/rivet-identity")>();
  return { ...actual, useRivetIdentity: () => state.identity };
});

vi.mock("@/lib/providers/app-providers", () => ({
  useApp: () => ({ signIn: vi.fn(), signOut: state.signOutApp }),
}));

vi.mock("@/lib/providers/experience-provider", () => ({
  useExperience: () => ({
    signInAsIdentity: state.signInAsIdentity,
    signInPlatformAdmin: state.signInPlatformAdmin,
    signOutCustomer: state.signOutCustomer,
    signOutPlatformAdmin: state.signOutPlatformAdmin,
  }),
}));

describe("IdentityPanel", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    state.replace.mockReset();
    state.signInAsIdentity.mockReset();
    state.signInPlatformAdmin.mockReset();
    state.signOutClerk.mockReset();
    state.signOutApp.mockReset();
    state.signOutCustomer.mockReset();
    state.signOutPlatformAdmin.mockReset();
    state.identity = {
      status: "ready",
      userId: "user-1",
      email: "admin@rivetjo.com",
      fullName: "RIVET Admin",
      platformAdmin: true,
      gymAccessUnavailable: false,
      memberships: [],
    };
  });

  it("finishes the platform handoff after the branded transition", () => {
    render(<IdentityPanel />);

    expect(screen.getByText("Opening the platform console…")).toBeVisible();
    expect(state.signInPlatformAdmin).toHaveBeenCalledOnce();

    act(() => vi.advanceTimersByTime(900));

    expect(state.replace).toHaveBeenCalledWith("/platform");
  });

  it("keeps an unavailable gym owner out of member bootstrap and signs the account out", async () => {
    state.identity = {
      status: "ready",
      userId: "user-2",
      email: "owner@rivetjo.com",
      fullName: "Gym Owner",
      platformAdmin: false,
      gymAccessUnavailable: true,
      memberships: [],
    };
    state.signOutApp.mockResolvedValue(undefined);
    state.signOutClerk.mockResolvedValue(undefined);

    render(<IdentityPanel />);

    expect(screen.getByText("Your gym workspace is unavailable")).toBeVisible();
    expect(state.signInAsIdentity).not.toHaveBeenCalled();
    await act(async () => {
      screen.getByRole("button", { name: "Sign out and use another account" }).click();
    });

    expect(state.signOutApp).toHaveBeenCalledOnce();
    expect(state.signOutCustomer).toHaveBeenCalledOnce();
    expect(state.signOutPlatformAdmin).toHaveBeenCalledOnce();
    expect(state.signOutClerk).toHaveBeenCalledWith({ redirectUrl: "/login" });
  });
});
