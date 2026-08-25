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
  } as import("@/lib/auth/rivet-identity").RivetIdentity,
  replace: vi.fn(),
  signIn: vi.fn(),
  claimInvitation: vi.fn(),
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

vi.mock("convex/react", () => ({
  useAction: () => state.claimInvitation,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: state.replace }),
}));

vi.mock("@/lib/auth/rivet-identity", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/rivet-identity")>();
  return { ...actual, useRivetIdentity: () => state.identity };
});

vi.mock("@/lib/providers/app-providers", () => ({
  useApp: () => ({ signIn: state.signIn, signOut: state.signOutApp }),
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
    state.signIn.mockReset();
    state.claimInvitation.mockReset();
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
    } as import("@/lib/auth/rivet-identity").RivetIdentity;
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

  it("asks selected-scope staff to choose a branch before initializing the session", async () => {
    state.identity = {
      status: "ready",
      userId: "user-3",
      email: "staff@rivetjo.com",
      fullName: "Branch Staff",
      platformAdmin: false,
      gymAccessUnavailable: false,
      memberships: [{
        organizationId: "org-1",
        organizationName: "QA Gym",
        organizationSlug: "qa-gym",
        role: "receptionist",
        branchScope: "selected",
        branches: [
          { id: "branch-a", name: "Main", code: "MAIN" },
          { id: "branch-b", name: "Second", code: "SECOND" },
        ],
      }],
    } as import("@/lib/auth/rivet-identity").RivetIdentity;
    state.signIn.mockResolvedValue(undefined);

    render(<IdentityPanel />);

    expect(screen.getByText("Choose a branch workspace")).toBeVisible();
    expect(screen.getByRole("button", { name: /Main/ })).toBeVisible();
    expect(state.signIn).not.toHaveBeenCalled();

    await act(async () => {
      screen.getByRole("button", { name: /Second/ }).click();
      vi.advanceTimersByTime(900);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(state.signIn).toHaveBeenCalledWith("receptionist", "branch-b", { name: "Branch Staff", email: "staff@rivetjo.com" });
    expect(state.replace).toHaveBeenCalledWith("/reception");
  });

  it("keeps a staff portal account without a gym team out of member bootstrap", () => {
    state.identity = {
      status: "ready",
      userId: "user-no-gym",
      email: "unassigned@rivetjo.com",
      fullName: "Unassigned User",
      platformAdmin: false,
      gymAccessUnavailable: false,
      memberships: [],
    };

    render(<IdentityPanel audience="staff" />);

    expect(screen.getByText("This account is not on a gym team")).toBeVisible();
    expect(state.signIn).not.toHaveBeenCalled();
    expect(state.signInAsIdentity).not.toHaveBeenCalled();
    expect(state.replace).not.toHaveBeenCalled();
  });

  it("keeps a staff account with a gym membership on the staff route", async () => {
    state.identity = {
      status: "ready",
      userId: "user-staff",
      email: "staff@rivetjo.com",
      fullName: "Gym Staff",
      platformAdmin: false,
      gymAccessUnavailable: false,
      memberships: [{
        organizationId: "org-1",
        organizationName: "QA Gym",
        organizationSlug: "qa-gym",
        role: "manager",
        branchScope: "all",
        branches: [{ id: "branch-a", name: "Main", code: "MAIN" }],
      }],
    };
    state.signIn.mockResolvedValue(undefined);

    render(<IdentityPanel audience="staff" />);
    await act(async () => {
      vi.advanceTimersByTime(900);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(state.signIn).toHaveBeenCalledWith("manager", undefined, { name: "Gym Staff", email: "staff@rivetjo.com" });
    expect(state.replace).toHaveBeenCalledWith("/dashboard");
    expect(state.signInAsIdentity).not.toHaveBeenCalled();
  });

  it("does not elevate a gym or platform account from the member portal", () => {
    state.identity = {
      status: "ready",
      userId: "user-staff",
      email: "staff@rivetjo.com",
      fullName: "Gym Staff",
      platformAdmin: false,
      gymAccessUnavailable: false,
      memberships: [{ organizationId: "org-1", organizationName: "QA Gym", organizationSlug: "qa-gym", role: "owner", branchScope: "all", branches: [] }],
    };

    render(<IdentityPanel audience="member" />);

    expect(screen.getByText("This is the member portal")).toBeVisible();
    expect(state.signInAsIdentity).not.toHaveBeenCalled();
    expect(state.replace).not.toHaveBeenCalled();
  });

  it("attempts one provider-verified staff invitation reconciliation without member fallback", async () => {
    state.identity = {
      status: "ready",
      userId: "user-pending-staff",
      email: "pending@rivetjo.com",
      fullName: "Pending Staff",
      platformAdmin: false,
      gymAccessUnavailable: true,
      invitationClaimEligible: true,
      memberships: [],
    };
    state.claimInvitation.mockResolvedValue({ claimed: true });
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");

    render(<IdentityPanel audience="staff" />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(state.claimInvitation).toHaveBeenCalledOnce();
    expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({ type: "rivet:invitation-claimed" }));
    expect(state.signInAsIdentity).not.toHaveBeenCalled();
    dispatchSpy.mockRestore();
  });

  it("reconciles an eligible pending staff invitation from the generic account portal", async () => {
    state.identity = {
      status: "ready",
      userId: "user-pending-generic",
      email: "pending-generic@rivetjo.com",
      fullName: "Pending Generic Staff",
      platformAdmin: false,
      gymAccessUnavailable: true,
      invitationClaimEligible: true,
      memberships: [],
    };
    state.claimInvitation.mockResolvedValue({ claimed: false });

    render(<IdentityPanel audience="account" />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(state.claimInvitation).toHaveBeenCalledOnce();
    expect(screen.getByText("Your gym invitation could not be verified")).toBeVisible();
    expect(state.signInAsIdentity).not.toHaveBeenCalled();
    expect(state.replace).not.toHaveBeenCalled();
  });

  it("stays on an explicit staff-access error when invitation verification fails", async () => {
    state.identity = {
      status: "ready",
      userId: "user-pending-staff",
      email: "pending@rivetjo.com",
      fullName: "Pending Staff",
      platformAdmin: false,
      gymAccessUnavailable: true,
      invitationClaimEligible: true,
      memberships: [],
    };
    state.claimInvitation.mockResolvedValue({ claimed: false });

    render(<IdentityPanel audience="staff" />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText("Your gym invitation could not be verified")).toBeVisible();
    expect(state.signInAsIdentity).not.toHaveBeenCalled();
    expect(state.replace).not.toHaveBeenCalled();
  });
});
