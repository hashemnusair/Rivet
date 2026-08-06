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
    memberships: [],
  },
  replace: vi.fn(),
  signInPlatformAdmin: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: state.replace }),
}));

vi.mock("@/lib/auth/rivet-identity", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/rivet-identity")>();
  return { ...actual, useRivetIdentity: () => state.identity };
});

vi.mock("@/lib/providers/app-providers", () => ({
  useApp: () => ({ signIn: vi.fn() }),
}));

vi.mock("@/lib/providers/experience-provider", () => ({
  useExperience: () => ({
    signInAsIdentity: vi.fn(),
    signInPlatformAdmin: state.signInPlatformAdmin,
  }),
}));

describe("IdentityPanel", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    state.replace.mockReset();
    state.signInPlatformAdmin.mockReset();
  });

  it("finishes the platform handoff after the branded transition", () => {
    render(<IdentityPanel />);

    expect(screen.getByText("Opening the platform console…")).toBeVisible();
    expect(state.signInPlatformAdmin).toHaveBeenCalledOnce();

    act(() => vi.advanceTimersByTime(900));

    expect(state.replace).toHaveBeenCalledWith("/platform");
  });
});
